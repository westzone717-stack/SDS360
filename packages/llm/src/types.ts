import type { LlmProvider, SdsSectionsMap, SdsMetadata } from '@sds360/types';

export type TaskType = 'sds_extraction' | 'quiz_generation';

export interface SdsExtractionResult {
  metadata: SdsMetadata;
  // sections.<sectionKey> = { value | values | items, confidence, sourceLocation }
  sections: SdsSectionsMap;
  modelUsed: LlmProvider;
  confidenceAdjusted: boolean;
}

export interface QuizGenerationResult {
  questions: Array<{
    question: string;
    options: [string, string, string, string];
    correctIndex: number;
    explanation: string;
    difficulty: 'basic' | 'advanced' | 'expert';
    relatedSection: string;
  }>;
  modelUsed: LlmProvider;
  forceReview: boolean;
}

export type LlmResult = SdsExtractionResult | QuizGenerationResult;

export interface QuizGenerationOptions {
  count: number;
  existingQuestions: string[];
}

export interface ProviderConfig {
  name: LlmProvider;
  weight: number;
  call: (content: string, task: TaskType, quizOptions?: QuizGenerationOptions) => Promise<LlmResult>;
}

export class AllProvidersFailedError extends Error {
  constructor() {
    super('All LLM providers failed — task pushed to dead letter queue');
    this.name = 'AllProvidersFailedError';
  }
}
