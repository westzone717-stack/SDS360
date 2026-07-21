import type { SdsExtractionResult, QuizGenerationResult } from './types';
import { SDS_SCHEMA, getSdsSection } from '@sds360/types';
import type { SdsSectionsMap, SdsSectionData } from '@sds360/types';

export const SDS_SECTIONS = SDS_SCHEMA.map((s) => s.key);

// Each main section (with all its subsections/fields) is extracted in its own
// LLM call — a single section can already contain 40+ discrete fields, so
// batching multiple sections together risks truncated JSON output.
export const SDS_SECTION_BATCHES: string[][] = SDS_SECTIONS.map((k) => [k]);

export function buildSdsPrompt(documentText: string, sectionsSubset?: string[]): string {
  const targetKeys = sectionsSubset ?? SDS_SECTIONS;
  const targetSections = targetKeys.map((k) => getSdsSection(k)).filter((s): s is NonNullable<typeof s> => !!s);

  const sectionBlocks = targetSections
    .map((section) => {
      const subsectionLines = section.subsections
        .map((sub) => {
          const fieldList = sub.fields.map((f) => `${f.key} ("${f.label}")`).join(', ');
          return `  - ${sub.key} ("${sub.label}"): ${fieldList}`;
        })
        .join('\n');
      return `${section.key} ("${section.label}"):\n${subsectionLines}`;
    })
    .join('\n\n');

  const shape = targetSections
    .map((section) => {
      const subShape = section.subsections
        .map((sub) => {
          const fieldShape = sub.fields.map((f) => `"${f.key}": {"content":"...","confidence":0.0,"sourceLocation":{"page":1,"excerpt":"..."}}`).join(', ');
          return `"${sub.key}": {${fieldShape}}`;
        })
        .join(', ');
      return `"${section.key}": {${subShape}}`;
    })
    .join(', ');

  return `You are a hazardous materials safety expert. Extract the following fields from the GHS Safety Data Sheet document text below.

Fields to extract, grouped by section and subsection:
${sectionBlocks}

For each field provide:
- content: the extracted text/value from the document (empty string "" if the field is not present)
- confidence: a float 0.0–1.0 (0.0 if missing, 0.85+ if clearly found, lower if unclear)
- sourceLocation: { page: number, excerpt: string } — page number and a short ~50 char snippet from the source (omit if content is empty)

Return a single JSON object shaped exactly like this (using the field keys given above):
{ ${shape} }

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
- relatedSection: which SDS section this tests (e.g. "firstAidMeasures")

SDS Content:
---
${sdsContent}
---

Return a JSON object with key "questions" containing an array of exactly ${count} question objects. Respond with valid JSON only.`;
}

export function parseSdsResponse(text: string, sectionsSubset?: string[]): Pick<SdsExtractionResult, 'sections'> {
  const targetKeys = sectionsSubset ?? SDS_SECTIONS;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: Record<string, any> = {};
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }

  const sections: SdsSectionsMap = {};
  for (const key of targetKeys) {
    const section = getSdsSection(key);
    if (!section) continue;

    const rawSection = raw[key] ?? {};
    const sectionData: SdsSectionData = { subsections: {} };

    for (const sub of section.subsections) {
      const rawSub = rawSection[sub.key] ?? {};
      const fields: SdsSectionData['subsections'][string]['fields'] = {};

      for (const field of sub.fields) {
        const val = rawSub[field.key] ?? {};
        fields[field.key] = {
          content: String(val.content ?? ''),
          confidence: Math.max(0, Math.min(1, Number(val.confidence ?? 0))),
          fieldStatus: 'pending',
          sourceLocation: val.sourceLocation,
        };
      }

      sectionData.subsections[sub.key] = { fields };
    }

    sections[key] = sectionData;
  }

  return { sections };
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
  for (const [sectionKey, section] of Object.entries(sections)) {
    const subsections: SdsSectionData['subsections'] = {};
    for (const [subKey, sub] of Object.entries(section.subsections)) {
      const fields: SdsSectionData['subsections'][string]['fields'] = {};
      for (const [fieldKey, field] of Object.entries(sub.fields)) {
        fields[fieldKey] = { ...field, confidence: field.confidence * weight };
      }
      subsections[subKey] = { fields };
    }
    adjusted[sectionKey] = { subsections };
  }
  return adjusted;
}
