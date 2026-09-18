import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider, ProviderChatOptions } from './base.js';
import {
  ServerModelInfo,
  StreamEventChunk,
  NonStreamChatResponse,
  UsageMetadata
} from '../types.js';

export class DarkanoProvider extends BaseAIProvider {
  readonly id = 'darkano';
  readonly name = 'Darkano Core';

  private aiClient: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('Darkano neural matrix backend requires configured inference engine credentials.');
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
        id: 'darkano-ultra-v2',
        name: 'Darkano Ultra v2',
        provider: 'Darkano Core',
        category: 'flagship',
        description: 'Flagship frontier model engineered for deep synthetic reasoning, complex multi-domain logic, and autonomous task graphs.',
        contextWindow: '200k tokens',
        maxOutputTokens: '16k tokens',
        latencyTier: 'Deep Think',
        capabilities: ['Deep Reasoning', 'Mathematical Synthesis', 'Complex Planning', 'Multi-Modal'],
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#06b6d4',
        isFlagship: true
      },
      {
        id: 'darkano-flash-v2',
        name: 'Darkano Flash v2',
        provider: 'Darkano Core',
        category: 'fast',
        description: 'Sub-second latency powerhouse optimized for high-throughput code iteration, instant chat, and massive context digestion.',
        contextWindow: '1M tokens',
        maxOutputTokens: '8k tokens',
        latencyTier: 'Ultra Fast',
        capabilities: ['Sub-second Response', '1M Context', 'Realtime Extraction', 'High Throughput'],
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#38bdf8'
      },
      {
        id: 'darkano-code-x',
        name: 'Darkano Code-X',
        provider: 'Darkano Systems',
        category: 'coding',
        description: 'Specialized polyglot coding model trained on verified ASTs, kernel subsystems, and distributed cloud architectures.',
        contextWindow: '128k tokens',
        maxOutputTokens: '16k tokens',
        latencyTier: 'Fast',
        capabilities: ['AST Refactoring', 'Test Scaffolding', 'Security Audit', 'Cross-Language Migration'],
        isAvailable: available,
        streamingSupported: true,
        accentColor: '#10b981'
      }
    ];
  }

  private sanitizeContents(history: ProviderChatOptions['history'], currentMessage: string) {
    const rawTurns: { role: 'user' | 'model'; text: string }[] = [];

    if (history && history.length > 0) {
      for (const h of history) {
        if (!h.content || h.content.trim().length === 0) continue;
        const role = h.role === 'assistant' ? 'model' : 'user';
        rawTurns.push({ role, text: h.content });
      }
    }

    rawTurns.push({ role: 'user', text: currentMessage });

    const consolidatedTurns: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

    for (const turn of rawTurns) {
      const lastTurn = consolidatedTurns[consolidatedTurns.length - 1];
      if (lastTurn && lastTurn.role === turn.role) {
        lastTurn.parts[0].text += `\n\n${turn.text}`;
      } else {
        consolidatedTurns.push({
          role: turn.role,
          parts: [{ text: turn.text }]
        });
      }
    }

    while (consolidatedTurns.length > 0 && consolidatedTurns[0].role !== 'user') {
      consolidatedTurns.shift();
    }

    if (consolidatedTurns.length === 0) {
      consolidatedTurns.push({
        role: 'user',
        parts: [{ text: currentMessage }]
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
    const contents = this.sanitizeContents(options.history, options.message);

    // Tune parameters based on model specialty
    let temp = options.options?.temperature ?? 0.7;
    let topP = options.options?.topP ?? 0.95;

    if (options.model === 'darkano-code-x') {
      temp = Math.min(temp, 0.2); // Deterministic code generation
    } else if (options.model === 'darkano-ultra-v2') {
      temp = 0.6; // High analytical precision
    }

    // Select primary model based on Darkano specification
    let targetModel = 'gemini-3.8-flash';
    if (options.model === 'darkano-flash-v2') {
      targetModel = 'gemini-3.1-flash-lite';
    }

    const tryGenerate = async (modelToUse: string) => {
      return await client.models.generateContentStream({
        model: modelToUse,
        contents,
        config: {
          systemInstruction: options.resolvedSystemPrompt,
          temperature: temp,
          topP
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
          console.warn(`[Darkano] Primary model ${targetModel} busy/rate-limited, falling back to resilient secondary...`);
          responseStream = await tryGenerate('gemini-3.1-flash-lite');
        } else {
          throw firstErr;
        }
      }

      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      for await (const chunk of responseStream) {
        if (abortSignal?.aborted) {
          break;
        }

        const text = chunk.text;
        if (text) {
          yield { type: 'chunk', text };
        }

        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount || promptTokens;
          completionTokens = chunk.usageMetadata.candidatesTokenCount || completionTokens;
          totalTokens = chunk.usageMetadata.totalTokenCount || totalTokens;
        }
      }

      const latencyMs = Date.now() - startTime;

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

      let cleanMessage = 'Darkano inference matrix experienced a dispatch interruption.';
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
        code: err?.status || 'DARKANO_DISPATCH_ERROR'
      };
    }
  }

  async chat(
    options: ProviderChatOptions,
    abortSignal?: AbortSignal
  ): Promise<NonStreamChatResponse> {
    const startTime = Date.now();
    const client = this.getClient();
    const contents = this.sanitizeContents(options.history, options.message);

    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
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
        errorMessage: err?.message || 'Inference dispatch failed'
      };
    }
  }
}
