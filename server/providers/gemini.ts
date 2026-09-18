import { GoogleGenAI } from '@google/genai';
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

export class GeminiProvider extends BaseAIProvider {
  readonly id = 'google';
  readonly name = 'Google DeepMind';

  private aiClient: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('Google Gemini API Key is not configured on the server.');
      }
      this.aiClient = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return this.aiClient;
  }

  isConfigured(): boolean {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }

  getModels(): ServerModelInfo[] {
    const available = this.isConfigured();
    return [
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        provider: 'Google',
        category: 'fast',
        description: 'Next-gen frontier low-latency model optimized for lightning-fast reasoning, massive context digestion, and high throughput.',
        contextWindow: '1M tokens',
        maxOutputTokens: '8k tokens',
        latencyTier: 'Ultra Fast',
        capabilities: ['Sub-second Response', '1M Context', 'Vision & Audio', 'Zero-Latency Routing'],
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
        accentColor: '#38bdf8'
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'Google',
        category: 'reasoning',
        description: 'Flagship multimodal powerhouse adept at native audio, video, complex document layouts, and high-fidelity code verification.',
        contextWindow: '1M tokens',
        maxOutputTokens: '8k tokens',
        latencyTier: 'Balanced',
        capabilities: ['Multimodal Native', 'Video & Audio', 'Complex Documents', 'High Factuality'],
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
        accentColor: '#818cf8'
      },
      {
        id: 'gemini-3.1-flash-lite-image',
        name: 'Nano Banana Lite (Image Gen)',
        provider: 'Google',
        category: 'fast',
        description: 'Frontier multimodal image synthesis model supporting high-speed visual generation and conversational image editing.',
        contextWindow: '32k tokens',
        maxOutputTokens: '4k tokens',
        latencyTier: 'Fast',
        capabilities: ['Image Generation', 'Image Editing', 'Multi-Aspect Ratio', 'Visual Synthesis'],
        capabilityMatrix: {
          text: false,
          vision: true,
          image_generation: true,
          image_editing: true,
          audio_input: false,
          audio_output: false,
          speech_to_text: false,
          text_to_speech: false,
          video_input: false,
          long_context: false
        },
        isAvailable: available,
        streamingSupported: false,
        accentColor: '#f59e0b'
      },
      {
        id: 'gemini-3.1-flash-tts-preview',
        name: 'Gemini Flash Audio TTS',
        provider: 'Google',
        category: 'fast',
        description: 'Specialized low-latency neural speech generation engine supporting high-fidelity expressive voice synthesis.',
        contextWindow: '16k tokens',
        maxOutputTokens: '2k tokens',
        latencyTier: 'Ultra Fast',
        capabilities: ['Text-to-Speech', '24kHz Audio', 'Expressive Prosody', 'Neural Voices'],
        capabilityMatrix: {
          text: false,
          vision: false,
          image_generation: false,
          image_editing: false,
          audio_input: false,
          audio_output: true,
          speech_to_text: false,
          text_to_speech: true,
          video_input: false,
          long_context: false
        },
        isAvailable: available,
        streamingSupported: false,
        accentColor: '#ec4899'
      }
    ];
  }

  private sanitizeContents(
    history: ProviderChatOptions['history'],
    currentMessage: string,
    multimodalParts?: ProviderChatOptions['multimodalParts']
  ) {
    const rawTurns: { role: 'user' | 'model'; parts: any[] }[] = [];

    if (history && history.length > 0) {
      for (const h of history) {
        if (!h.content || h.content.trim().length === 0) continue;
        const role = h.role === 'assistant' ? 'model' : 'user';
        rawTurns.push({ role, parts: [{ text: h.content }] });
      }
    }

    // Append the current message
    const userParts: any[] = [{ text: currentMessage }];
    if (multimodalParts && multimodalParts.length > 0) {
      for (const mp of multimodalParts) {
        userParts.push(mp);
      }
    }

    rawTurns.push({ role: 'user', parts: userParts });

    // Gemini requires alternating roles, starting with 'user'.
    const consolidatedTurns: { role: 'user' | 'model'; parts: any[] }[] = [];

    for (const turn of rawTurns) {
      const lastTurn = consolidatedTurns[consolidatedTurns.length - 1];
      if (lastTurn && lastTurn.role === turn.role) {
        // Merge consecutive identical roles
        lastTurn.parts.push(...turn.parts);
      } else {
        consolidatedTurns.push({
          role: turn.role,
          parts: [...turn.parts]
        });
      }
    }

    // Ensure the turns start with 'user'
    while (consolidatedTurns.length > 0 && consolidatedTurns[0].role !== 'user') {
      consolidatedTurns.shift();
    }

    // Fallback if empty
    if (consolidatedTurns.length === 0) {
      consolidatedTurns.push({
        role: 'user',
        parts: userParts
      });
    }

    return consolidatedTurns;
  }

  async *streamChat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamEventChunk, void, unknown> {
    const startTime = Date.now();
    const client = this.getClient();
    let targetModel = 'gemini-3-flash-preview';
    if (options.model === 'gemini-3.1-flash-lite' && (!options.multimodalParts || options.multimodalParts.length === 0)) {
      targetModel = 'gemini-3.1-flash-lite';
    }
    const contents = this.sanitizeContents(options.history, options.message, options.multimodalParts);

    // If research mode or security research / web search is requested, enable Google Search Grounding
    const enableSearch = options.mode === 'research' || Boolean((options as any).webSearch) || (options as any).cyberAction === 'security_research';
    const tools = enableSearch ? [{ googleSearch: {} }] : undefined;

    const tryGenerate = async (modelToUse: string) => {
      return await client.models.generateContentStream({
        model: modelToUse,
        contents,
        config: {
          systemInstruction: options.resolvedSystemPrompt,
          temperature: options.options?.temperature ?? 0.7,
          topP: options.options?.topP ?? 0.95,
          ...(tools && tools.length > 0 ? { tools: tools as any } : {})
        }
      });
    };

    try {
      let responseStream;
      try {
        responseStream = await tryGenerate(targetModel);
      } catch (firstErr: any) {
        console.warn(`[Gemini] Primary model ${targetModel} issue, falling back to gemini-3.1-flash-lite...`);
        responseStream = await tryGenerate('gemini-3.1-flash-lite');
      }

      let accumulatedText = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      const collectedSources: Array<{ title: string; url: string; domain: string; snippet?: string }> = [];

      for await (const chunk of responseStream) {
        if (abortSignal?.aborted) {
          break;
        }

        const text = chunk.text;
        if (text) {
          accumulatedText += text;
          yield { type: 'chunk', text };
        }

        // Capture grounding metadata if web search was performed
        const grounding = (chunk.candidates?.[0] as any)?.groundingMetadata;
        if (grounding?.groundingChunks && Array.isArray(grounding.groundingChunks)) {
          for (const gc of grounding.groundingChunks) {
            if (gc.web?.uri) {
              const url = gc.web.uri;
              let domain = '';
              try { domain = new URL(url).hostname; } catch {}
              if (!collectedSources.some(s => s.url === url)) {
                collectedSources.push({
                  title: gc.web.title || domain || 'Web Resource',
                  url,
                  domain,
                  snippet: gc.web.title || ''
                });
              }
            }
          }
        }

        // Capture usage metadata if provided by the model stream
        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount || promptTokens;
          completionTokens = chunk.usageMetadata.candidatesTokenCount || completionTokens;
          totalTokens = chunk.usageMetadata.totalTokenCount || totalTokens;
        }
      }

      if (collectedSources.length > 0) {
        yield {
          type: 'sources',
          sources: collectedSources
        };
        yield {
          type: 'citations',
          citations: collectedSources.map(s => ({
            title: s.title,
            url: s.url,
            domain: s.domain
          }))
        };
      }

      const latencyMs = Date.now() - startTime;

      // Yield final real usage metrics
      yield {
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          model: options.model,
          provider: this.name
        }
      };

      yield { type: 'done' };
    } catch (err: any) {
      if (abortSignal?.aborted) {
        yield { type: 'done' };
        return;
      }

      let cleanMessage = 'Gemini inference engine encountered an unexpected error.';
      try {
        if (err?.message) {
          const parsed = JSON.parse(err.message);
          if (parsed?.error?.message) {
            try {
              const nested = JSON.parse(parsed.error.message);
              cleanMessage = nested?.error?.message || parsed.error.message;
            } catch {
              cleanMessage = parsed.error.message;
            }
          } else {
            cleanMessage = err.message;
          }
        }
      } catch {
        cleanMessage = err?.message || cleanMessage;
      }

      yield {
        type: 'error',
        error: cleanMessage,
        code: err?.status || 'GEMINI_INFERENCE_ERROR'
      };
    }
  }

  async chat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): Promise<NonStreamChatResponse> {
    const startTime = Date.now();
    const client = this.getClient();
    const targetModel = options.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3-flash-preview';
    const contents = this.sanitizeContents(options.history, options.message);

    try {
      let response;
      try {
        response = await client.models.generateContent({
          model: targetModel,
          contents,
          config: {
            systemInstruction: options.resolvedSystemPrompt,
            temperature: options.options?.temperature ?? 0.7,
            topP: options.options?.topP ?? 0.95
          }
        });
      } catch {
        response = await client.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction: options.resolvedSystemPrompt,
            temperature: options.options?.temperature ?? 0.7,
            topP: options.options?.topP ?? 0.95
          }
        });
      }

      const text = response.text || '';
      const latencyMs = Date.now() - startTime;
      const usageMetadata = response.usageMetadata;

      const usage: UsageMetadata = {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
        latencyMs,
        model: options.model,
        provider: this.name
      };

      return {
        id: `msg-${Date.now()}`,
        content: text,
        model: options.model,
        provider: this.name,
        usage,
        status: 'completed'
      };
    } catch (err: any) {
      return {
        id: `msg-${Date.now()}`,
        content: '',
        model: options.model,
        provider: this.name,
        status: 'error',
        errorMessage: err?.message || 'Failed to complete inference request'
      };
    }
  }

  async healthCheck(modelId?: string): Promise<ModelHealthCheckResult> {
    const regEntry = getRegisteredModel(modelId || 'gemini-3-flash-preview');
    const targetModel = regEntry?.modelId || process.env.GOOGLE_MODEL || process.env.GEMINI_MODEL || modelId || 'gemini-3-flash-preview';
    const checkedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        modelKey: modelId || 'gemini-3-flash-preview',
        provider: this.id,
        modelId: targetModel,
        status: 'NOT_CONFIGURED',
        error: 'GOOGLE_API_KEY / GEMINI_API_KEY environment variable is not defined.',
        checkedAt
      };
    }

    const startTime = Date.now();
    try {
      const client = this.getClient();
      // Send a minimal real request to verify model access
      await client.models.generateContent({
        model: targetModel,
        contents: 'Ping'
      });

      const latencyMs = Date.now() - startTime;
      return {
        modelKey: modelId || 'gemini-3-flash-preview',
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
        modelKey: modelId || 'gemini-3-flash-preview',
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
    const msg = err?.message || 'Unknown Google Gemini error';

    if (statusNumber === 401 || statusNumber === 403 || msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
      return { status: 'INVALID_API_KEY', message: 'Invalid Google Gemini API key provided.' };
    }
    if (statusNumber === 404 || msg.includes('models/') || msg.includes('not found')) {
      return { status: 'MODEL_UNAVAILABLE', message: `Requested Google Gemini model is not accessible: ${msg}` };
    }
    if (statusNumber === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      return { status: 'RATE_LIMITED', message: `Google Gemini quota or rate limit reached: ${msg}` };
    }
    if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
      return { status: 'NETWORK_ERROR', message: `Network connection to Google Gemini failed: ${msg}` };
    }
    return { status: 'PROVIDER_ERROR', message: msg };
  }
}
