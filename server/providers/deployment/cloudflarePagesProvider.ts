import { DeploymentParams, DeploymentProvider, DeploymentResult, HealthCheckResult } from './types.js';

export class CloudflarePagesDeploymentProvider implements DeploymentProvider {
  readonly name = 'cloudflare' as const;
  readonly displayName = 'Cloudflare Pages';

  private token: string;
  private accountId?: string;
  private projectName?: string;

  constructor() {
    this.token = process.env.CLOUDFLARE_API_TOKEN || '';
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.projectName = process.env.CLOUDFLARE_PROJECT_NAME;
  }

  isConfigured(): boolean {
    return Boolean(
      this.token &&
      this.token.trim().length > 0 &&
      this.accountId &&
      this.accountId.trim().length > 0 &&
      this.projectName &&
      this.projectName.trim().length > 0
    );
  }

  getDetails() {
    const configured = this.isConfigured();
    return {
      configured,
      provider: 'cloudflare' as const,
      name: this.displayName,
      targetProject: this.projectName || 'Unset Project',
      reason: configured ? undefined : 'CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, or CLOUDFLARE_PROJECT_NAME is missing.',
      supportedEnvironments: ['production', 'preview', 'development'] as any,
      supportedFeatures: {
        customDomains: true,
        healthChecks: true,
        rollback: true,
        cancel: false
      }
    };
  }

  async deploy(params: DeploymentParams): Promise<DeploymentResult> {
    const logs: Array<{ level: 'info' | 'warn' | 'error' | 'system'; message: string; timestamp: string }> = [];
    const addLog = (level: 'info' | 'warn' | 'error' | 'system', message: string) => {
      logs.push({ level, message, timestamp: new Date().toISOString() });
    };

    if (!this.isConfigured()) {
      addLog('error', 'Cloudflare Pages credentials missing. Deployment aborted.');
      return {
        success: false,
        status: 'failed',
        error: 'Cloudflare Pages credentials are not configured in server environment variables.',
        logs
      };
    }

    addLog('system', `Initializing Cloudflare Pages deployment for project "${this.projectName}"...`);

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId!)}/pages/projects/${encodeURIComponent(this.projectName!)}/deployments`;

      addLog('info', `Connecting to Cloudflare API (${url})...`);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          branch: params.environment === 'production' ? 'main' : 'preview'
        }),
        signal: AbortSignal.timeout(45000)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        const errorMsg = data?.errors?.[0]?.message || `Cloudflare HTTP ${res.status}: ${res.statusText}`;
        addLog('error', `Cloudflare API error: ${errorMsg}`);
        return {
          success: false,
          status: 'failed',
          error: errorMsg,
          rawResponse: data,
          logs
        };
      }

      const result = data?.result;
      const deploymentUrl = result?.url;
      const providerDeploymentId = result?.id;

      addLog('system', 'Cloudflare Pages deployment triggered successfully.');
      if (deploymentUrl) {
        addLog('info', `Deployment URL: ${deploymentUrl}`);
      }

      return {
        success: true,
        status: 'running',
        deploymentUrl,
        providerDeploymentId,
        rawResponse: data,
        logs
      };
    } catch (err: any) {
      addLog('error', `Cloudflare deployment exception: ${err?.message || 'Network error'}`);
      return {
        success: false,
        status: 'failed',
        error: err?.message || 'Failed to communicate with Cloudflare Pages API',
        logs
      };
    }
  }

  async checkHealth(url: string): Promise<HealthCheckResult> {
    if (!url) return { status: 'unknown', error: 'No deployment URL.' };
    const startTime = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(7000),
        headers: { 'User-Agent': 'Darkano-AI-Health-Checker/1.0' }
      });
      const latencyMs = Date.now() - startTime;
      const isHealthy = res.status >= 200 && res.status < 400;
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        statusCode: res.status,
        latencyMs,
        error: isHealthy ? undefined : `HTTP status ${res.status}`
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        error: err?.message || 'Connection failed'
      };
    }
  }
}
