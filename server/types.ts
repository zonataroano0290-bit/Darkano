export type WorkspaceMode = 'chat' | 'code' | 'research' | 'analyze';

export interface ServerModelInfo {
  id: string;
  name: string;
  provider: string;
  category: 'flagship' | 'reasoning' | 'fast' | 'coding' | 'open-weights';
  description: string;
  contextWindow: string;
  maxOutputTokens: string;
  latencyTier: 'Ultra Fast' | 'Fast' | 'Balanced' | 'Deep Think';
  capabilities: string[];
  isAvailable: boolean;
  streamingSupported: boolean;
  accentColor: string;
  isFlagship?: boolean;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequestPayload {
  conversationId: string;
  message: string;
  model: string;
  mode: WorkspaceMode;
  history?: ChatHistoryMessage[];
  options?: {
    temperature?: number;
    topP?: number;
    systemPrompt?: string;
  };
}

export interface UsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  model: string;
  provider: string;
}

export interface StreamEventChunk {
  type: 'chunk' | 'usage' | 'error' | 'done';
  text?: string;
  usage?: UsageMetadata;
  error?: string;
  code?: string;
}

export interface NonStreamChatResponse {
  id: string;
  content: string;
  model: string;
  provider: string;
  usage?: UsageMetadata;
  status: 'completed' | 'error';
  errorMessage?: string;
}
