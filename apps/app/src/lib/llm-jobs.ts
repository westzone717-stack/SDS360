// SDS extraction and quiz generation, run synchronously inside the API request
// that triggers them. These used to be BullMQ jobs processed by a separate
// worker container (workers/src/index.ts); everything now runs on Vercel.

import path from 'path';
import { readFile } from 'fs/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { connectDb, SdsDocumentModel, QuizQuestionModel, DeadLetterModel } from '@sds360/db';
import { routeWithFallback, AllProvidersFailedError } from '@sds360/llm';
import type { SdsExtractionResult, QuizGenerationResult } from '@sds360/llm';
import { s3, BUCKET } from '@/lib/s3';

const IS_DEV_S3 = process.env.AWS_ACCESS_KEY_ID === 'placeholder';
const MAX_DOCUMENT_CHARS = 60_000;
export const MAX_QUIZ_QUESTIONS = 25;

export class JobError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

async function readDocument(s3Key: string): Promise<Buffer> {
  if (IS_DEV_S3) {
    // Local dev: files saved by /api/sds/dev-upload under <project-root>/uploads
    return readFile(path.join(path.resolve(process.cwd(), '../../uploads'), s3Key));
  }
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  return Buffer.from(await result.Body!.transformToByteArray());
}

async function extractText(buffer: Buffer, s3Key: string): Promise<string> {
  const ext = s3Key.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    // unpdf is pdfjs built for serverless: unlike pdf-parse it doesn't need the
    // native @napi-rs/canvas module (which Vercel's bundle doesn't include) to
    // polyfill DOMMatrix, so text extraction works inside a Vercel function.
    const { extractText: extractPdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      return (await extractPdfText(pdf, { mergePages: true })).text;
    } finally {
      await pdf.cleanup();
    }
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    return `[Image SDS — OCR not implemented for ${s3Key}]`;
  }
  // Plain text / docx — best-effort decode
  return buffer.toString('utf-8');
}

async function recordDeadLetter(
  customerId: string,
  taskType: 'sds_extraction' | 'quiz_generation',
  payload: Record<string, string>,
  err: unknown,
) {
  try {
    await DeadLetterModel.create({
      customerId,
      taskType,
      payload,
      failedAt: new Date(),
      retryCount: 0,
      lastError: err instanceof Error ? err.message : String(err),
    });
  } catch (dlqErr) {
    console.error('[llm-jobs] Failed to record dead letter:', dlqErr);
  }
}

/** Reads the uploaded document, extracts its fields with the LLM, and saves them. */
export async function runSdsExtraction(docId: string, customerId: string, budgetMs: number) {
  await connectDb();
  const doc = await SdsDocumentModel.findOne({ _id: docId, customerId });
  if (!doc) throw new JobError('Document not found', 404);

  try {
    return await extractAndSave(doc, docId, customerId, budgetMs);
  } catch (err) {
    // Mark the failure so re-uploading the same file can replace this record
    await SdsDocumentModel.updateOne({ _id: docId }, { extractionFailedAt: new Date() }).catch(() => {});
    throw err;
  }
}

async function extractAndSave(
  doc: { s3Key: string; productName?: string },
  docId: string,
  customerId: string,
  budgetMs: number,
) {
  let text = await extractText(await readDocument(doc.s3Key), doc.s3Key);
  console.log(`[sds-extraction] Extracted ${text.length} chars from ${doc.s3Key}`);
  if (text.length > MAX_DOCUMENT_CHARS) text = text.slice(0, MAX_DOCUMENT_CHARS);

  let result: SdsExtractionResult;
  try {
    result = (await routeWithFallback(text, 'sds_extraction', undefined, budgetMs)) as SdsExtractionResult;
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      await recordDeadLetter(customerId, 'sds_extraction', { docId }, err);
      throw new JobError('AI extraction failed on every provider. Please try again later.', 502);
    }
    throw err;
  }

  // Auto-approve high-confidence sections; metadata fields are plain text
  // (no confidence tracking) and are always written as extracted.
  const sectionsUpdate: Record<string, unknown> = {};
  for (const [sectionKey, section] of Object.entries(result.sections)) {
    const fieldStatus = section.confidence >= 0.85 ? 'ai_approved' : 'pending';
    sectionsUpdate[`sections.${sectionKey}`] = { ...section, fieldStatus };
  }

  await SdsDocumentModel.findByIdAndUpdate(docId, {
    ...sectionsUpdate,
    productName: result.metadata.productName || doc.productName,
    supplier: result.metadata.supplier,
    entityBusinessName: result.metadata.entityBusinessName,
    quantity: result.metadata.quantity,
    reviewDate: result.metadata.reviewDate,
    reviewBy: result.metadata.reviewBy,
    modelUsed: result.modelUsed,
    reviewStatus: 'pending',
    $unset: { extractionFailedAt: 1 },
  });

  console.log(`[sds-extraction] Completed docId=${docId} via ${result.modelUsed}`);
  return { modelUsed: result.modelUsed, sectionCount: Object.keys(sectionsUpdate).length };
}

type SectionRecord = { value?: string; values?: string[]; items?: Record<string, string>[] };

/** Generates up to `count` new quiz questions for an approved SDS and saves them. */
export async function runQuizGeneration(sdsDocumentId: string, customerId: string, count: number, budgetMs: number) {
  await connectDb();
  const doc = await SdsDocumentModel.findOne({ _id: sdsDocumentId, customerId }).lean<{
    productName?: string;
    supplier?: string;
    entityBusinessName?: string;
    sections?: Record<string, SectionRecord>;
  }>();
  if (!doc) throw new JobError('SDS document not found', 404);

  // Existing non-rejected questions, for duplicate avoidance and the per-document cap
  const existing = await QuizQuestionModel.find({ sdsDocumentId, customerId, status: { $ne: 'rejected' } })
    .select('question')
    .lean<Array<{ question: string }>>();
  const remaining = MAX_QUIZ_QUESTIONS - existing.length;
  if (remaining <= 0) {
    throw new JobError(`Maximum of ${MAX_QUIZ_QUESTIONS} questions per document already reached.`, 400);
  }

  // Flatten the section data (single_select value / multi_select values /
  // ingredients rows) into a plain text summary for quiz generation
  const metaLines = [
    `Product name: ${doc.productName ?? ''}`,
    `Supplier: ${doc.supplier ?? ''}`,
    `Entity/Business Name: ${doc.entityBusinessName ?? ''}`,
  ].join('\n');
  const sectionLines = Object.entries(doc.sections ?? {})
    .map(([sectionKey, section]) => {
      let body = '';
      if (section.items) {
        body = section.items.map((item) => Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(', ')).join('\n');
      } else if (section.values) {
        body = section.values.join(', ');
      } else if (section.value) {
        body = section.value;
      }
      return body ? `## ${sectionKey}\n${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  let result: QuizGenerationResult;
  try {
    result = (await routeWithFallback(
      `${metaLines}\n\n${sectionLines}`,
      'quiz_generation',
      { count: Math.min(count, remaining), existingQuestions: existing.map((q) => q.question) },
      budgetMs,
    )) as QuizGenerationResult;
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      await recordDeadLetter(customerId, 'quiz_generation', { sdsDocumentId }, err);
      throw new JobError('AI question generation failed on every provider. Please try again later.', 502);
    }
    throw err;
  }

  const questions = result.questions.slice(0, remaining);
  await QuizQuestionModel.insertMany(
    questions.map((q) => ({
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
    })),
  );

  console.log(`[quiz-generation] Created ${questions.length} questions via ${result.modelUsed}`);
  return { created: questions.length, modelUsed: result.modelUsed };
}
