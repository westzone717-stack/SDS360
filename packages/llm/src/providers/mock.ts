import type { TaskType, SdsExtractionResult, QuizGenerationResult, LlmResult, QuizGenerationOptions } from '../types';

const SDS_SECTIONS = [
  'identification', 'hazardIdentification', 'composition', 'firstAidMeasures',
  'fireFightingMeasures', 'accidentalReleaseMeasures', 'handlingAndStorage',
  'exposureControls', 'physicalAndChemicalProperties', 'stabilityAndReactivity',
  'toxicologicalInformation', 'ecologicalInformation', 'disposalConsiderations',
  'transportInformation', 'regulatoryInformation', 'otherInformation',
];

const SECTION_CONTENT: Record<string, string> = {
  identification: 'Product Name: [Mock Chemical]\nManufacturer: Mock Chemical Corp\nEmergency: 1-800-555-0000\nUse: Industrial solvent',
  hazardIdentification: 'GHS Classification: Flammable Liquid Cat. 2, Acute Tox. Cat. 4\nSignal Word: DANGER\nHazard Statements: H225, H302\nPictograms: Flame, Exclamation mark',
  composition: 'Chemical Name: Mock Solvent\nCAS No: 67-64-1\nConcentration: >99%\nImpurities: <0.1% water',
  firstAidMeasures: 'Inhalation: Move to fresh air. If breathing is difficult, give oxygen.\nSkin: Wash with soap and water for 15 minutes.\nEyes: Rinse with water for 15 minutes.\nIngestion: Do NOT induce vomiting. Call physician.',
  fireFightingMeasures: 'Suitable Extinguishing Media: CO2, dry chemical, foam.\nUnsuitable: Water jet.\nSpecial Hazards: Vapors may form explosive mixture with air.\nPPE: SCBA and full protective gear.',
  accidentalReleaseMeasures: 'Personal Protection: Remove ignition sources. Use personal protective equipment.\nEnvironmental: Prevent entry into drains and waterways.\nContainment: Absorb with inert material (sand, vermiculite).',
  handlingAndStorage: 'Handling: Keep away from heat, sparks, open flames. Use only in well-ventilated areas.\nStorage: Store in cool, dry, well-ventilated area. Keep container tightly closed.\nIncompatibles: Strong oxidizers, acids, bases.',
  exposureControls: 'OEL/PEL: TWA 500 ppm (OSHA PEL)\nEngineering Controls: Local exhaust ventilation.\nPPE: Safety glasses, chemical resistant gloves, lab coat.',
  physicalAndChemicalProperties: 'Appearance: Clear colorless liquid\nOdor: Characteristic sweet\npH: N/A\nFlash Point: -18°C\nBoiling Point: 56°C\nDensity: 0.79 g/mL',
  stabilityAndReactivity: 'Stability: Stable under normal conditions.\nConditions to Avoid: Heat, sparks, open flames.\nIncompatible Materials: Strong oxidizers, halogens.\nHazardous Decomposition: CO, CO2.',
  toxicologicalInformation: 'LD50 (oral, rat): 5800 mg/kg\nLC50 (inhalation, rat, 4h): 76 mg/L\nAcute Toxicity: Low\nChronic: Repeated exposure may cause CNS effects.',
  ecologicalInformation: 'Aquatic Toxicity: LC50 (fish, 96h): 8.3 mg/L\nPersistence: Readily biodegradable (BOD28: 80%)\nBioaccumulation: Log Pow = -0.24 (low potential)',
  disposalConsiderations: 'Waste Treatment: Incinerate in licensed facility.\nContaminated Packaging: Empty containers may retain residue. Follow local regulations.\nRegulations: Dispose in accordance with local, state, and federal regulations.',
  transportInformation: 'UN Number: UN1090\nProper Shipping Name: Acetone\nHazard Class: 3\nPacking Group: II\nEMS: F-E, S-D',
  regulatoryInformation: 'OSHA: Hazard Communication Standard (29 CFR 1910.1200)\nCARA: Listed\nTSCA: Listed on TSCA Inventory\nREACH: Pre-registered',
  otherInformation: 'Revision Date: 2024-01-01\nVersion: 1.0\nPrepared by: Mock Safety Dept\nThis SDS was generated in development/demo mode.',
};

export async function callMock(
  _prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  // Simulate ~500ms processing delay
  await new Promise((r) => setTimeout(r, 500));

  if (task === 'sds_extraction') {
    const sections: SdsExtractionResult['sections'] = {};
    for (const key of SDS_SECTIONS) {
      sections[key] = {
        content: SECTION_CONTENT[key] ?? `[Mock content for ${key}]`,
        confidence: 0.72 + Math.random() * 0.25, // 0.72–0.97
        sourceLocation: { page: Math.ceil(Math.random() * 10), excerpt: `...${key} information extracted...` },
      };
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
