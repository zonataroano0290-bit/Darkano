import { ChatRequestPayload, ChatHistoryMessage, WorkspaceMode } from './types.js';
import { SERVER_CONFIG, getAssembledSystemPrompt } from './config.js';
import { providerRegistry } from './providers/registry.js';
import { validateModelAllowlist, getRegisteredModel } from './providers/modelRegistry.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  sanitizedPayload?: {
    conversationId: string;
    message: string;
    model: string;
    mode: WorkspaceMode;
    fileIds: string[];
    mediaIds: string[];
    history: ChatHistoryMessage[];
    resolvedSystemPrompt: string;
    options: {
      temperature: number;
      topP: number;
    };
  };
}

const ALLOWED_MODES: WorkspaceMode[] = ['chat', 'code', 'research', 'analyze', 'agent'];

export function validateAndPrepareChatRequest(payload: any): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid request body format.', code: 'INVALID_BODY' };
  }

  const rawMessage = payload.message;
  const rawFileIds = Array.isArray(payload.fileIds) ? payload.fileIds : [];
  const rawMediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : [];

  if ((typeof rawMessage !== 'string' || rawMessage.trim().length === 0) && rawFileIds.length === 0 && rawMediaIds.length === 0) {
    return { valid: false, error: 'Message content or attachments must be provided.', code: 'EMPTY_MESSAGE' };
  }

  const trimmedMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';
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

  const rawModel = (payload.model || 'darkano-ultra-v2').trim();

  // Validate model allowlist (or auto)
  if (rawModel !== 'auto') {
    const modelValidation = validateModelAllowlist(rawModel);
    if (!modelValidation.valid) {
      return {
        valid: false,
        error: modelValidation.error || `Model '${rawModel}' is not allowed or recognized.`,
        code: modelValidation.code || 'UNKNOWN_MODEL'
      };
    }
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

  const fileIds: string[] = rawFileIds
    .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
    .map((id: string) => id.trim())
    .slice(0, 10);

  const mediaIds: string[] = rawMediaIds
    .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
    .map((id: string) => id.trim())
    .slice(0, 10);

  return {
    valid: true,
    sanitizedPayload: {
      conversationId,
      message: trimmedMessage,
      model: rawModel,
      mode,
      fileIds,
      mediaIds,
      history: sanitizedHistory,
      resolvedSystemPrompt,
      options: {
        temperature,
        topP
      }
    }
  };
}
