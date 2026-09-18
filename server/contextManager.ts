import { ChatRequestPayload, ChatHistoryMessage, WorkspaceMode } from './types.js';
import { SERVER_CONFIG, getAssembledSystemPrompt } from './config.js';
import { providerRegistry } from './providers/registry.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  sanitizedPayload?: {
    conversationId: string;
    message: string;
    model: string;
    mode: WorkspaceMode;
    history: ChatHistoryMessage[];
    resolvedSystemPrompt: string;
    options: {
      temperature: number;
      topP: number;
    };
  };
}

const ALLOWED_MODES: WorkspaceMode[] = ['chat', 'code', 'research', 'analyze'];

export function validateAndPrepareChatRequest(payload: any): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid request body format.', code: 'INVALID_BODY' };
  }

  const rawMessage = payload.message;
  if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    return { valid: false, error: 'Message content cannot be empty.', code: 'EMPTY_MESSAGE' };
  }

  const trimmedMessage = rawMessage.trim();
  if (trimmedMessage.length > SERVER_CONFIG.maxMessageLength) {
    return {
      valid: false,
      error: `Message exceeds maximum allowed character length of ${SERVER_CONFIG.maxMessageLength.toLocaleString()}.`,
      code: 'MESSAGE_TOO_LONG'
    };
  }

  const rawMode = payload.mode || 'chat';
  if (!ALLOWED_MODES.includes(rawMode)) {
    return { valid: false, error: `Invalid workspace mode '${rawMode}'.`, code: 'INVALID_MODE' };
  }
  const mode: WorkspaceMode = rawMode;

  const rawModel = payload.model || 'darkano-ultra-v2';
  const allModels = providerRegistry.getAllModels();
  const matchedModel = allModels.find(m => m.id === rawModel);

  if (!matchedModel) {
    return {
      valid: false,
      error: `Requested model '${rawModel}' is not recognized in the Darkano catalog.`,
      code: 'UNKNOWN_MODEL'
    };
  }

  if (!matchedModel.isAvailable) {
    return {
      valid: false,
      error: `Model '${matchedModel.name}' (${matchedModel.provider}) is currently unconfigured on this cluster. Please select an available model (such as Darkano Ultra v2 or Gemini 3.8 Flash).`,
      code: 'MODEL_UNAVAILABLE'
    };
  }

  // Sanitize history
  const sanitizedHistory: ChatHistoryMessage[] = [];
  if (Array.isArray(payload.history)) {
    // Sliding context window to prevent token overflow
    const recentHistory = payload.history.slice(-SERVER_CONFIG.maxHistoryMessages);
    for (const item of recentHistory) {
      if (
        item &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0
      ) {
        sanitizedHistory.push({
          role: item.role,
          content: item.content.trim().slice(0, 16000)
        });
      }
    }
  }

  const conversationId = typeof payload.conversationId === 'string' && payload.conversationId.length > 0
    ? payload.conversationId
    : `conv-${Date.now()}`;

  const resolvedSystemPrompt = getAssembledSystemPrompt(mode, payload.options?.systemPrompt);

  const temperature = typeof payload.options?.temperature === 'number'
    ? Math.max(0, Math.min(1, payload.options.temperature))
    : 0.7;

  const topP = typeof payload.options?.topP === 'number'
    ? Math.max(0.1, Math.min(1, payload.options.topP))
    : 0.95;

  return {
    valid: true,
    sanitizedPayload: {
      conversationId,
      message: trimmedMessage,
      model: rawModel,
      mode,
      history: sanitizedHistory,
      resolvedSystemPrompt,
      options: {
        temperature,
        topP
      }
    }
  };
}
