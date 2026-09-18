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
  status: 'uploading' | 'ready' | 'error';
  uploadTimestamp: number;
  previewContent?: string;
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

export type ActiveModal = 'models' | 'settings' | 'account' | 'share' | 'file-preview' | null;
export type SettingsTab = 'account' | 'appearance' | 'chat' | 'models' | 'notifications' | 'privacy' | 'usage';
export type ViewSection = 'workspace' | 'files';
