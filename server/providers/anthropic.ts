import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider, ProviderChatOptions } from './base.js';
import {
  ServerModelInfo,
  StreamEventChunk,
  NonStreamChatResponse,
  UsageMetadata,
  ModelHealthCheckResult,
  ModelHealthStatus
} from '../types.js';
import { getRegisteredModel } from './modelRegistry.js';

export class AnthropicProvider extends BaseAIProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('Anthropic API Key is not configured on the server.');
      }
      this.client = new Anthropic({
        apiKey: apiKey.trim(),
        timeout: 60000
      });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0);
  }

  getModels(): ServerModelInfo[] {
    const available = this.isConfigured();
    return [
      {
        id: 'claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
        provider: 'Anthropic',
        category: 'reasoning',
        description: 'Frontier reasoning engine with dynamic hybrid thinking and state-of-the-art coding abilities.',
        contextWindow: '200k tokens',
        maxOutputTokens: '64k tokens',
        latencyTier: 'Deep Think',
        capabilities: ['Hybrid Reasoning', 'Deep Code Synthesis', 'Complex Refactoring', 'Nuanced Analysis'],
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
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#d97706'
      },
      {
        id: 'claude-3-5-haiku',
        name: 'Claude 3.5 Haiku',
        provider: 'Anthropic',
        category: 'fast',
        description: 'High-velocity Claude architecture for fast task completion, rapid classification, and lightweight processing.',
        contextWindow: '200k tokens',
        maxOutputTokens: '8k tokens',
        latencyTier: 'Ultra Fast',
        capabilities: ['Sub-second Response', 'Lightweight Coding', 'Structured Extraction'],
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
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#b45309'
      }
    ];
  }

  private formatMessages(options: ProviderChatOptions): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // History (must alternate user and assistant in Anthropic API)
    if (options.history && Array.isArray(options.history)) {
      for (const h of options.history) {
        if (!h.content) continue;
        const role = h.role === 'assistant' ? 'assistant' : 'user';
        // Avoid consecutive messages of the same role
        const prev = messages[messages.length - 1];
        if (prev && prev.role === role) {
          prev.content = `${prev.content}\n\n${h.content}`;
        } else {
          messages.push({ role, content: h.content });
        }
      }
    }

    // Current message
    const userText = options.message && options.message.trim().length > 0 ? options.message.trim() : 'Please continue.';
    const prev = messages[messages.length - 1];
    if (prev && prev.role === 'user') {
      prev.content = `${prev.content}\n\n${userText}`;
    } else {
      messages.push({ role: 'user', content: userText });
    }

    return messages;
  }

  async *streamChat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamEventChunk, void, unknown> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      yield {
        type: 'error',
        error: 'Anthropic API key is not configured on this server. Set ANTHROPIC_API_KEY in the server environment.',
        code: 'NOT_CONFIGURED'
      };
      return;
    }

    const regEntry = getRegisteredModel(options.model);
    const targetModel = regEntry?.modelId || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

    try {
      const client = this.getClient();
      const messages = this.formatMessages(options);

      const stream = client.messages.stream(
        {
          model: targetModel,
          max_tokens: 4096,
          system: options.resolvedSystemPrompt || undefined,
          temperature: options.options?.temperature ?? 0.7,
          messages
        },
        { signal: abortSignal }
      );

      let accumulatedText = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      for await (const event of stream) {
        if (abortSignal?.aborted) {
          yield { type: 'done' };
          return;
        }

        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const deltaText = event.delta.text;
          accumulatedText += deltaText;
          yield {
            type: 'chunk',
            text: deltaText
          };
        }
      }

      // Final message details
      const finalMessage = await stream.finalMessage().catch(() => null);
      if (finalMessage?.usage) {
        promptTokens = finalMessage.usage.input_tokens || 0;
        completionTokens = finalMessage.usage.output_tokens || 0;
        totalTokens = promptTokens + completionTokens;
      } else {
        promptTokens = Math.max(1, Math.round(options.message.length / 4));
        completionTokens = Math.max(1, Math.round(accumulatedText.length / 4));
        totalTokens = promptTokens + completionTokens;
      }

      const latencyMs = Date.now() - startTime;

      yield {
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          model: targetModel,
          provider: this.name
        }
      };

      yield { type: 'done' };
    } catch (err: any) {
      if (abortSignal?.aborted) {
        yield { type: 'done' };
        return;
      }

      const { status, message } = this.normalizeError(err);
      yield {
        type: 'error',
        error: `Anthropic error: ${message}`,
        code: status
      };
    }
  }

  async chat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): Promise<NonStreamChatResponse> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      return {
        id: `msg-${Date.now()}`,
        content: '',
        model: options.model,
        provider: this.name,
        status: 'error',
        errorMessage: 'Anthropic API key is not configured on this server.'
      };
    }

    const regEntry = getRegisteredModel(options.model);
    const targetModel = regEntry?.modelId || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

    try {
      const client = this.getClient();
      const messages = this.formatMessages(options);

      const response = await client.messages.create(
        {
          model: targetModel,
          max_tokens: 4096,
          system: options.resolvedSystemPrompt || undefined,
          temperature: options.options?.temperature ?? 0.7,
          messages
        },
        { signal: abortSignal }
      );

      const textBlock = response.content.find(c => c.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : '';
      const latencyMs = Date.now() - startTime;

      const usage: UsageMetadata = {
        promptTokens: response.usage.input_tokens || 0,
        completionTokens: response.usage.output_tokens || 0,
        totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        latencyMs,
        model: targetModel,
        provider: this.name
      };

      return {
        id: `msg-${Date.now()}`,
        content: text,
        model: targetModel,
        provider: this.name,
        usage,
        status: 'completed'
      };
    } catch (err: any) {
      const { message } = this.normalizeError(err);
      return {
        id: `msg-${Date.now()}`,
        content: '',
        model: targetModel,
        provider: this.name,
        status: 'error',
        errorMessage: `Anthropic request failed: ${message}`
      };
    }
  }

  async healthCheck(modelId?: string): Promise<ModelHealthCheckResult> {
    const regEntry = getRegisteredModel(modelId || 'claude-3.7-sonnet');
    const targetModel = regEntry?.modelId || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
    const checkedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        modelKey: modelId || 'claude-3.7-sonnet',
        provider: this.id,
        modelId: targetModel,
        status: 'NOT_CONFIGURED',
        error: 'ANTHROPIC_API_KEY environment variable is not defined.',
        checkedAt
      };
    }

    const startTime = Date.now();
    try {
      const client = this.getClient();
      // Send a minimal 1-token real completion with timeout
      await client.messages.create(
        {
          model: targetModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Ping' }]
        },
        { timeout: 8000 }
      );

      const latencyMs = Date.now() - startTime;
      return {
        modelKey: modelId || 'claude-3.7-sonnet',
        provider: this.id,
        modelId: targetModel,
        status: 'CONNECTED',
        latencyMs,
        checkedAt
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const { status, message } = this.normalizeError(err);
      return {
        modelKey: modelId || 'claude-3.7-sonnet',
        provider: this.id,
        modelId: targetModel,
        status,
        latencyMs,
        error: message,
        checkedAt
      };
    }
  }

  private normalizeError(err: any): { status: ModelHealthStatus; message: string } {
    const statusNumber = err?.status || err?.statusCode;
    const msg = err?.message || 'Unknown Anthropic error';

    if (statusNumber === 401 || msg.includes('authentication_error') || msg.includes('invalid x-api-key')) {
      return { status: 'INVALID_API_KEY', message: 'Invalid Anthropic API key provided.' };
    }
    if (statusNumber === 404 || msg.includes('not_found_error') || msg.includes('model:')) {
      return { status: 'MODEL_UNAVAILABLE', message: `Requested Anthropic model is not available: ${msg}` };
    }
    if (statusNumber === 429 || msg.includes('rate_limit_error')) {
      return { status: 'RATE_LIMITED', message: `Anthropic rate limit exceeded: ${msg}` };
    }
    if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
      return { status: 'NETWORK_ERROR', message: `Network connection to Anthropic failed: ${msg}` };
    }
    return { status: 'PROVIDER_ERROR', message: msg };
  }
}
