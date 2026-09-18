import { ModelRegistryEntry, WorkspaceMode, AutoRouteResult } from '../types.js';

/**
 * Centralized Server-Side Model Registry
 *
 * Strict Security Rule:
 * The client MUST NOT be able to send an arbitrary provider/model ID and force the backend to call it.
 * The backend strictly validates the requested model against this server-side allowlist.
 */
export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // 1. Darkano Core Engine
  'darkano-ultra-v2': {
    key: 'darkano-ultra-v2',
    name: 'Darkano Ultra v2',
    provider: 'darkano',
    modelId: 'darkano-ultra-v2',
    enabled: true,
    isFlagship: true,
    category: 'flagship',
    description: 'Flagship cyber intelligence model engineered for deep synthetic reasoning, malware triage, and autonomous security task graphs.',
    contextWindow: '200k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Deep Think',
    capabilities: ['Deep Reasoning', 'Vulnerability Analysis', 'Reverse Engineering', 'Multi-Modal'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: true,
      audio_output: false,
      speech_to_text: true,
      text_to_speech: false,
      video_input: true,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#06b6d4'
  },
  'darkano-flash-v2': {
    key: 'darkano-flash-v2',
    name: 'Darkano Flash v2',
    provider: 'darkano',
    modelId: 'darkano-flash-v2',
    enabled: true,
    category: 'fast',
    description: 'Sub-second latency powerhouse optimized for high-throughput code iteration, rapid packet analysis, and high-speed telemetry.',
    contextWindow: '1M tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Ultra Fast',
    capabilities: ['Sub-second Response', '1M Context', 'Realtime Extraction', 'High Throughput'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#38bdf8'
  },
  'darkano-code-x': {
    key: 'darkano-code-x',
    name: 'Darkano Code-X',
    provider: 'darkano',
    modelId: 'darkano-code-x',
    enabled: true,
    category: 'coding',
    description: 'Specialized polyglot coding model trained on verified ASTs, kernel subsystems, and defensive remediation patches.',
    contextWindow: '128k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Fast',
    capabilities: ['AST Refactoring', 'Test Scaffolding', 'Security Audit', 'Cross-Language Migration'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#10b981'
  },

  // 2. Google Gemini Models (Official @google/genai SDK)
  'gemini-3-flash-preview': {
    key: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    modelId: process.env.GOOGLE_MODEL || 'gemini-3-flash-preview',
    enabled: true,
    category: 'flagship',
    description: 'Google frontier high-velocity omni model with native tool grounding, live web citations, and high reasoning density.',
    contextWindow: '1M tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Fast',
    capabilities: ['Live Web Grounding', '1M Context', 'Native Vision', 'Multimodal Understanding'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: true,
      audio_output: false,
      speech_to_text: true,
      text_to_speech: false,
      video_input: true,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#818cf8'
  },
  'gemini-2.5-pro': {
    key: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    enabled: true,
    category: 'reasoning',
    description: 'Deep multimodal reasoning model for dense technical architectures, source tree auditing, and verified mathematical analysis.',
    contextWindow: '1M tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Balanced',
    capabilities: ['Multimodal Native', 'Video & Audio', 'Massive Documents', 'Factuality'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: true,
      audio_output: false,
      speech_to_text: true,
      text_to_speech: false,
      video_input: true,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#6366f1'
  },
  'gemini-3.1-flash-lite': {
    key: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    modelId: 'gemini-3.1-flash-lite',
    enabled: true,
    category: 'fast',
    description: 'Ultra-efficient, cost-optimized low latency model for instant responses, data extraction, and rapid filtering.',
    contextWindow: '1M tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Ultra Fast',
    capabilities: ['Low Latency', 'Cost Optimized', 'High Concurrency'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#3b82f6'
  },

  // 3. OpenAI Models (Official openai SDK)
  'gpt-4o': {
    key: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    modelId: process.env.OPENAI_MODEL || 'gpt-4o',
    enabled: true,
    category: 'flagship',
    description: 'OpenAI high-intelligence omni model supporting unified reasoning across text, code, vision, and tool calling.',
    contextWindow: '128k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Fast',
    capabilities: ['Omni Modality', 'Structured JSON', 'Function Calling', 'Instruction Following'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: true,
      audio_output: false,
      speech_to_text: true,
      text_to_speech: false,
      video_input: true,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#10a37f'
  },
  'gpt-4o-mini': {
    key: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    enabled: true,
    category: 'fast',
    description: 'Cost-efficient, lightweight omni model designed for fast, high-volume conversational and vision tasks.',
    contextWindow: '128k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Ultra Fast',
    capabilities: ['Fast Inference', 'Vision Capable', 'Function Calling'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#059669'
  },

  // 4. Anthropic Models (Official @anthropic-ai/sdk)
  'claude-3.7-sonnet': {
    key: 'claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    modelId: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    enabled: true,
    category: 'reasoning',
    description: 'Hybrid architecture combining fast inference with dynamic extended thinking tokens for complex engineering.',
    contextWindow: '200k tokens',
    maxOutputTokens: '64k tokens',
    latencyTier: 'Deep Think',
    capabilities: ['Hybrid Reasoning', 'Long Output Generation', 'Agentic Execution', 'Nuance'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#d97706'
  },
  'claude-3-5-haiku': {
    key: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-20241022',
    enabled: true,
    category: 'fast',
    description: 'Rapid response Claude architecture for lightweight tasks, quick classification, and high-throughput streams.',
    contextWindow: '200k tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Ultra Fast',
    capabilities: ['Rapid Generation', 'Coding Assistance', 'Structured Outputs'],
    capabilityMatrix: {
      text: true,
      vision: false,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#b45309'
  },

  // 5. xAI / Grok Models (Official API / SDK)
  'grok-2': {
    key: 'grok-2',
    name: 'Grok 2',
    provider: 'xai',
    modelId: process.env.XAI_MODEL || 'grok-2-latest',
    enabled: true,
    category: 'flagship',
    description: 'State-of-the-art reasoning model from xAI with frontier conversational, vision, and real-time knowledge synthesis.',
    contextWindow: '128k tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Balanced',
    capabilities: ['Frontier Reasoning', 'Vision Capable', 'Math & Code'],
    capabilityMatrix: {
      text: true,
      vision: true,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#ec4899'
  },
  'grok-beta': {
    key: 'grok-beta',
    name: 'Grok Beta',
    provider: 'xai',
    modelId: 'grok-beta',
    enabled: true,
    category: 'fast',
    description: 'High-throughput Grok variant optimized for coding queries and fast dialogue.',
    contextWindow: '128k tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Fast',
    capabilities: ['Direct Reasoning', 'High Speed', 'Tool Calling'],
    capabilityMatrix: {
      text: true,
      vision: false,
      image_generation: false,
      image_editing: false,
      audio_input: false,
      audio_output: false,
      speech_to_text: false,
      text_to_speech: false,
      video_input: false,
      long_context: true
    },
    streamingSupported: true,
    accentColor: '#f43f5e'
  }
};

/**
 * Server-side model allowlist lookup.
 * Returns null if model is unknown or disabled.
 */
export function getRegisteredModel(key: string): ModelRegistryEntry | null {
  if (!key || typeof key !== 'string') return null;
  const cleanKey = key.trim();
  const entry = MODEL_REGISTRY[cleanKey];
  if (!entry || !entry.enabled) return null;
  return entry;
}

/**
 * Validates a client-requested model key against the strict server allowlist.
 */
export function validateModelAllowlist(requestedKey: string): {
  valid: boolean;
  entry?: ModelRegistryEntry;
  error?: string;
  code?: string;
} {
  if (!requestedKey || typeof requestedKey !== 'string') {
    return {
      valid: false,
      error: 'Model identifier must be a valid non-empty string.',
      code: 'INVALID_MODEL_FORMAT'
    };
  }

  const cleanKey = requestedKey.trim();

  // Handle auto mode keyword
  if (cleanKey === 'auto') {
    return {
      valid: true,
      entry: MODEL_REGISTRY['darkano-ultra-v2'] // Default anchor for metadata
    };
  }

  const entry = MODEL_REGISTRY[cleanKey];

  if (!entry) {
    return {
      valid: false,
      error: `Model '${cleanKey}' is not permitted or recognized in the server allowlist.`,
      code: 'MODEL_NOT_IN_ALLOWLIST'
    };
  }

  if (!entry.enabled) {
    return {
      valid: false,
      error: `Model '${entry.name}' is currently disabled on this server.`,
      code: 'MODEL_DISABLED'
    };
  }

  return {
    valid: true,
    entry
  };
}

/**
 * Server-Side Auto Routing Engine
 *
 * Dynamically selects the optimal configured model based on:
 * - Task mode (chat, code, research, analyze, agent)
 * - Required modalities (vision, audio)
 * - Provider configuration state
 *
 * Returns structured selection and reasoning.
 */
export function routeAutoModel(params: {
  mode: WorkspaceMode;
  hasVision: boolean;
  hasAudio: boolean;
  availableProviders: Set<string>;
}): AutoRouteResult {
  const { mode, hasVision, hasAudio, availableProviders } = params;

  // 1. Gather all enabled candidates whose provider is currently configured & online
  const candidates = Object.values(MODEL_REGISTRY).filter(m => {
    if (!m.enabled) return false;
    return availableProviders.has(m.provider);
  });

  // If no configured provider found, fallback to registered darkano flagship
  if (candidates.length === 0) {
    const fallback = MODEL_REGISTRY['darkano-ultra-v2'];
    return {
      selectedModel: fallback.key,
      provider: fallback.provider,
      reason: 'Auto routing defaulted to Darkano Core flagship as no third-party providers are active.',
      entry: fallback
    };
  }

  // 2. Modality filtering
  let filtered = candidates;
  if (hasAudio) {
    const audioCandidates = filtered.filter(m => m.capabilityMatrix.audio_input);
    if (audioCandidates.length > 0) filtered = audioCandidates;
  }
  if (hasVision) {
    const visionCandidates = filtered.filter(m => m.capabilityMatrix.vision);
    if (visionCandidates.length > 0) filtered = visionCandidates;
  }

  // 3. Task-specific optimization
  if (mode === 'code') {
    const codeModel = filtered.find(m => m.category === 'coding' || m.key.includes('code'));
    if (codeModel) {
      return {
        selectedModel: codeModel.key,
        provider: codeModel.provider,
        reason: `Auto routed to ${codeModel.name} based on code specialization and syntax analysis benchmarks.`,
        entry: codeModel
      };
    }
  }

  if (mode === 'research' || mode === 'agent') {
    const reasoningModel = filtered.find(m => m.category === 'reasoning' || m.isFlagship);
    if (reasoningModel) {
      return {
        selectedModel: reasoningModel.key,
        provider: reasoningModel.provider,
        reason: `Auto routed to ${reasoningModel.name} for deep research, tool grounding, and systematic problem solving.`,
        entry: reasoningModel
      };
    }
  }

  // 4. Default to flagship or lowest-latency model
  const flagship = filtered.find(m => m.isFlagship) || filtered[0];
  return {
    selectedModel: flagship.key,
    provider: flagship.provider,
    reason: `Auto routed to ${flagship.name} for optimal balance of latency, capability, and model availability.`,
    entry: flagship
  };
}
