export type WorkspaceMode = 'chat' | 'code' | 'research' | 'analyze';

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
  sources?: ResearchSource[];
  citations?: Citation[];
  currentStage?: string;
  status?: 'ready' | 'loading' | 'streaming' | 'error' | 'stopped';
  errorMessage?: string;
  metrics?: ChatMessageMetrics;
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
