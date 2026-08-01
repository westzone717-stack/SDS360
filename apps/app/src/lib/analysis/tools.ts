import mongoose from 'mongoose';
import {
  connectDb,
  SdsDocumentModel,
  QuizQuestionModel,
  TrainingRecordModel,
  UserModel,
} from '@sds360/db';
import { SDS_SCHEMA, SDS_SECTION_KEYS } from '@sds360/types';
import { z } from 'zod';

// ─── Tenant-scoped tool contract ───────────────────────────────────────────────
//
// `ToolContext.customerId` is the ONLY source of tenant scoping a tool is ever
// given. It is injected by the agent from the authenticated session — never
// from the LLM's plan, never from `args`. Every tool below builds its Mongo
// filter starting from `{ customerId }` and nothing in `args` can widen or
// bypass that filter, no matter what the LLM asks for.

export interface ToolContext {
  customerId: string;
}

export interface AnalysisTool {
  name: string;
  description: string;
  // Human-readable arg shape — shown to the LLM in the tool manifest so it
  // knows what it CAN ask for. This is documentation only; it is never used
  // to grant the LLM direct data access.
  argsShape: string;
  argsSchema: z.ZodTypeAny;
  execute: (ctx: ToolContext, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

function yearRange(year?: number): { $gte: Date; $lt: Date } | undefined {
  if (!year) return undefined;
  return { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) };
}

function cid(customerId: string) {
  return new mongoose.Types.ObjectId(customerId);
}

const yearArgsSchema = z.object({ year: z.number().int().optional() });

const getSdsOverview: AnalysisTool = {
  name: 'get_sds_overview',
  description: 'Counts of SDS documents in the library, broken down by hazard level and review status. Optionally filter by upload year.',
  argsShape: '{ year?: number }',
  argsSchema: yearArgsSchema,
  async execute(ctx, rawArgs) {
    await connectDb();
    const { year } = yearArgsSchema.parse(rawArgs);
    const created = yearRange(year);
    const match: Record<string, unknown> = { customerId: cid(ctx.customerId), status: { $ne: 'deleted' } };
    if (created) match.createdAt = created;

    const [byHazard, byReview, total] = await Promise.all([
      SdsDocumentModel.aggregate([{ $match: match }, { $group: { _id: '$hazardLevel', count: { $sum: 1 } } }]),
      SdsDocumentModel.aggregate([{ $match: match }, { $group: { _id: '$reviewStatus', count: { $sum: 1 } } }]),
      SdsDocumentModel.countDocuments(match),
    ]);

    return {
      totalDocuments: total,
      byHazardLevel: Object.fromEntries(byHazard.map((r) => [r._id, r.count])),
      byReviewStatus: Object.fromEntries(byReview.map((r) => [r._id, r.count])),
      year: year ?? null,
    };
  },
};

const getTrainingCompliance: AnalysisTool = {
  name: 'get_training_compliance',
  description: 'Training/certification compliance stats: how many staff are certified, expired, or have failed their most recent test. Optionally filter completions by year.',
  argsShape: '{ year?: number }',
  argsSchema: yearArgsSchema,
  async execute(ctx, rawArgs) {
    await connectDb();
    const { year } = yearArgsSchema.parse(rawArgs);
    const completed = yearRange(year);
    const customerId = cid(ctx.customerId);
    const now = new Date();

    const recordMatch: Record<string, unknown> = { customerId };
    if (completed) recordMatch.completedAt = completed;

    const [totalStaff, certified, expired, failed, latestPerUser] = await Promise.all([
      UserModel.countDocuments({ customerId, role: 'user', status: 'active' }),
      TrainingRecordModel.countDocuments({ ...recordMatch, pass: true, expiresAt: { $gt: now } }),
      TrainingRecordModel.countDocuments({ ...recordMatch, pass: true, expiresAt: { $lte: now } }),
      TrainingRecordModel.countDocuments({ ...recordMatch, pass: false }),
      TrainingRecordModel.aggregate([
        { $match: { customerId } },
        { $sort: { completedAt: -1 } },
        { $group: { _id: '$userId', pass: { $first: '$pass' }, expiresAt: { $first: '$expiresAt' } } },
      ]),
    ]);

    const neverTested = totalStaff - latestPerUser.length;

    return {
      totalStaff,
      certifiedCount: certified,
      expiredCount: expired,
      failedAttempts: failed,
      neverTested: Math.max(0, neverTested),
      complianceRatePercent: totalStaff > 0 ? Math.round((certified / totalStaff) * 100) : 0,
      year: year ?? null,
    };
  },
};

const getQuizBankHealth: AnalysisTool = {
  name: 'get_quiz_bank_health',
  description: 'Quiz question bank stats: counts by approval status and by difficulty, and average number of questions per SDS document.',
  argsShape: '{}',
  argsSchema: z.object({}),
  async execute(ctx) {
    await connectDb();
    const customerId = cid(ctx.customerId);

    const [byStatus, byDifficulty, totalQuestions, docsWithQuestions] = await Promise.all([
      QuizQuestionModel.aggregate([{ $match: { customerId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      QuizQuestionModel.aggregate([{ $match: { customerId } }, { $group: { _id: '$difficulty', count: { $sum: 1 } } }]),
      QuizQuestionModel.countDocuments({ customerId }),
      QuizQuestionModel.aggregate([{ $match: { customerId } }, { $group: { _id: '$sdsDocumentId' } }]),
    ]);

    return {
      totalQuestions,
      byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
      byDifficulty: Object.fromEntries(byDifficulty.map((r) => [r._id, r.count])),
      documentsWithQuestions: docsWithQuestions.length,
      avgQuestionsPerDocument: docsWithQuestions.length > 0
        ? Math.round((totalQuestions / docsWithQuestions.length) * 10) / 10
        : 0,
    };
  },
};

interface LeanSdsDoc {
  productName: string;
  supplier?: string;
  hazardLevel: string;
  sections: Record<string, { value?: string; values?: string[]; items?: Record<string, string>[] }>;
}

function sectionValue(doc: LeanSdsDoc, sectionKey: string): unknown {
  const section = doc.sections?.[sectionKey];
  if (!section) return null;
  if (section.items) return section.items;
  if (section.values) return section.values;
  return section.value ?? null;
}

const getSdsRiskProfile: AnalysisTool = {
  name: 'get_sds_risk_profile',
  description: 'The actual hazard/risk content extracted from SDS documents — hazardous ingredients (CAS numbers, concentrations, exposure limits), physical hazard classes, health effects, label color, and required PPE. Use this for any question about a product\'s specific dangers, not just document counts. Optionally filter to documents whose product name contains a given substring; omit to get every document (capped at 20, highest hazard level first).',
  argsShape: '{ productName?: string }',
  argsSchema: z.object({ productName: z.string().optional() }),
  async execute(ctx, rawArgs) {
    await connectDb();
    const { productName } = z.object({ productName: z.string().optional() }).parse(rawArgs);
    const match: Record<string, unknown> = { customerId: cid(ctx.customerId), status: { $ne: 'deleted' } };
    if (productName) match.productName = { $regex: productName, $options: 'i' };

    const hazardOrder: Record<string, number> = { extreme: 0, high: 1, medium: 2, low: 3 };
    const docs = (await SdsDocumentModel.find(match).limit(20).lean()) as unknown as LeanSdsDoc[];
    docs.sort((a, b) => (hazardOrder[a.hazardLevel] ?? 9) - (hazardOrder[b.hazardLevel] ?? 9));

    if (docs.length === 0) {
      return { matchCount: 0, products: [], note: productName ? `No SDS document found matching "${productName}"` : 'No SDS documents in the library' };
    }

    return {
      matchCount: docs.length,
      products: docs.map((doc) => ({
        productName: doc.productName,
        supplier: doc.supplier ?? null,
        hazardLevel: doc.hazardLevel,
        physicalState: sectionValue(doc, 'physicalState'),
        hazardousIngredients: sectionValue(doc, 'hazardousIngredients') ?? [],
        physicalHazardClasses: sectionValue(doc, 'physicalHazardClasses') ?? [],
        healthEffects: sectionValue(doc, 'healthEffects') ?? [],
        labelColor: sectionValue(doc, 'labelColor'),
        ppeRecommendations: sectionValue(doc, 'ppeRecommendations') ?? [],
      })),
    };
  },
};

const SECTION_KEY_LIST = SDS_SCHEMA.map((s) => `${s.key} (${s.label})`).join(', ');

const sdsSectionDetailsArgsSchema = z.object({
  productNames: z.array(z.string()).optional(),
  sectionKeys: z.array(z.string()).min(1).max(6),
});

const getSdsSectionDetails: AnalysisTool = {
  name: 'get_sds_section_details',
  description: `General-purpose SDS field reader. Give it one or more of the SDS sections and (optionally) a list of product names, and it returns the extracted value for those sections on those documents — use this any time you need specific SDS content that the other tools don't already summarize. Valid section keys: ${SECTION_KEY_LIST}.`,
  argsShape: '{ productNames?: string[], sectionKeys: string[] }',
  argsSchema: sdsSectionDetailsArgsSchema,
  async execute(ctx, rawArgs) {
    await connectDb();
    const { productNames, sectionKeys } = sdsSectionDetailsArgsSchema.parse(rawArgs);

    const validKeys = sectionKeys.filter((k) => (SDS_SECTION_KEYS as string[]).includes(k));
    if (validKeys.length === 0) {
      return { error: 'No valid sectionKeys provided', validSectionKeys: SDS_SECTION_KEYS };
    }

    const match: Record<string, unknown> = { customerId: cid(ctx.customerId), status: { $ne: 'deleted' } };
    if (productNames && productNames.length > 0) {
      match.$or = productNames.map((name) => ({ productName: { $regex: name, $options: 'i' } }));
    }

    const projection: Record<string, 1> = { productName: 1, supplier: 1, hazardLevel: 1 };
    for (const key of validKeys) projection[`sections.${key}`] = 1;

    const docs = (await SdsDocumentModel.find(match, projection).limit(10).lean()) as unknown as LeanSdsDoc[];

    if (docs.length === 0) {
      return { matchCount: 0, documents: [], note: productNames?.length ? `No SDS documents matched: ${productNames.join(', ')}` : 'No SDS documents in the library' };
    }

    return {
      matchCount: docs.length,
      requestedSections: validKeys,
      documents: docs.map((doc) => ({
        productName: doc.productName,
        supplier: doc.supplier ?? null,
        hazardLevel: doc.hazardLevel,
        sections: Object.fromEntries(validKeys.map((sectionKey) => [sectionKey, sectionValue(doc, sectionKey)])),
      })),
    };
  },
};

const getUserDirectorySummary: AnalysisTool = {
  name: 'get_user_directory_summary',
  description: 'User headcount broken down by role and status, optionally filtered to a single department.',
  argsShape: '{ department?: string }',
  argsSchema: z.object({ department: z.string().optional() }),
  async execute(ctx, rawArgs) {
    await connectDb();
    const { department } = z.object({ department: z.string().optional() }).parse(rawArgs);
    const customerId = cid(ctx.customerId);
    const match: Record<string, unknown> = { customerId };
    if (department) match.department = department;

    const [byRole, byStatus, total] = await Promise.all([
      UserModel.aggregate([{ $match: match }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
      UserModel.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      UserModel.countDocuments(match),
    ]);

    return {
      totalUsers: total,
      byRole: Object.fromEntries(byRole.map((r) => [r._id, r.count])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
      department: department ?? 'all',
    };
  },
};

export const TOOL_REGISTRY: Record<string, AnalysisTool> = {
  get_sds_overview: getSdsOverview,
  get_sds_risk_profile: getSdsRiskProfile,
  get_sds_section_details: getSdsSectionDetails,
  get_training_compliance: getTrainingCompliance,
  get_quiz_bank_health: getQuizBankHealth,
  get_user_directory_summary: getUserDirectorySummary,
};

// What the LLM is allowed to see: names, descriptions, arg shapes. No code,
// no DB access — the actual `execute` closures never leave the server.
export function getToolManifest(): Array<{ name: string; description: string; argsShape: string }> {
  return Object.values(TOOL_REGISTRY).map((t) => ({
    name: t.name,
    description: t.description,
    argsShape: t.argsShape,
  }));
}
