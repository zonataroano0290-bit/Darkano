import OpenAI from 'openai';
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

export class OpenAIProvider extends BaseAIProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('OpenAI API Key is not configured on the server.');
      }
      this.client = new OpenAI({
        apiKey: apiKey.trim(),
        timeout: 60000
      });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
  }

  getModels(): ServerModelInfo[] {
    const available = this.isConfigured();
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        category: 'flagship',
        description: 'OpenAI flagship multimodal omni intelligence with state-of-the-art reasoning across text, code, and vision.',
        contextWindow: '128k tokens',
        maxOutputTokens: '16k tokens',
        latencyTier: 'Fast',
        capabilities: ['Multimodal Native', 'Function Calling', 'JSON Schema', 'High Coherence'],
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
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#10a37f'
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI',
        category: 'fast',
        description: 'Lightweight omni model engineered for high-throughput execution, rapid responses, and cost efficiency.',
        contextWindow: '128k tokens',
        maxOutputTokens: '16k tokens',
        latencyTier: 'Ultra Fast',
        capabilities: ['Sub-second Response', 'Vision Capable', 'Function Calling'],
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
        accentColor: '#059669'
      }
    ];
  }

  private formatMessages(options: ProviderChatOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // System prompt
    if (options.resolvedSystemPrompt) {
      messages.push({
        role: 'system',
        content: options.resolvedSystemPrompt
      });
    }

    // Historical messages
    if (options.history && Array.isArray(options.history)) {
      for (const h of options.history) {
        if (!h.content) continue;
        if (h.role === 'user') {
          messages.push({ role: 'user', content: h.content });
        } else if (h.role === 'assistant') {
          messages.push({ role: 'assistant', content: h.content });
        }
      }
    }

    // Current message with optional multimodal attachments
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    if (options.message && options.message.trim().length > 0) {
      userContent.push({
        type: 'text',
        text: options.message
      });
    }

    // If media attachments exist, format image URLs / base64
    if (options.mediaIds && options.mediaIds.length > 0) {
      // Attached media items are resolved via database in context manager or payload
    }

    if (userContent.length > 0) {
      messages.push({
        role: 'user',
        content: userContent.length === 1 && userContent[0].type === 'text' ? (userContent[0] as any).text : userContent
      });
    } else if (options.message) {
      messages.push({
        role: 'user',
        content: options.message
      });
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
        error: 'OpenAI API key is not configured on this server. Set OPENAI_API_KEY in the server environment.',
        code: 'NOT_CONFIGURED'
      };
      return;
    }

    const regEntry = getRegisteredModel(options.model);
    const targetModel = regEntry?.modelId || process.env.OPENAI_MODEL || options.model || 'gpt-4o';

    try {
      const client = this.getClient();
      const messages = this.formatMessages(options);

      const stream = await client.chat.completions.create(
        {
          model: targetModel,
          messages,
          temperature: options.options?.temperature ?? 0.7,
          top_p: options.options?.topP ?? 0.95,
          stream: true,
          stream_options: { include_usage: true }
        },
        { signal: abortSignal }
      );

      let accumulatedText = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      for await (const chunk of stream) {
        if (abortSignal?.aborted) {
          yield { type: 'done' };
          return;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          accumulatedText += delta;
          yield {
            type: 'chunk',
            text: delta
          };
        }

        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
          totalTokens = chunk.usage.total_tokens || 0;
        }
      }

      const latencyMs = Date.now() - startTime;
      if (totalTokens === 0) {
        promptTokens = Math.max(1, Math.round(options.message.length / 4));
        completionTokens = Math.max(1, Math.round(accumulatedText.length / 4));
        totalTokens = promptTokens + completionTokens;
      }

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
        error: `OpenAI error: ${message}`,
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
        errorMessage: 'OpenAI API key is not configured on this server.'
      };
    }

    const regEntry = getRegisteredModel(options.model);
    const targetModel = regEntry?.modelId || process.env.OPENAI_MODEL || options.model || 'gpt-4o';

    try {
      const client = this.getClient();
      const messages = this.formatMessages(options);

      const completion = await client.chat.completions.create(
        {
          model: targetModel,
          messages,
          temperature: options.options?.temperature ?? 0.7,
          top_p: options.options?.topP ?? 0.95,
          stream: false
        },
        { signal: abortSignal }
      );

      const text = completion.choices[0]?.message?.content || '';
      const latencyMs = Date.now() - startTime;
      const usageMetadata = completion.usage;

      const usage: UsageMetadata = {
        promptTokens: usageMetadata?.prompt_tokens || 0,
        completionTokens: usageMetadata?.completion_tokens || 0,
        totalTokens: usageMetadata?.total_tokens || 0,
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
        errorMessage: `OpenAI request failed: ${message}`
      };
    }
  }

  async healthCheck(modelId?: string): Promise<ModelHealthCheckResult> {
    const regEntry = getRegisteredModel(modelId || 'gpt-4o');
    const targetModel = regEntry?.modelId || process.env.OPENAI_MODEL || modelId || 'gpt-4o';
    const checkedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        modelKey: modelId || 'gpt-4o',
        provider: this.id,
        modelId: targetModel,
        status: 'NOT_CONFIGURED',
        error: 'OPENAI_API_KEY environment variable is not defined.',
        checkedAt
      };
    }

    const startTime = Date.now();
    try {
      const client = this.getClient();
      // Send a minimal 1-token real completion with timeout
      await client.chat.completions.create(
        {
          model: targetModel,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 1
        },
        { timeout: 8000 }
      );

      const latencyMs = Date.now() - startTime;
      return {
        modelKey: modelId || 'gpt-4o',
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
        modelKey: modelId || 'gpt-4o',
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
    const msg = err?.message || 'Unknown OpenAI error';

    if (statusNumber === 401 || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
      return { status: 'INVALID_API_KEY', message: 'Invalid OpenAI API key provided.' };
    }
    if (statusNumber === 404 || msg.includes('model_not_found') || msg.includes('does not exist')) {
      return { status: 'MODEL_UNAVAILABLE', message: `Requested OpenAI model is not accessible: ${msg}` };
    }
    if (statusNumber === 429 || msg.includes('rate_limit_exceeded') || msg.includes('insufficient_quota')) {
      return { status: 'RATE_LIMITED', message: `OpenAI rate limit or quota exceeded: ${msg}` };
    }
    if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
      return { status: 'NETWORK_ERROR', message: `Network connection to OpenAI failed: ${msg}` };
    }
    return { status: 'PROVIDER_ERROR', message: msg };
  }
}
