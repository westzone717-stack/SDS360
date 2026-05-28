import type { SdsExtractionResult, QuizGenerationResult } from './types';

const SDS_SECTIONS = [
  'identification', 'hazardIdentification', 'composition', 'firstAidMeasures',
  'fireFightingMeasures', 'accidentalReleaseMeasures', 'handlingAndStorage',
  'exposureControls', 'physicalAndChemicalProperties', 'stabilityAndReactivity',
  'toxicologicalInformation', 'ecologicalInformation', 'disposalConsiderations',
  'transportInformation', 'regulatoryInformation', 'otherInformation',
];

export function buildSdsPrompt(documentText: string): string {
  return `You are a hazardous materials safety expert. Extract all 16 GHS SDS sections from the following document text. For each section, provide:
- content: the extracted text (empty string if missing)
- confidence: a float 0.0–1.0 representing extraction confidence
- sourceLocation: { page: number, excerpt: string } for the source passage

Return a JSON object with keys: ${SDS_SECTIONS.join(', ')}

Each value must be: { "content": "...", "confidence": 0.0–1.0, "sourceLocation": { "page": 1, "excerpt": "..." } }

If a section is missing from the document, set confidence to 0 and content to "".

Document text:
---
${documentText}
---

Respond with valid JSON only, no markdown.`;
}

export function buildQuizPrompt(sdsContent: string): string {
  return `You are a workplace safety training expert. Generate 5 multiple-choice quiz questions based on this Safety Data Sheet content. Each question must test knowledge critical for employee safety.

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

Return a JSON object with key "questions" containing an array of 5 question objects. Respond with valid JSON only.`;
}

export function parseSdsResponse(text: string): Pick<SdsExtractionResult, 'sections'> {
  try {
    const raw = JSON.parse(text);
    const sections: SdsExtractionResult['sections'] = {};
    for (const key of SDS_SECTIONS) {
      const val = raw[key] ?? {};
      sections[key] = {
        content: String(val.content ?? ''),
        confidence: Math.max(0, Math.min(1, Number(val.confidence ?? 0))),
        sourceLocation: val.sourceLocation,
      };
    }
    return { sections };
  } catch {
    // Return all sections with zero confidence on parse failure
    const sections: SdsExtractionResult['sections'] = {};
    for (const key of SDS_SECTIONS) {
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
