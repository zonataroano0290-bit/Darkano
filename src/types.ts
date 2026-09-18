export type WorkspaceMode = 'chat' | 'code' | 'research' | 'analyze' | 'agent';

export type AgentTaskStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting_for_tool'
  | 'waiting_for_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentStepStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export interface PlannedStep {
  sequence: number;
  action: string;
  tool?: string;
  input?: any;
  description?: string;
  requiresApproval?: boolean;
}

export interface AgentTaskStep {
  id: string;
  taskId: string;
  sequence: number;
  action: string;
  tool?: string;
  input?: any;
  output?: any;
  status: AgentStepStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentTask {
  id: string;
  userId: string;
  conversationId?: string;
  originalPrompt: string;
  status: AgentTaskStatus;
  plan?: PlannedStep[];
  currentStep: number;
  totalSteps: number;
  result?: string;
  error?: string;
  requiresApproval?: boolean;
  pendingApprovalAction?: {
    stepId: string;
    tool: string;
    action: string;
    input: any;
  } | null;
  modelId?: string;
  creditsUsed: number;
  steps?: AgentTaskStep[];
  citations?: Citation[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ToolExecutionItem {
  id: string;
  taskId?: string;
  stepId?: string;
  userId: string;
  toolName: string;
  input?: any;
  output?: any;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  error?: string;
  duration: number;
  creditsUsed: number;
  createdAt: string;
}

export interface ModelCapabilityMatrix {
  text: boolean;
  vision: boolean;
  image_generation: boolean;
  image_editing: boolean;
  audio_input: boolean;
  audio_output: boolean;
  speech_to_text: boolean;
  text_to_speech: boolean;
  video_input: boolean;
  long_context: boolean;
}

export interface MediaItem {
  id: string;
  userId: string;
  conversationId?: string | null;
  messageId?: string | null;
  type: 'image' | 'audio' | 'generated_image' | 'edited_image' | 'tts_audio';
  mimeType: string;
  storagePath: string;
  fileUrl: string;
  provider?: string | null;
  model?: string | null;
  prompt?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  status: 'ready' | 'processing' | 'failed' | 'deleted';
  error?: string | null;
  metadataJson?: string | null;
  createdAt: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  category: 'flagship' | 'reasoning' | 'fast' | 'coding' | 'open-weights';
  description: string;
  contextWindow: string;
  maxOutputTokens: string;
  latencyTier: 'Ultra Fast' | 'Fast' | 'Balanced' | 'Deep Think';
  capabilities: string[];
  capabilityMatrix?: ModelCapabilityMatrix;
  isFlagship?: boolean;
  accentColor: string;
  isAvailable?: boolean;
  streamingSupported?: boolean;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  progress: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  uploadTimestamp: number;
  previewContent?: string;
  metadata?: {
    format?: string;
    pageCount?: number;
    sheetNames?: string[];
    rowCount?: number;
    columnCount?: number;
    lineCount?: number;
    tablePreview?: Array<Record<string, any>>;
  };
  processingError?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface Citation {
  title?: string;
  url?: string;
  domain?: string;
  sourceName?: string;
  page?: number;
  sheet?: string;
  snippet?: string;
}

export interface ChatMessageMetrics {
  tokens: number;
  latencyMs: number;
  computeNode?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  mode: WorkspaceMode;
  modelId?: string;
  attachedFiles?: UploadedFile[];
  mediaAttachments?: MediaItem[];
  sources?: ResearchSource[];
  citations?: Citation[];
  currentStage?: string;
  agentTaskId?: string;
  agentTask?: AgentTask;
  status?: 'ready' | 'loading' | 'streaming' | 'error' | 'stopped';
  errorMessage?: string;
  metrics?: ChatMessageMetrics;
  ttsAudioUrl?: string;
  isSynthesizingTts?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: WorkspaceMode;
  modelId: string;
  messages: ChatMessage[];
  isPinned?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  plan: string;
  role: 'user' | 'admin' | 'owner';
  creditBalance: number;
  createdAt: string;
  quota?: {
    tokensUsed: number;
    tokensLimit: number;
    storageUsedMb: number;
    storageLimitMb: number;
    activeSessions: number;
  };
}

export type AuthMode = 'signin' | 'signup' | 'forgot';

export interface CreditTransaction {
  id: string;
  userId: string;
  transactionId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  source: string;
  metadata?: any;
  createdAt: string;
}

export interface UsageSummary {
  currentBalance: number;
  totalConsumed: number;
  totalGranted: number;
  byFeature: Record<string, number>;
  byModel: Record<string, number>;
}

export interface BillingPlan {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: string;
  creditsIncluded: number;
  features: string[];
  isActive: boolean;
  stripePriceId?: string | null;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planName?: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid';
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentItem {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  status: string;
  planId?: string | null;
  creditsGranted: number;
  createdAt: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalAiRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCreditsIssued: number;
  totalCreditsConsumed: number;
  activeSubscriptions: number;
  paymentProviderConfigured: boolean;
  totalRevenueCents: number | null;
  paymentStatus: string;
  registeredOverTime: Array<{ date: string; count: number }>;
  recentTransactions: Array<{
    id: string;
    userId: string;
    userEmail: string;
    type: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
    source: string;
  }>;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin' | 'owner';
  plan: string;
  creditBalance: number;
  createdAt: string;
  lastActive?: string;
  messagesCount: number;
  filesCount: number;
}

export interface SystemHealthItem {
  name: string;
  status: 'Connected' | 'Not Configured' | 'Degraded';
  details: string;
  isAvailable: boolean;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: any;
  createdAt: string;
}

export interface UserProfile {
  name: string;
  email: string;
  avatarText: string;
  plan: 'Darkano Enterprise' | 'Darkano Pro' | 'Developer';
  quota: {
    tokensUsed: number;
    tokensLimit: number;
    storageUsedMb: number;
    storageLimitMb: number;
    activeSessions: number;
  };
}

export interface WorkspaceSettings {
  appearance: {
    theme: 'obsidian' | 'cyber' | 'carbon' | 'slate';
    fontSize: 'compact' | 'standard' | 'expanded';
    enableLigatures: boolean;
    reducedMotion: boolean;
  };
  chat: {
    systemPrompt: string;
    temperature: number;
    topP: number;
    autoScroll: boolean;
    sendOnEnter: boolean;
    streamingSimulation: boolean;
  };
  models: {
    defaultModelId: string;
    fallbackModelId: string;
    autoFallback: boolean;
  };
  notifications: {
    soundEnabled: boolean;
    latencyAlerts: boolean;
    desktopNotifications: boolean;
  };
  privacy: {
    zeroRetention: boolean;
    anonymizeTelemetry: boolean;
    localSaveOnly: boolean;
  };
}

export type ActiveModal = 'models' | 'settings' | 'account' | 'share' | 'file-preview' | 'credits' | 'plans' | 'admin' | null;
export type SettingsTab = 'account' | 'appearance' | 'chat' | 'models' | 'notifications' | 'privacy' | 'usage';
export type ViewSection = 'workspace' | 'files';
