import { DeploymentParams, DeploymentProvider, DeploymentResult, HealthCheckResult } from './types.js';

export class NetlifyDeploymentProvider implements DeploymentProvider {
  readonly name = 'netlify' as const;
  readonly displayName = 'Netlify Cloud Platform';

  private token: string;
  private siteId?: string;

  constructor() {
    this.token = process.env.NETLIFY_TOKEN || '';
    this.siteId = process.env.NETLIFY_SITE_ID;
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.token.trim().length > 0 && this.siteId && this.siteId.trim().length > 0);
  }

  getDetails() {
    const configured = this.isConfigured();
    return {
      configured,
      provider: 'netlify' as const,
      name: this.displayName,
      targetProject: this.siteId || 'Unset Site ID',
      reason: configured ? undefined : 'NETLIFY_TOKEN or NETLIFY_SITE_ID is not configured in server environment variables.',
      supportedEnvironments: ['production', 'preview', 'development'] as any,
      supportedFeatures: {
        customDomains: true,
        healthChecks: true,
        rollback: true,
        cancel: true
      }
    };
  }

  async deploy(params: DeploymentParams): Promise<DeploymentResult> {
    const logs: Array<{ level: 'info' | 'warn' | 'error' | 'system'; message: string; timestamp: string }> = [];
    const addLog = (level: 'info' | 'warn' | 'error' | 'system', message: string) => {
      logs.push({ level, message, timestamp: new Date().toISOString() });
    };

    if (!this.isConfigured()) {
      addLog('error', 'Netlify credentials missing (NETLIFY_TOKEN and NETLIFY_SITE_ID required). Deployment aborted.');
      return {
        success: false,
        status: 'failed',
        error: 'Netlify credentials are not configured in server environment variables.',
        logs
      };
    }

    addLog('system', `Initializing Netlify deployment for site ${this.siteId}...`);

    try {
      const url = `https://api.netlify.com/api/v1/sites/${encodeURIComponent(this.siteId!)}/deploys`;

      // Build file manifest
      const filesMap: Record<string, string> = {};
      for (const file of params.files) {
        if (file.fileType === 'file') {
          const cleanPath = file.path.startsWith('/') ? file.path : `/${file.path}`;
          filesMap[cleanPath] = file.content;
        }
      }

      addLog('info', `Connecting to Netlify Deployments API (${url})...`);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `Darkano Deploy: ${params.projectName} (${params.environment})`,
          draft: params.environment !== 'production'
        }),
        signal: AbortSignal.timeout(45000)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data?.message || `Netlify HTTP ${res.status}: ${res.statusText}`;
        addLog('error', `Netlify API error: ${errorMsg}`);
        return {
          success: false,
          status: 'failed',
          error: errorMsg,
          rawResponse: data,
          logs
        };
      }

      const deploymentUrl = data?.ssl_url || data?.deploy_ssl_url || data?.url;
      const providerDeploymentId = data?.id;

      addLog('system', 'Netlify deployment registered successfully.');
      if (deploymentUrl) {
        addLog('info', `Deployment live URL: ${deploymentUrl}`);
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
      addLog('error', `Netlify deployment exception: ${err?.message || 'Network error'}`);
      return {
        success: false,
        status: 'failed',
        error: err?.message || 'Failed to communicate with Netlify API',
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
