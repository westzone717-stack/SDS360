import { config } from 'dotenv';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { connectDb, SdsDocumentModel, QuizQuestionModel, DeadLetterModel } from '@sds360/db';
import { routeWithFallback, AllProvidersFailedError } from '@sds360/llm';
import type { SdsExtractionResult, QuizGenerationResult } from '@sds360/llm';

const UPLOADS_DIR = resolve(__dirname, '../../uploads');
const IS_DEV_S3 = process.env.AWS_ACCESS_KEY_ID === 'placeholder';

// See apps/app/src/lib/s3.ts — omit `credentials` entirely outside of local
// dev so the AWS SDK's default provider chain picks up the ECS task's IAM
// role automatically instead of failing auth.
const explicitCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined;

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  ...(explicitCredentials ? { credentials: explicitCredentials } : {}),
});

const BUCKET = process.env.AWS_S3_BUCKET ?? 'sds360-documents';

async function readS3Object(key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of result.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function extractTextFromBuffer(buffer: Buffer, s3Key: string): Promise<string> {
  const ext = s3Key.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? '';
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    // Image OCR not implemented — fall back to filename
    return `[Image SDS — OCR not implemented for ${s3Key}]`;
  }
  // Assume plain text / docx — best-effort decode
  return buffer.toString('utf-8');
}

// Extract text from a document. Dev mode reads from the local uploads dir;
// production fetches the object from S3 (via the task's IAM role).
async function extractDocumentText(s3Key: string): Promise<string> {
  const buffer = IS_DEV_S3 ? await readFile(join(UPLOADS_DIR, s3Key)) : await readS3Object(s3Key);
  return extractTextFromBuffer(buffer, s3Key);
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

      // Auto-approve high-confidence fields, per discrete field (3-level: section → subsection → field)
      const sectionsUpdate: Record<string, unknown> = {};
      let fieldCount = 0;
      for (const [sectionKey, section] of Object.entries(result.sections)) {
        for (const [subKey, sub] of Object.entries(section.subsections)) {
          for (const [fieldKey, field] of Object.entries(sub.fields)) {
            const fieldStatus = field.confidence >= 0.85 ? 'ai_approved' : 'pending';
            sectionsUpdate[`sections.${sectionKey}.subsections.${subKey}.fields.${fieldKey}`] = {
              content: field.content,
              confidence: field.confidence,
              fieldStatus,
              sourceLocation: field.sourceLocation,
            };
            fieldCount++;
          }
        }
      }

      await SdsDocumentModel.findByIdAndUpdate(docId, {
        ...sectionsUpdate,
        modelUsed: result.modelUsed,
        reviewStatus: 'pending',
      });

      console.log(`[sds-extraction] Completed docId=${docId} via ${result.modelUsed} — ${fieldCount} fields extracted`);
    } catch (err) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (err instanceof AllProvidersFailedError && isFinalAttempt) {
        await DeadLetterModel.create({
          customerId,
          taskType: 'sds_extraction',
          payload: { docId },
          failedAt: new Date(),
          retryCount: job.attemptsMade,
          lastError: err.message,
        });
        console.error(`[sds-extraction] All providers failed for docId=${docId} after ${job.attemptsMade + 1} attempts — pushed to DLQ`);
      }
      throw err;
    }
  },
  {
    // NOTE: `attempts`/`backoff` are JOB options (BullMQ only reads them from
    // queue.add(...)), not Worker options — they do nothing here. The real
    // retry config lives on the producer side, in apps/app's queue.add() call.
    connection: redis,
    concurrency: 3,
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

    // Flatten the nested (section → subsection → field) content into a plain
    // text summary for quiz generation
    type FieldRecord = { content: string };
    type SectionRecord = { subsections: Record<string, { fields: Record<string, FieldRecord> }> };
    const sdsContent = Object.entries(doc.sections ?? {} as Record<string, SectionRecord>)
      .map(([sectionKey, section]) => {
        const fieldLines = Object.values(section.subsections ?? {})
          .flatMap((sub) => Object.entries(sub.fields ?? {}))
          .filter(([, field]) => field.content)
          .map(([fieldKey, field]) => `${fieldKey}: ${field.content}`)
          .join('\n');
        return `## ${sectionKey}\n${fieldLines}`;
      })
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
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (err instanceof AllProvidersFailedError && isFinalAttempt) {
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
    // See NOTE on sdsWorker above — attempts/backoff belong on queue.add(), not here.
    connection: redis,
    concurrency: 2,
  }
);

sdsWorker.on('completed', (job) => console.log(`[sds-extraction] Job ${job.id} completed`));
sdsWorker.on('failed', (job, err) => console.error(`[sds-extraction] Job ${job?.id} failed:`, err));
quizWorker.on('completed', (job) => console.log(`[quiz-generation] Job ${job.id} completed`));
quizWorker.on('failed', (job, err) => console.error(`[quiz-generation] Job ${job?.id} failed:`, err));

console.log('[workers] SDS extraction and quiz generation workers started');
