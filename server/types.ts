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
  fileIds?: string[];
  multimodalParts?: Array<{
    inlineData: {
      mimeType: string;
      data: string;
    };
  }>;
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

export interface CitationItem {
  title?: string;
  url?: string;
  domain?: string;
  sourceName?: string;
  page?: number;
  sheet?: string;
  snippet?: string;
}

export interface StreamEventChunk {
  type: 'chunk' | 'usage' | 'error' | 'done' | 'stage' | 'sources' | 'citations';
  text?: string;
  usage?: UsageMetadata;
  error?: string;
  code?: string;
  stage?: { stage: string; detail?: any };
  sources?: Array<{ title: string; url: string; domain: string; snippet?: string }>;
  citations?: CitationItem[];
}

export interface NonStreamChatResponse {
  id: string;
  content: string;
  model: string;
  provider: string;
  usage?: UsageMetadata;
  sources?: Array<{ title: string; url: string; domain: string; snippet?: string }>;
  citations?: CitationItem[];
  status: 'completed' | 'error';
  errorMessage?: string;
}
