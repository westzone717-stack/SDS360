import type { SdsExtractionResult, QuizGenerationResult } from './types';

export const SDS_SECTIONS = [
  'identification', 'hazardIdentification', 'composition', 'firstAidMeasures',
  'fireFightingMeasures', 'accidentalReleaseMeasures', 'handlingAndStorage',
  'exposureControls', 'physicalAndChemicalProperties', 'stabilityAndReactivity',
  'toxicologicalInformation', 'ecologicalInformation', 'disposalConsiderations',
  'transportInformation', 'regulatoryInformation', 'otherInformation',
];

// Split 16 sections into 4 batches of 4 to keep each LLM response under the token limit
export const SDS_SECTION_BATCHES: string[][] = [
  SDS_SECTIONS.slice(0, 4),
  SDS_SECTIONS.slice(4, 8),
  SDS_SECTIONS.slice(8, 12),
  SDS_SECTIONS.slice(12, 16),
];

const SECTION_HUMAN_LABELS: Record<string, string> = {
  identification: '1. Identification (product name, manufacturer, emergency contact, intended use)',
  hazardIdentification: '2. Hazard(s) Identification (GHS classification, signal word, hazard statements, precautions, pictograms)',
  composition: '3. Composition / Ingredients (chemical names, CAS numbers, concentration, impurities)',
  firstAidMeasures: '4. First-Aid Measures (inhalation, skin, eyes, ingestion procedures)',
  fireFightingMeasures: '5. Fire-Fighting Measures (suitable extinguishers, special hazards, PPE)',
  accidentalReleaseMeasures: '6. Accidental Release Measures (personal protection, containment, cleanup)',
  handlingAndStorage: '7. Handling and Storage (safe handling, storage conditions, incompatibles)',
  exposureControls: '8. Exposure Controls / Personal Protection (OEL, engineering controls, PPE)',
  physicalAndChemicalProperties: '9. Physical and Chemical Properties (appearance, pH, flash point, boiling point, etc.)',
  stabilityAndReactivity: '10. Stability and Reactivity (stability, hazardous reactions, conditions to avoid, decomposition)',
  toxicologicalInformation: '11. Toxicological Information (LD50, LC50, acute/chronic toxicity, carcinogenicity)',
  ecologicalInformation: '12. Ecological Information (aquatic toxicity, persistence, bioaccumulation)',
  disposalConsiderations: '13. Disposal Considerations (waste treatment, contaminated packaging, regulations)',
  transportInformation: '14. Transport Information (UN number, proper shipping name, hazard class, packing group)',
  regulatoryInformation: '15. Regulatory Information (applicable safety/health/environmental regulations)',
  otherInformation: '16. Other Information (revision history, references, additional notes)',
};

export function buildSdsPrompt(documentText: string, sectionsSubset?: string[]): string {
  const targetSections = sectionsSubset ?? SDS_SECTIONS;
  const sectionList = targetSections.map((k) => `- ${k}: ${SECTION_HUMAN_LABELS[k] ?? k}`).join('\n');

  return `You are a hazardous materials safety expert. Extract the following GHS SDS sections from the document text below.

Sections to extract (${targetSections.length} total):
${sectionList}

For each section provide:
- content: the extracted text from the document (empty string "" if section is missing)
- confidence: a float 0.0–1.0 (0.0 if missing, 0.85+ if clearly found, lower if unclear)
- sourceLocation: { page: number, excerpt: string } — page number and a short ~50 char snippet from the source

Return a JSON object with EXACTLY these top-level keys: ${targetSections.join(', ')}
Each value: { "content": "...", "confidence": 0.0–1.0, "sourceLocation": { "page": 1, "excerpt": "..." } }

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
  const targetSections = sectionsSubset ?? SDS_SECTIONS;
  try {
    const raw = JSON.parse(text);
    const sections: SdsExtractionResult['sections'] = {};
    for (const key of targetSections) {
      const val = raw[key] ?? {};
      sections[key] = {
        content: String(val.content ?? ''),
        confidence: Math.max(0, Math.min(1, Number(val.confidence ?? 0))),
        sourceLocation: val.sourceLocation,
      };
    }
    return { sections };
  } catch {
    const sections: SdsExtractionResult['sections'] = {};
    for (const key of targetSections) {
      sections[key] = { content: '', confidence: 0 };
    }
    return { sections };
  }
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
  return Object.fromEntries(
    Object.entries(sections).map(([k, v]) => [k, { ...v, confidence: v.confidence * weight }])
  );
}
