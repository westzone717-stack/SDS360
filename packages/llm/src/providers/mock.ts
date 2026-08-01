import type { TaskType, SdsExtractionResult, QuizGenerationResult, LlmResult, QuizGenerationOptions } from '../types';
import { SDS_SCHEMA } from '@sds360/types';
import type { SdsSectionsMap, SdsSectionData, SdsMetadata } from '@sds360/types';

const MOCK_METADATA: SdsMetadata = {
  productName: 'Mock Chemical',
  supplier: 'Mock Chemical Corp',
  entityBusinessName: 'Mock Chemical Corp',
  quantity: '(Based on company\'s inventory)',
  reviewDate: new Date().toISOString().slice(0, 10),
  reviewBy: 'Mock Reviewer',
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
      const confidence = 0.72 + Math.random() * 0.25; // 0.72–0.97
      const base: SdsSectionData = { confidence, fieldStatus: 'pending' };
      if (section.type === 'ingredients') {
        base.items = [{
          casNumber: '67-64-1', component: 'Acetone', concentration: '>= 80 - < 100 *',
          acgihTlvTwa: '250 ppm', acgihTlvStel: '500 ppm', acgihTlvC: '',
          mbOelTwa: '250 ppm', mbOelStel: '500 ppm', mbOelC: '',
        }];
      } else if (section.type === 'multi_select') {
        base.values = section.options!.slice(0, 2).map((o) => o.value);
      } else {
        base.value = section.options![0]?.value ?? '';
      }
      sections[section.key] = base;
    }
    return { metadata: MOCK_METADATA, sections, modelUsed: 'claude', confidenceAdjusted: false } satisfies SdsExtractionResult;
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
