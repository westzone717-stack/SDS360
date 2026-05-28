import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { connectDb, SdsDocumentModel, QuizQuestionModel, DeadLetterModel } from '@sds360/db';
import { routeWithFallback, AllProvidersFailedError } from '@sds360/llm';
import type { SdsExtractionResult, QuizGenerationResult } from '@sds360/llm';

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

    // In production: fetch document text from S3 and extract text
    // For now we use a placeholder — replace with actual PDF text extraction
    const documentText = `[Document text extracted from S3 key: ${doc.s3Key}]`;

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

const quizWorker = new Worker(
  'quiz-generation',
  async (job) => {
    const { sdsDocumentId, customerId } = job.data as { sdsDocumentId: string; customerId: string };
    console.log(`[quiz-generation] Processing sdsDocumentId=${sdsDocumentId}`);

    const doc = await SdsDocumentModel.findById(sdsDocumentId).lean();
    if (!doc) throw new Error(`SDS Document ${sdsDocumentId} not found`);

    // Build content summary for quiz generation
    const sdsContent = Object.entries(doc.sections ?? {})
      .map(([k, v]: [string, { content: string }]) => `## ${k}\n${v.content}`)
      .join('\n\n');

    try {
      const result = (await routeWithFallback(sdsContent, 'quiz_generation')) as QuizGenerationResult;

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
