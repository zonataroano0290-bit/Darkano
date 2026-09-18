import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider, ProviderChatOptions } from './base.js';
import {
  ServerModelInfo,
  StreamEventChunk,
  NonStreamChatResponse,
  UsageMetadata
} from '../types.js';

export class GeminiProvider extends BaseAIProvider {
  readonly id = 'google';
  readonly name = 'Google DeepMind';

  private aiClient: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
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
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
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
        capabilities: ['Sub-second Response', '1M Context', 'Deep Multimodal', 'Zero-Latency Routing'],
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
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#818cf8'
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
    const targetModel = options.model === 'gemini-2.5-pro' ? 'gemini-3.8-flash' : 'gemini-3.8-flash';
    const contents = this.sanitizeContents(options.history, options.message, options.multimodalParts);

    // If research mode is active, enable Google Search Grounding
    const tools = options.mode === 'research' ? [{ googleSearch: {} }] : undefined;

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
        const errMsg = String(firstErr?.message || '');
        if (
          errMsg.includes('503') ||
          errMsg.includes('429') ||
          errMsg.includes('Quota') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand')
        ) {
          console.warn(`[Gemini] Primary model ${targetModel} busy/rate-limited, falling back to resilient secondary...`);
          responseStream = await tryGenerate('gemini-3.1-flash-lite');
        } else {
          throw firstErr;
        }
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
    const targetModel = options.model === 'gemini-2.5-pro' ? 'gemini-3.8-flash' : 'gemini-3.8-flash';
    const contents = this.sanitizeContents(options.history, options.message);

    try {
      const response = await client.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction: options.resolvedSystemPrompt,
          temperature: options.options?.temperature ?? 0.7,
          topP: options.options?.topP ?? 0.95
        }
      });

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
}
