import type { TaskType, SdsExtractionResult, QuizGenerationResult, LlmResult, QuizGenerationOptions } from '../types';
import { SDS_SCHEMA } from '@sds360/types';
import type { SdsSectionsMap, SdsSectionData } from '@sds360/types';

// A handful of representative sample values, keyed by field key, used to make
// the mock extraction look plausible. Any field not listed here gets a
// generic placeholder so every one of the ~400 fields still has content.
const SAMPLE_VALUES: Record<string, string> = {
  productName: 'Mock Chemical',
  productIdentifier: 'Mock Chemical',
  manufacturerName: 'Mock Chemical Corp',
  supplierName: 'Mock Chemical Corp',
  emergencyPhone: '1-800-555-0000',
  recommendedUse: 'Industrial solvent',
  ghsClassification: 'Flammable Liquid Cat. 2, Acute Tox. Cat. 4',
  signalWord: 'DANGER',
  hazardStatements: 'H225, H302',
  chemicalName: 'Mock Solvent',
  casNumber: '67-64-1',
  concentration: '>99%',
  inhalation: 'Move to fresh air. If breathing is difficult, give oxygen.',
  skinContact: 'Wash with soap and water for 15 minutes.',
  eyeContact: 'Rinse with water for 15 minutes.',
  ingestion: 'Do NOT induce vomiting. Call physician.',
  suitableExtinguishingMedia: 'CO2, dry chemical, foam.',
  unsuitableExtinguishingMedia: 'Water jet.',
  appearance: 'Clear colorless liquid',
  odor: 'Characteristic sweet',
  ph: 'N/A',
  flashPoint: '-18°C',
  boilingPoint: '56°C',
  density: '0.79 g/mL',
  stabilityStatus: 'Stable under normal conditions.',
  ld50: '5800 mg/kg (oral, rat)',
  lc50: '76 mg/L (inhalation, rat, 4h)',
  aquaticToxicity: 'LC50 (fish, 96h): 8.3 mg/L',
  wasteTreatmentMethod: 'Incinerate in licensed facility.',
  unNumber: 'UN1090',
  properShippingName: 'Acetone',
  transportHazardClass: '3',
  packingGroup: 'II',
  oshaClassification: 'Hazard Communication Standard (29 CFR 1910.1200)',
  revisionDate: '2024-01-01',
  version: '1.0',
  preparedBy: 'Mock Safety Dept',
};

export async function callMock(
  _prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  // Simulate ~500ms processing delay
  await new Promise((r) => setTimeout(r, 500));

  if (task === 'sds_extraction') {
    const sections: SdsSectionsMap = {};
    for (const section of SDS_SCHEMA) {
      const subsections: SdsSectionData['subsections'] = {};
      for (const sub of section.subsections) {
        const fields: SdsSectionData['subsections'][string]['fields'] = {};
        for (const field of sub.fields) {
          const sample = SAMPLE_VALUES[field.key];
          fields[field.key] = {
            content: sample ?? `[Mock ${field.label}]`,
            confidence: 0.72 + Math.random() * 0.25, // 0.72–0.97
            fieldStatus: 'pending',
            sourceLocation: { page: Math.ceil(Math.random() * 10), excerpt: `...${field.label} information...` },
          };
        }
        subsections[sub.key] = { fields };
      }
      sections[section.key] = { subsections };
    }
    return { sections, modelUsed: 'claude', confidenceAdjusted: false } satisfies SdsExtractionResult;
  }

  // quiz_generation
  const questions: QuizGenerationResult['questions'] = [
    {
      question: 'What is the flash point of this chemical?',
      options: ['-18°C', '0°C', '56°C', '100°C'],
      correctIndex: 0,
      explanation: 'The flash point is -18°C, making it a highly flammable liquid (Category 2).',
      difficulty: 'basic',
      relatedSection: 'physicalAndChemicalProperties',
    },
    {
      question: 'What should you do if this chemical is inhaled?',
      options: ['Stay in the area', 'Move to fresh air immediately', 'Drink water', 'Apply heat'],
      correctIndex: 1,
      explanation: 'Move the person to fresh air immediately. If breathing difficulties persist, provide oxygen.',
      difficulty: 'basic',
      relatedSection: 'firstAidMeasures',
    },
    {
      question: 'Which extinguishing media is NOT suitable for this chemical?',
      options: ['CO2', 'Dry chemical', 'Foam', 'Water jet'],
      correctIndex: 3,
      explanation: 'Water jet is not suitable as it can spread the burning liquid and increase the fire.',
      difficulty: 'advanced',
      relatedSection: 'fireFightingMeasures',
    },
    {
      question: 'What is the UN number for transporting this chemical?',
      options: ['UN1090', 'UN1203', 'UN1263', 'UN1170'],
      correctIndex: 0,
      explanation: 'UN1090 is the UN number for Acetone, Hazard Class 3, Packing Group II.',
      difficulty: 'expert',
      relatedSection: 'transportInformation',
    },
    {
      question: 'What PPE is required when handling this chemical?',
      options: [
        'No PPE needed',
        'Safety glasses only',
        'Safety glasses, chemical resistant gloves, lab coat',
        'Full face shield and SCBA only',
      ],
      correctIndex: 2,
      explanation: 'The SDS specifies safety glasses, chemical resistant gloves, and lab coat as minimum PPE.',
      difficulty: 'basic',
      relatedSection: 'exposureControls',
    },
  ];

  const count = quizOptions?.count ?? 5;
  const selected: QuizGenerationResult['questions'] = [];
  for (let i = 0; i < count; i++) selected.push(questions[i % questions.length]);

  return { questions: selected, modelUsed: 'claude', forceReview: false } satisfies QuizGenerationResult;
}
