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
  citations?: CitationItem[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ToolExecutionRecord {
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

export interface AgentTaskEvent {
  event:
    | 'task_created'
    | 'planning_started'
    | 'plan_created'
    | 'step_started'
    | 'tool_started'
    | 'tool_completed'
    | 'step_completed'
    | 'approval_required'
    | 'task_paused'
    | 'task_resumed'
    | 'task_completed'
    | 'task_failed'
    | 'task_cancelled';
  taskId: string;
  task?: Partial<AgentTask>;
  step?: Partial<AgentTaskStep>;
  tool?: {
    name: string;
    status: string;
    duration?: number;
    creditsUsed?: number;
    error?: string;
  };
  result?: string;
  error?: string;
  citations?: CitationItem[];
  timestamp: string;
}

export type ModelCapability =
  | 'text'
  | 'vision'
  | 'image_generation'
  | 'image_editing'
  | 'audio_input'
  | 'audio_output'
  | 'speech_to_text'
  | 'text_to_speech'
  | 'video_input'
  | 'long_context';

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

export interface MediaRecord {
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
  capabilityMatrix: ModelCapabilityMatrix;
  isAvailable: boolean;
  streamingSupported: boolean;
  accentColor: string;
  isFlagship?: boolean;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  media?: MediaRecord[];
}

export interface ChatRequestPayload {
  conversationId: string;
  message: string;
  model: string;
  mode: WorkspaceMode;
  fileIds?: string[];
  mediaIds?: string[];
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

// ==========================================
// PHASE 9: Real AI Coding Workspace + Project Builder Types
// ==========================================

export type ProjectFramework = 'react-vite' | 'vanilla-html' | 'nodejs';
export type ProjectLanguage = 'typescript' | 'javascript' | 'html';
export type ProjectStatus = 'active' | 'building' | 'archived';
export type ProjectBuildStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type PatchStatus = 'pending' | 'applied' | 'rejected';

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  framework: ProjectFramework;
  language: ProjectLanguage;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  path: string;
  content: string;
  fileType: 'file' | 'directory';
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSnapshotRecord {
  id: string;
  projectId: string;
  createdBy: string;
  description: string;
  filesJson: string;
  createdAt: string;
}

export interface ProjectBuildRecord {
  id: string;
  projectId: string;
  userId: string;
  status: ProjectBuildStatus;
  command: string;
  output: string;
  errors: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
}

export interface ProjectPatchRecord {
  id: string;
  projectId: string;
  userId: string;
  path: string;
  originalContent: string | null;
  proposedContent: string;
  diffSummary: string;
  status: PatchStatus;
  createdAt: string;
  appliedAt: string | null;
}

export interface ProjectEnvVarRecord {
  id: string;
  projectId: string;
  key: string;
  isConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectQualityChecksResult {
  syntax: { status: 'passed' | 'failed' | 'not_configured'; errors?: string[] };
  typeCheck: { status: 'passed' | 'failed' | 'not_configured'; errors?: string[] };
  lint: { status: 'passed' | 'failed' | 'not_configured'; warnings?: string[]; errors?: string[] };
  tests: { status: 'passed' | 'failed' | 'not_configured'; total: number; passed: number; failed: number; results?: Array<{ name: string; status: 'passed' | 'failed'; error?: string }> };
  productionBuild: { status: 'passed' | 'failed' | 'not_configured'; output?: string; errors?: string };
}

// ==========================================
// PHASE 10: Real Deployment & Cloud Workspace Types
// ==========================================

export type DeploymentEnvironment = 'production' | 'preview' | 'development';
export type DeploymentProviderName = 'vercel' | 'netlify' | 'cloudflare' | 'none';
export type DeploymentStatus = 'queued' | 'building' | 'deploying' | 'running' | 'failed' | 'cancelled' | 'stopped';
export type DeploymentHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface DeploymentRecord {
  id: string;
  projectId: string;
  userId: string;
  snapshotId: string | null;
  environment: DeploymentEnvironment;
  provider: DeploymentProviderName;
  status: DeploymentStatus;
  deploymentUrl: string | null;
  buildId: string | null;
  logsReference: string | null;
  errorMessage: string | null;
  healthStatus: DeploymentHealthStatus;
  creditsDeducted: number;
  durationMs: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stoppedAt: string | null;
}

export interface DeploymentLogRecord {
  id: string;
  deploymentId: string;
  level: 'info' | 'warn' | 'error' | 'system';
  message: string;
  timestamp: string;
}

export interface DeploymentEnvVarRecord {
  id: string;
  projectId: string;
  environment: DeploymentEnvironment;
  key: string;
  isConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentDomainRecord {
  id: string;
  projectId: string;
  domain: string;
  environment: DeploymentEnvironment;
  verified: boolean;
  sslStatus: 'active' | 'pending' | 'unknown' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentProviderStatus {
  provider: DeploymentProviderName;
  configured: boolean;
  name: string;
  reason?: string;
  supportedEnvironments: DeploymentEnvironment[];
  supportedFeatures: {
    customDomains: boolean;
    healthChecks: boolean;
    rollback: boolean;
    cancel: boolean;
  };
}


