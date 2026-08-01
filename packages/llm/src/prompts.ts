import type { SdsExtractionResult, QuizGenerationResult } from './types';
import { SDS_SCHEMA, SDS_METADATA_FIELDS, SDS_INGREDIENT_FIELDS, EMPTY_INGREDIENT } from '@sds360/types';
import type { SdsSectionsMap, SdsSectionData, SdsMetadata, SdsIngredient } from '@sds360/types';

export function buildSdsPrompt(documentText: string): string {
  const metaList = SDS_METADATA_FIELDS.map((f) => `  - ${f.key} ("${f.label}")`).join('\n');

  const sectionBlocks = SDS_SCHEMA.map((section) => {
    if (section.type === 'ingredients') {
      const cols = section.ingredientFields!.map((f) => `${f.key} ("${f.label}")`).join(', ');
      return `${section.key} ("${section.label}") — a REPEATING LIST, one entry per hazardous component found in the "Hazardous Ingredients" table. Each entry has: ${cols}`;
    }
    const opts = section.options!.map((o) => `"${o.value}" (${o.label})`).join(', ');
    return `${section.key} ("${section.label}") — ${section.type === 'single_select' ? 'pick exactly ONE' : 'pick ALL that apply (zero or more)'} of: ${opts}`;
  }).join('\n\n');

  const ingredientShape = SDS_INGREDIENT_FIELDS.map((f) => `"${f.key}":"..."`).join(', ');
  const sectionsShape = SDS_SCHEMA.map((section) => {
    if (section.type === 'ingredients') {
      return `"${section.key}": {"items": [{${ingredientShape}}, ...], "confidence":0.0}`;
    }
    if (section.type === 'multi_select') {
      return `"${section.key}": {"values": ["optionValue", ...], "confidence":0.0}`;
    }
    return `"${section.key}": {"value":"optionValue", "confidence":0.0}`;
  }).join(', ');

  const metaShape = SDS_METADATA_FIELDS.map((f) => `"${f.key}":"..."`).join(', ');

  return `You are a hazardous materials safety expert. Extract the following from the SDS review-summary document text below.

Document metadata (plain text fields):
${metaList}

Sections (checklist-style — the document marks selections with a checkmark/highlight):
${sectionBlocks}

For the "hazardousIngredients" list, extract every distinct component listed under "Hazardous Ingredients" as one entry — do not skip or merge any, and do not invent ones not present.

For every other section, "confidence" is a float 0.0–1.0 (0.0 if nothing was selected/found, 0.85+ if clearly marked, lower if ambiguous). Use ONLY the option values given above — never invent new option values.

Return a single JSON object shaped exactly like this:
{
  "metadata": { ${metaShape} },
  "sections": { ${sectionsShape} }
}

Document text:
---
${documentText}
---

Respond with valid JSON only, no markdown, no commentary.`;
}

export function buildQuizPrompt(
  sdsContent: string,
  count = 5,
  existingQuestions: string[] = [],
): string {
  const avoidBlock =
    existingQuestions.length > 0
      ? `\n\nIMPORTANT — The following questions already exist in the quiz bank. Do NOT generate similar or duplicate questions:\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`
      : '';

  return `You are a workplace safety training expert. Generate ${count} multiple-choice quiz questions based on this Safety Data Sheet content. Each question must test knowledge critical for employee safety.${avoidBlock}

For each question provide:
- question: the question text
- options: array of exactly 4 answer strings
- correctIndex: 0-based index of the correct answer
- explanation: why that answer is correct
- difficulty: "basic", "advanced", or "expert"
- relatedSection: which SDS section this tests (e.g. "healthEffects")

SDS Content:
---
${sdsContent}
---

Return a JSON object with key "questions" containing an array of exactly ${count} question objects. Respond with valid JSON only.`;
}

function clampConfidence(v: unknown): number {
  return Math.max(0, Math.min(1, Number(v ?? 0)));
}

export function parseSdsResponse(text: string): Pick<SdsExtractionResult, 'metadata' | 'sections'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: Record<string, any> = {};
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }

  const rawMeta = raw.metadata ?? {};
  const metadata: SdsMetadata = {
    productName: String(rawMeta.productName ?? ''),
    supplier: String(rawMeta.supplier ?? ''),
    entityBusinessName: String(rawMeta.entityBusinessName ?? ''),
    quantity: String(rawMeta.quantity ?? ''),
    reviewDate: String(rawMeta.reviewDate ?? ''),
    reviewBy: String(rawMeta.reviewBy ?? ''),
  };

  const rawSections = raw.sections ?? {};
  const sections: SdsSectionsMap = {};
  for (const section of SDS_SCHEMA) {
    const rawSection = rawSections[section.key] ?? {};
    const confidence = clampConfidence(rawSection.confidence);

    const base: SdsSectionData = { confidence, fieldStatus: 'pending' };

    if (section.type === 'ingredients') {
      const rawItems = Array.isArray(rawSection.items) ? rawSection.items : [];
      base.items = rawItems.map((item: Record<string, unknown>) => {
        const ingredient: SdsIngredient = { ...EMPTY_INGREDIENT };
        for (const f of SDS_INGREDIENT_FIELDS) {
          (ingredient as unknown as Record<string, string>)[f.key] = String(item?.[f.key] ?? '');
        }
        return ingredient;
      });
    } else if (section.type === 'multi_select') {
      const rawValues = Array.isArray(rawSection.values) ? rawSection.values : [];
      const validValues = new Set(section.options!.map((o) => o.value));
      base.values = rawValues.filter((v: unknown) => typeof v === 'string' && validValues.has(v));
    } else {
      const validValues = new Set(section.options?.map((o) => o.value));
      const value = String(rawSection.value ?? '');
      base.value = section.type === 'single_select' && !validValues.has(value) ? '' : value;
    }

    sections[section.key] = base;
  }

  return { metadata, sections };
}

export function parseQuizResponse(text: string): Pick<QuizGenerationResult, 'questions'> {
  try {
    const raw = JSON.parse(text);
    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    return { questions };
  } catch {
    return { questions: [] };
  }
}

export function adjustConfidence(
  sections: SdsExtractionResult['sections'],
  weight: number
): SdsExtractionResult['sections'] {
  const adjusted: SdsSectionsMap = {};
  for (const [key, section] of Object.entries(sections)) {
    adjusted[key] = { ...section, confidence: section.confidence * weight };
  }
  return adjusted;
}
