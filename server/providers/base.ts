import {
  ServerModelInfo,
  ChatRequestPayload,
  StreamEventChunk,
  NonStreamChatResponse
} from '../types.js';

export interface ProviderChatOptions extends ChatRequestPayload {
  resolvedSystemPrompt: string;
}

export abstract class BaseAIProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract isConfigured(): boolean;
  abstract getModels(): ServerModelInfo[];

  abstract streamChat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamEventChunk, void, unknown>;

  abstract chat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): Promise<NonStreamChatResponse>;
}
