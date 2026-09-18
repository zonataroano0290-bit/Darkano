import { DeploymentParams, DeploymentProvider, DeploymentResult, HealthCheckResult } from './types.js';

export class VercelDeploymentProvider implements DeploymentProvider {
  readonly name = 'vercel' as const;
  readonly displayName = 'Vercel Cloud Platform';

  private token: string;
  private projectId?: string;
  private teamId?: string;

  constructor() {
    this.token = process.env.VERCEL_TOKEN || '';
    this.projectId = process.env.VERCEL_PROJECT_ID;
    this.teamId = process.env.VERCEL_TEAM_ID;
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.token.trim().length > 0);
  }

  getDetails() {
    const configured = this.isConfigured();
    return {
      configured,
      provider: 'vercel' as const,
      name: this.displayName,
      targetProject: this.projectId || 'Auto-created Vercel Project',
      reason: configured ? undefined : 'VERCEL_TOKEN is not configured in environment variables.',
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
      addLog('error', 'VERCEL_TOKEN is missing. Deployment aborted.');
      return {
        success: false,
        status: 'failed',
        error: 'VERCEL_TOKEN is not configured in server environment variables.',
        logs
      };
    }

    addLog('system', `Initializing Vercel deployment for project "${params.projectName}" (Env: ${params.environment})...`);

    try {
      // 1. Prepare files payload for Vercel REST API
      const vercelFiles = params.files
        .filter(f => f.fileType === 'file')
        .map(f => ({
          file: f.path.startsWith('/') ? f.path.slice(1) : f.path,
          data: f.content
        }));

      addLog('info', `Packaging ${vercelFiles.length} project files for Vercel deployment API...`);

      // 2. Prepare query params and headers
      let url = 'https://api.vercel.com/v13/deployments';
      if (this.teamId) {
        url += `?teamId=${encodeURIComponent(this.teamId)}`;
      }

      const safeProjectName = (params.projectName || 'darkano-app')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/--+/g, '-')
        .slice(0, 50);

      const payload: any = {
        name: safeProjectName,
        files: vercelFiles,
        target: params.environment === 'production' ? 'production' : undefined,
        projectSettings: {
          framework: null
        }
      };

      if (this.projectId) {
        payload.project = this.projectId;
      }

      if (Object.keys(params.envVars).length > 0) {
        payload.env = params.envVars;
      }

      addLog('info', `Connecting to Vercel API endpoint (${url})...`);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data?.error?.message || `Vercel HTTP ${res.status}: ${res.statusText}`;
        addLog('error', `Vercel API error: ${errorMsg}`);
        return {
          success: false,
          status: 'failed',
          error: errorMsg,
          rawResponse: data,
          logs
        };
      }

      const deploymentUrl = data?.url ? `https://${data.url}` : undefined;
      const providerDeploymentId = data?.id;

      addLog('system', `Vercel deployment created successfully!`);
      if (deploymentUrl) {
        addLog('info', `Deployment live URL: ${deploymentUrl}`);
      }
      addLog('info', `Vercel Deployment ID: ${providerDeploymentId || 'N/A'}`);

      return {
        success: true,
        status: 'running',
        deploymentUrl,
        providerDeploymentId,
        rawResponse: data,
        logs
      };
    } catch (err: any) {
      addLog('error', `Deployment execution exception: ${err?.message || 'Network error'}`);
      return {
        success: false,
        status: 'failed',
        error: err?.message || 'Failed to communicate with Vercel API',
        logs
      };
    }
  }

  async checkHealth(url: string): Promise<HealthCheckResult> {
    if (!url) {
      return { status: 'unknown', error: 'No deployment URL provided.' };
    }

    const startTime = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(7000),
        headers: {
          'User-Agent': 'Darkano-AI-Health-Checker/1.0'
        }
      });

      const latencyMs = Date.now() - startTime;
      const isHealthy = res.status >= 200 && res.status < 400;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        statusCode: res.status,
        latencyMs,
        error: isHealthy ? undefined : `HTTP status ${res.status} ${res.statusText}`
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        error: err?.message || 'Connection failed'
      };
    }
  }

  async cancelDeployment(providerDeploymentId: string): Promise<boolean> {
    if (!this.isConfigured() || !providerDeploymentId) return false;
    try {
      let url = `https://api.vercel.com/v12/deployments/${encodeURIComponent(providerDeploymentId)}/cancel`;
      if (this.teamId) url += `?teamId=${encodeURIComponent(this.teamId)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${this.token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
