import { BaseAIProvider } from './base.js';
import { GeminiProvider } from './gemini.js';
import { DarkanoProvider } from './darkano.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { XAIProvider } from './xai.js';
import { ServerModelInfo, ModelHealthCheckResult } from '../types.js';
import { MODEL_REGISTRY, getRegisteredModel } from './modelRegistry.js';

export class ProviderRegistry {
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelProviderMap: Map<string, BaseAIProvider> = new Map();

  constructor() {
    const darkano = new DarkanoProvider();
    const gemini = new GeminiProvider();
    const openai = new OpenAIProvider();
    const anthropic = new AnthropicProvider();
    const xai = new XAIProvider();

    this.registerProvider(darkano);
    this.registerProvider(gemini);
    this.registerProvider(openai);
    this.registerProvider(anthropic);
    this.registerProvider(xai);

    // Map all models in MODEL_REGISTRY to their respective providers
    this.syncModelRegistryMappings();
  }

  registerProvider(provider: BaseAIProvider) {
    this.providers.set(provider.id, provider);
  }

  private syncModelRegistryMappings() {
    for (const [key, entry] of Object.entries(MODEL_REGISTRY)) {
      const provider = this.providers.get(entry.provider);
      if (provider) {
        this.modelProviderMap.set(key, provider);
      }
    }
  }

  getProvider(providerId: string): BaseAIProvider | null {
    return this.providers.get(providerId) || null;
  }

  getProviderForModel(modelId: string): BaseAIProvider | null {
    if (!modelId) return null;
    const cleanId = modelId.trim();

    // Check direct mapping from MODEL_REGISTRY
    const mapped = this.modelProviderMap.get(cleanId);
    if (mapped) return mapped;

    // Check by registered model entry provider
    const entry = getRegisteredModel(cleanId);
    if (entry) {
      const prov = this.providers.get(entry.provider);
      if (prov) return prov;
    }

    // Default heuristics based on prefix
    if (cleanId.startsWith('gemini')) return this.providers.get('google') || null;
    if (cleanId.startsWith('gpt')) return this.providers.get('openai') || null;
    if (cleanId.startsWith('claude')) return this.providers.get('anthropic') || null;
    if (cleanId.startsWith('grok')) return this.providers.get('xai') || null;
    if (cleanId.startsWith('darkano')) return this.providers.get('darkano') || null;

    return null;
  }

  getAllProviders(): BaseAIProvider[] {
    return Array.from(this.providers.values());
  }

  getAllModels(): ServerModelInfo[] {
    const list: ServerModelInfo[] = [];

    for (const [key, entry] of Object.entries(MODEL_REGISTRY)) {
      const provider = this.providers.get(entry.provider);
      const isConfigured = provider ? provider.isConfigured() : false;

      list.push({
        id: entry.key,
        name: entry.name,
        provider: provider ? provider.name : entry.provider,
        category: entry.category,
        description: entry.description,
        contextWindow: entry.contextWindow,
        maxOutputTokens: entry.maxOutputTokens,
        latencyTier: entry.latencyTier,
        capabilities: entry.capabilities,
        capabilityMatrix: entry.capabilityMatrix,
        isAvailable: isConfigured && entry.enabled,
        streamingSupported: entry.streamingSupported,
        accentColor: entry.accentColor
      });
    }

    return list;
  }

  getAvailableProviderIds(): Set<string> {
    const configured = new Set<string>();
    for (const [id, provider] of this.providers.entries()) {
      if (provider.isConfigured()) {
        configured.add(id);
      }
    }
    return configured;
  }

  async runHealthChecks(): Promise<ModelHealthCheckResult[]> {
    const results: ModelHealthCheckResult[] = [];

    // Health check one primary model per registered provider
    const providerPrimaryModel: Record<string, string> = {
      darkano: 'darkano-ultra-v2',
      google: 'gemini-3-flash-preview',
      openai: 'gpt-4o',
      anthropic: 'claude-3.7-sonnet',
      xai: 'grok-2'
    };

    for (const [providerId, provider] of this.providers.entries()) {
      const primaryKey = providerPrimaryModel[providerId] || 'default';
      try {
        const result = await provider.healthCheck(primaryKey);
        results.push(result);
      } catch (err: any) {
        results.push({
          modelKey: primaryKey,
          provider: providerId,
          modelId: primaryKey,
          status: 'PROVIDER_ERROR',
          error: err?.message || 'Health check execution crashed',
          checkedAt: new Date().toISOString()
        });
      }
    }

    return results;
  }

  getHealthSummary() {
    const configuredProviders: string[] = [];
    const unconfiguredProviders: string[] = [];

    for (const [id, provider] of this.providers.entries()) {
      if (provider.isConfigured()) {
        configuredProviders.push(provider.name);
      } else {
        unconfiguredProviders.push(provider.name);
      }
    }

    const allModels = this.getAllModels();
    const availableCount = allModels.filter(m => m.isAvailable).length;

    return {
      status: configuredProviders.length > 0 ? 'healthy' : 'degraded',
      configuredProviders,
      unconfiguredProviders,
      totalModels: allModels.length,
      availableModels: availableCount,
      timestamp: new Date().toISOString()
    };
  }

  getHealth() {
    return this.getHealthSummary();
  }
}

export const providerRegistry = new ProviderRegistry();
