import { config } from 'dotenv';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { connectDb, SdsDocumentModel, QuizQuestionModel, DeadLetterModel } from '@sds360/db';
import { routeWithFallback, AllProvidersFailedError } from '@sds360/llm';
import type { SdsExtractionResult, QuizGenerationResult } from '@sds360/llm';

const UPLOADS_DIR = resolve(__dirname, '../../uploads');
const IS_DEV_S3 = process.env.AWS_ACCESS_KEY_ID === 'placeholder';

// Extract text from a document. In dev mode reads from local uploads dir;
// in production fetches from S3 (TODO).
async function extractDocumentText(s3Key: string): Promise<string> {
  if (!IS_DEV_S3) {
    // Production: fetch from S3 — left as TODO since we're in dev mode
    return `[S3 fetch not implemented for key: ${s3Key}]`;
  }

  const filePath = join(UPLOADS_DIR, s3Key);
  const buffer = await readFile(filePath);
  const ext = s3Key.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? '';
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    // Image OCR not implemented in dev — fall back to filename
    return `[Image SDS — OCR not implemented for ${s3Key}]`;
  }
  // Assume plain text / docx — best-effort decode
  return buffer.toString('utf-8');
}

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required for BullMQ
});

await connectDb();
console.log('[workers] Connected to MongoDB');

// ─── SDS Extraction Worker ────────────────────────────────────────────────────

const sdsWorker = new Worker(
  'sds-extraction',
  async (job) => {
    const { docId, customerId } = job.data as { docId: string; customerId: string };
    console.log(`[sds-extraction] Processing docId=${docId}`);

    const doc = await SdsDocumentModel.findById(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);

    let documentText: string;
    try {
      documentText = await extractDocumentText(doc.s3Key);
      console.log(`[sds-extraction] Extracted ${documentText.length} chars from ${doc.s3Key}`);
    } catch (e) {
      console.error(`[sds-extraction] Failed to read file ${doc.s3Key}:`, e);
      throw e;
    }

    // Truncate very long documents to fit in context window
    if (documentText.length > 60_000) documentText = documentText.slice(0, 60_000);
    console.log(`[sds-extraction] PDF preview (first 300 chars):`, documentText.substring(0, 300));

    try {
      const result = (await routeWithFallback(documentText, 'sds_extraction')) as SdsExtractionResult;

      // Auto-approve high-confidence fields
      const sectionsUpdate: Record<string, unknown> = {};
      for (const [key, section] of Object.entries(result.sections)) {
        const fieldStatus = section.confidence >= 0.85
          ? 'ai_approved'
          : 'pending';
        sectionsUpdate[`sections.${key}`] = {
          content: section.content,
          confidence: section.confidence,
          fieldStatus,
          sourceLocation: section.sourceLocation,
        };
      }

      await SdsDocumentModel.findByIdAndUpdate(docId, {
        ...sectionsUpdate,
        modelUsed: result.modelUsed,
        reviewStatus: 'pending',
      });

      console.log(`[sds-extraction] Completed docId=${docId} via ${result.modelUsed}`);
    } catch (err) {
      if (err instanceof AllProvidersFailedError) {
        await DeadLetterModel.create({
          customerId,
          taskType: 'sds_extraction',
          payload: { docId },
          failedAt: new Date(),
          retryCount: job.attemptsMade,
          lastError: err.message,
        });
        console.error(`[sds-extraction] All providers failed for docId=${docId} — pushed to DLQ`);
      }
      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 3,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  }
);

// ─── Quiz Generation Worker ───────────────────────────────────────────────────

const MAX_QUIZ_QUESTIONS = 25;

const quizWorker = new Worker(
  'quiz-generation',
  async (job) => {
    const { sdsDocumentId, customerId, count } = job.data as {
      sdsDocumentId: string;
      customerId: string;
      count: number;
    };
    console.log(`[quiz-generation] Processing sdsDocumentId=${sdsDocumentId} count=${count}`);

    const doc = await SdsDocumentModel.findById(sdsDocumentId).lean();
    if (!doc) throw new Error(`SDS Document ${sdsDocumentId} not found`);

    // Fetch existing non-rejected questions for duplicate avoidance and max enforcement
    const existingDocs = await QuizQuestionModel.find({
      sdsDocumentId,
      customerId,
      status: { $ne: 'rejected' },
    })
      .select('question')
      .lean<Array<{ question: string }>>();

    const remaining = MAX_QUIZ_QUESTIONS - existingDocs.length;
    if (remaining <= 0) {
      console.log(`[quiz-generation] Max questions reached for sdsDocumentId=${sdsDocumentId} — skipping`);
      return;
    }

    const toGenerate = Math.min(count ?? 5, remaining);
    const existingQuestions = existingDocs.map((q) => q.question);

    // Build content summary for quiz generation
    const sdsContent = Object.entries(doc.sections ?? {})
      .map(([k, v]: [string, { content: string }]) => `## ${k}\n${v.content}`)
      .join('\n\n');

    try {
      const result = (await routeWithFallback(sdsContent, 'quiz_generation', {
        count: toGenerate,
        existingQuestions,
      })) as QuizGenerationResult;

      for (const q of result.questions) {
        await QuizQuestionModel.create({
          customerId,
          sdsDocumentId,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          difficulty: q.difficulty,
          relatedSection: q.relatedSection,
          modelUsed: result.modelUsed,
          status: result.forceReview ? 'force_review' : 'ai_generated',
        });
      }

      console.log(`[quiz-generation] Created ${result.questions.length} questions via ${result.modelUsed}`);
    } catch (err) {
      if (err instanceof AllProvidersFailedError) {
        await DeadLetterModel.create({
          customerId,
          taskType: 'quiz_generation',
          payload: { sdsDocumentId },
          failedAt: new Date(),
          retryCount: job.attemptsMade,
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 2,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  }
);

sdsWorker.on('completed', (job) => console.log(`[sds-extraction] Job ${job.id} completed`));
sdsWorker.on('failed', (job, err) => console.error(`[sds-extraction] Job ${job?.id} failed:`, err));
quizWorker.on('completed', (job) => console.log(`[quiz-generation] Job ${job.id} completed`));
quizWorker.on('failed', (job, err) => console.error(`[quiz-generation] Job ${job?.id} failed:`, err));

console.log('[workers] SDS extraction and quiz generation workers started');
