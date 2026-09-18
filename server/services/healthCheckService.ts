import { providerRegistry } from '../providers/registry.js';
import { MODEL_REGISTRY } from '../providers/modelRegistry.js';
import { ModelHealthCheckResult } from '../types.js';
import { db } from '../db/database.js';

interface CachedHealthCheck {
  results: ModelHealthCheckResult[];
  summary: any;
  cachedAt: number;
}

export class HealthCheckService {
  private cache: CachedHealthCheck | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

  async checkHealth(forceRefresh = false): Promise<{ results: ModelHealthCheckResult[]; summary: any }> {
    const now = Date.now();

    if (!forceRefresh && this.cache && now - this.cache.cachedAt < this.CACHE_TTL_MS) {
      return {
        results: this.cache.results,
        summary: this.cache.summary
      };
    }

    console.log('[HealthCheckService] Executing real multi-model provider verification...');
    const results = await providerRegistry.runHealthChecks();
    const summary = providerRegistry.getHealthSummary();

    // Persist health statuses into database
    this.persistHealthResults(results);

    this.cache = {
      results,
      summary: {
        ...summary,
        lastVerifiedAt: new Date().toISOString()
      },
      cachedAt: now
    };

    return {
      results,
      summary: this.cache.summary
    };
  }

  private persistHealthResults(results: ModelHealthCheckResult[]) {
    try {
      const now = new Date().toISOString();

      // Upsert provider records
      const upsertProvider = db.prepare(`
        INSERT INTO ai_providers (id, name, isConfigured, healthStatus, lastHealthCheckAt, latencyMs, errorDetails, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          healthStatus = excluded.healthStatus,
          lastHealthCheckAt = excluded.lastHealthCheckAt,
          latencyMs = excluded.latencyMs,
          errorDetails = excluded.errorDetails,
          updatedAt = excluded.updatedAt
      `);

      for (const res of results) {
        const provider = providerRegistry.getProvider(res.provider);
        const isConfigured = provider ? (provider.isConfigured() ? 1 : 0) : 0;
        upsertProvider.run(
          res.provider,
          provider ? provider.name : res.provider,
          isConfigured,
          res.status,
          res.checkedAt,
          res.latencyMs || 0,
          res.error || null,
          now
        );
      }

      // Upsert models records
      const upsertModel = db.prepare(`
        INSERT INTO ai_models (id, providerId, name, modelId, enabled, isAvailable, healthStatus, latencyMs, capabilitiesJson, lastHealthCheckAt, errorDetails, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          healthStatus = excluded.healthStatus,
          isAvailable = excluded.isAvailable,
          latencyMs = excluded.latencyMs,
          lastHealthCheckAt = excluded.lastHealthCheckAt,
          errorDetails = excluded.errorDetails,
          updatedAt = excluded.updatedAt
      `);

      for (const [key, entry] of Object.entries(MODEL_REGISTRY)) {
        const matchingResult = results.find(r => r.provider === entry.provider);
        const healthStatus = matchingResult ? matchingResult.status : 'NOT_CONFIGURED';
        const isAvailable = healthStatus === 'CONNECTED' ? 1 : 0;
        const latencyMs = matchingResult?.latencyMs || 0;
        const errorDetails = matchingResult?.error || null;

        upsertModel.run(
          entry.key,
          entry.provider,
          entry.name,
          entry.modelId,
          entry.enabled ? 1 : 0,
          isAvailable,
          healthStatus,
          latencyMs,
          JSON.stringify(entry.capabilities),
          now,
          errorDetails,
          now,
          now
        );
      }
    } catch (err) {
      console.warn('[HealthCheckService] Failed to persist health results to SQLite:', err);
    }
  }

  logAIRequest(params: {
    requestId: string;
    userId: string;
    conversationId?: string;
    modelKey: string;
    providerId: string;
    modelId: string;
    mode: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    creditsDeducted: number;
    latencyMs: number;
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'STREAMING';
    errorCategory?: string;
    errorMessage?: string;
  }) {
    try {
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO ai_requests (
          id, requestId, userId, conversationId, modelKey, providerId, modelId,
          mode, inputTokens, outputTokens, totalTokens, creditsDeducted, latencyMs,
          status, errorCategory, errorMessage, createdAt, completedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insert.run(
        `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        params.requestId,
        params.userId,
        params.conversationId || null,
        params.modelKey,
        params.providerId,
        params.modelId,
        params.mode,
        params.inputTokens,
        params.outputTokens,
        params.totalTokens,
        params.creditsDeducted,
        params.latencyMs,
        params.status,
        params.errorCategory || null,
        params.errorMessage || null,
        now,
        params.status === 'COMPLETED' || params.status === 'FAILED' ? now : null
      );
    } catch (err) {
      console.warn('[HealthCheckService] Failed to log AI request to SQLite:', err);
    }
  }
}

export const healthCheckService = new HealthCheckService();
