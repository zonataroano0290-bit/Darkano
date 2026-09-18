import { BaseAIProvider } from './base.js';
import { GeminiProvider } from './gemini.js';
import { DarkanoProvider } from './darkano.js';
import { ServerModelInfo } from '../types.js';

export class ProviderRegistry {
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelProviderMap: Map<string, BaseAIProvider> = new Map();

  constructor() {
    const darkano = new DarkanoProvider();
    const gemini = new GeminiProvider();

    this.registerProvider(darkano);
    this.registerProvider(gemini);
  }

  registerProvider(provider: BaseAIProvider) {
    this.providers.set(provider.id, provider);
    for (const model of provider.getModels()) {
      this.modelProviderMap.set(model.id, provider);
    }
  }

  getProviderForModel(modelId: string): BaseAIProvider | null {
    return this.modelProviderMap.get(modelId) || null;
  }

  getAllModels(): ServerModelInfo[] {
    const models: ServerModelInfo[] = [];

    // Registered providers
    for (const provider of this.providers.values()) {
      models.push(...provider.getModels());
    }

    // Unconfigured third-party providers shown with accurate availability
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0);
    const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0);

    models.push(
      {
        id: 'claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
        provider: 'Anthropic',
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
        isAvailable: hasAnthropic,
        streamingSupported: true,
        accentColor: '#d97706'
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        category: 'flagship',
        description: 'High-intelligence omni model supporting unified reasoning across text, code, vision, and tool calling.',
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
        isAvailable: hasOpenAI,
        streamingSupported: true,
        accentColor: '#10a37f'
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1',
        provider: 'DeepSeek',
        category: 'reasoning',
        description: 'Open-weight frontier reasoning model trained via large-scale reinforcement learning for step-by-step mathematical proofs.',
        contextWindow: '64k tokens',
        maxOutputTokens: '8k tokens',
        latencyTier: 'Deep Think',
        capabilities: ['Chain-of-Thought', 'Formal Verification', 'Math Competition', 'Logic Puzzles'],
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
          long_context: false
        },
        isAvailable: hasDeepSeek,
        streamingSupported: true,
        accentColor: '#6366f1'
      },
      {
        id: 'llama-3.3-70b',
        name: 'Llama 3.3 70B',
        provider: 'Meta',
        category: 'open-weights',
        description: 'Enterprise open-weights model balancing industry-standard safety benchmarks with state-of-the-art coding and dialogue.',
        contextWindow: '128k tokens',
        maxOutputTokens: '8k tokens',
        latencyTier: 'Balanced',
        capabilities: ['Private Hostable', 'Enterprise Tooling', 'Multilingual', 'Cost Optimized'],
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
        isAvailable: false,
        streamingSupported: true,
        accentColor: '#0ea5e9'
      }
    );

    return models;
  }

  getHealth() {
    const configuredProviders: string[] = [];
    for (const [id, provider] of this.providers.entries()) {
      if (provider.isConfigured()) {
        configuredProviders.push(provider.name);
      }
    }

    return {
      status: configuredProviders.length > 0 ? 'healthy' : 'degraded',
      configuredProviders,
      totalModels: this.getAllModels().length,
      availableModels: this.getAllModels().filter(m => m.isAvailable).length,
      timestamp: new Date().toISOString()
    };
  }
}

export const providerRegistry = new ProviderRegistry();
