// ─── Customer / Tenant ────────────────────────────────────────────────────────

export type PlanTier = 'starter' | 'professional' | 'enterprise';
export type CustomerStatus = 'active' | 'suspended' | 'cancelled';

export interface Customer {
  _id: string;
  name: string;
  domain?: string;
  plan: PlanTier;
  status: CustomerStatus;
  contractExpiresAt: Date;
  maxUsers: number;
  maxSdsDocuments: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'access_manager' | 'admin' | 'user';
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface User {
  _id: string;
  customerId: string;
  email: string;
  name: string;
  department?: string;
  role: UserRole;
  status: UserStatus;
  forcePasswordChange: boolean;
  visibleModules: string[];
  trainingStatus: TrainingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingStatus {
  required: boolean;
  reason?: 'first_login' | 'expired' | 'failed' | 'sds_updated';
  expiresAt?: Date;
}

// ─── SDS Document ─────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'ai_approved' | 'human_approved';
export type SdsStatus = 'active' | 'deactivated' | 'deleted';
export type HazardLevel = 'extreme' | 'high' | 'medium' | 'low';
export type LlmProvider = 'claude' | 'gpt' | 'ollama';

export interface SdsSection {
  content: string;
  confidence: number;
  fieldStatus: 'pending' | 'ai_approved' | 'human_approved';
  sourceLocation?: { page: number; excerpt: string };
}

export interface SdsDocument {
  _id: string;
  customerId: string;
  productName: string;
  casNumber?: string;
  hazardLevel: HazardLevel;
  s3Key: string;
  s3Bucket: string;
  version: number;
  isActive: boolean;
  status: SdsStatus;
  reviewStatus: ReviewStatus;
  modelUsed: LlmProvider;
  sections: {
    identification: SdsSection;
    hazardIdentification: SdsSection;
    composition: SdsSection;
    firstAidMeasures: SdsSection;
    fireFightingMeasures: SdsSection;
    accidentalReleaseMeasures: SdsSection;
    handlingAndStorage: SdsSection;
    exposureControls: SdsSection;
    physicalAndChemicalProperties: SdsSection;
    stabilityAndReactivity: SdsSection;
    toxicologicalInformation: SdsSection;
    ecologicalInformation: SdsSection;
    disposalConsiderations: SdsSection;
    transportInformation: SdsSection;
    regulatoryInformation: SdsSection;
    otherInformation: SdsSection;
  };
  uploadedBy: string;
  reviewedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Training / Quiz ──────────────────────────────────────────────────────────

export type QuestionDifficulty = 'basic' | 'advanced' | 'expert';
export type QuestionStatus =
  | 'ai_generated'
  | 'under_review'
  | 'force_review'
  | 'approved'
  | 'rejected';

export interface QuizQuestion {
  _id: string;
  customerId: string;
  sdsDocumentId: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: QuestionDifficulty;
  relatedSection: keyof SdsDocument['sections'];
  modelUsed: LlmProvider;
  status: QuestionStatus;
  qualityLabel?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingRecord {
  _id: string;
  customerId: string;
  userId: string;
  score: number;
  pass: boolean;
  totalQuestions: number;
  correctAnswers: number;
  answers: Array<{ questionId: string; selectedIndex: number; correct: boolean }>;
  attemptCount: number;
  completedAt: Date;
  expiresAt: Date;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'activate' | 'suspend'
  | 'login' | 'logout' | 'password_reset' | 'role_change';

export interface AuditLog {
  _id: string;
  customerId?: string;
  actorId: string;
  actorRole: UserRole;
  actorIp: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: Date;
}

// ─── LLM Health ───────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface LlmHealthStats {
  _id: string;
  provider: LlmProvider;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  cooldownUntil?: Date;
  lastCheckedAt: Date;
}

export interface DeadLetterQueueItem {
  _id: string;
  customerId: string;
  taskType: 'sds_extraction' | 'quiz_generation';
  payload: Record<string, unknown>;
  failedAt: Date;
  retryCount: number;
  lastError: string;
  resolvedAt?: Date;
}

// ─── API Response helpers ──────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Session extension ────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  customerId?: string;
  status: UserStatus;
  trainingRequired: boolean;
  forcePasswordChange: boolean;
}
