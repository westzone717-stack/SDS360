import type { LlmProvider } from '@sds360/types';

export type TaskType = 'sds_extraction' | 'quiz_generation';

export interface SdsExtractionResult {
  sections: Record<string, { content: string; confidence: number; sourceLocation?: { page: number; excerpt: string } }>;
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

export interface ProviderConfig {
  name: LlmProvider;
  weight: number;
  call: (prompt: string, task: TaskType) => Promise<LlmResult>;
}

export class AllProvidersFailedError extends Error {
  constructor() {
    super('All LLM providers failed — task pushed to dead letter queue');
    this.name = 'AllProvidersFailedError';
  }
}
