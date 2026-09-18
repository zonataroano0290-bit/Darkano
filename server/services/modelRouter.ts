import { providerRegistry } from '../providers/registry.js';
import {
  MODEL_REGISTRY,
  getRegisteredModel,
  validateModelAllowlist,
  routeAutoModel
} from '../providers/modelRegistry.js';
import { ModelRegistryEntry, WorkspaceMode } from '../types.js';
import { BaseAIProvider } from '../providers/base.js';

export interface ResolvedModelResult {
  success: boolean;
  modelKey: string;
  provider: BaseAIProvider;
  modelEntry: ModelRegistryEntry;
  isAuto: boolean;
  autoReason?: string;
  error?: string;
  errorCode?: string;
}

export class ModelRouter {
  /**
   * Resolves the target model and provider based on strict server allowlist rules
   * and capability checks.
   */
  resolveModel(params: {
    requestedModel: string;
    mode: WorkspaceMode;
    hasVision?: boolean;
    hasAudio?: boolean;
  }): ResolvedModelResult {
    const { requestedModel, mode, hasVision = false, hasAudio = false } = params;

    // 1. Auto Mode
    if (!requestedModel || requestedModel === 'auto') {
      const availableProviders = providerRegistry.getAvailableProviderIds();
      const routeResult = routeAutoModel({
        mode,
        hasVision,
        hasAudio,
        availableProviders
      });

      const provider = providerRegistry.getProvider(routeResult.provider);
      if (!provider) {
        return {
          success: false,
          modelKey: routeResult.selectedModel,
          provider: null as any,
          modelEntry: routeResult.entry,
          isAuto: true,
          error: `Auto routing resolved to provider '${routeResult.provider}', but provider instance was not found.`,
          errorCode: 'PROVIDER_NOT_FOUND'
        };
      }

      return {
        success: true,
        modelKey: routeResult.selectedModel,
        provider,
        modelEntry: routeResult.entry,
        isAuto: true,
        autoReason: routeResult.reason
      };
    }

    // 2. Manual Model Validation
    const validation = validateModelAllowlist(requestedModel);
    if (!validation.valid || !validation.entry) {
      return {
        success: false,
        modelKey: requestedModel,
        provider: null as any,
        modelEntry: null as any,
        isAuto: false,
        error: validation.error || `Model '${requestedModel}' is invalid.`,
        errorCode: validation.code || 'INVALID_MODEL'
      };
    }

    const entry = validation.entry;

    // Check capability matrix
    if (hasVision && !entry.capabilityMatrix.vision) {
      return {
        success: false,
        modelKey: entry.key,
        provider: null as any,
        modelEntry: entry,
        isAuto: false,
        error: `Model '${entry.name}' does not support vision/image input. Please choose a vision-capable model.`,
        errorCode: 'CAPABILITY_UNSUPPORTED'
      };
    }

    if (hasAudio && !entry.capabilityMatrix.audio_input) {
      return {
        success: false,
        modelKey: entry.key,
        provider: null as any,
        modelEntry: entry,
        isAuto: false,
        error: `Model '${entry.name}' does not support audio input. Please choose an audio-capable model.`,
        errorCode: 'CAPABILITY_UNSUPPORTED'
      };
    }

    // Resolve provider
    const provider = providerRegistry.getProviderForModel(entry.key);
    if (!provider) {
      return {
        success: false,
        modelKey: entry.key,
        provider: null as any,
        modelEntry: entry,
        isAuto: false,
        error: `No provider registered to handle model '${entry.name}'.`,
        errorCode: 'PROVIDER_NOT_REGISTERED'
      };
    }

    // Check provider configuration
    if (!provider.isConfigured()) {
      return {
        success: false,
        modelKey: entry.key,
        provider,
        modelEntry: entry,
        isAuto: false,
        error: `Provider '${provider.name}' for model '${entry.name}' is not configured on this server. Missing credentials.`,
        errorCode: 'NOT_CONFIGURED'
      };
    }

    return {
      success: true,
      modelKey: entry.key,
      provider,
      modelEntry: entry,
      isAuto: false
    };
  }
}

export const modelRouter = new ModelRouter();
