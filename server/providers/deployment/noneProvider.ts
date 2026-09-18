import { DeploymentParams, DeploymentProvider, DeploymentResult, HealthCheckResult } from './types.js';

export class NoneDeploymentProvider implements DeploymentProvider {
  readonly name = 'none';
  readonly displayName = 'No Provider Configured';

  isConfigured(): boolean {
    return false;
  }

  getDetails() {
    return {
      configured: false,
      provider: 'none' as const,
      name: this.displayName,
      reason: 'Deployment provider is not configured. Set VERCEL_TOKEN, NETLIFY_TOKEN, or CLOUDFLARE_API_TOKEN in server environment variables.',
      supportedEnvironments: ['production', 'preview', 'development'] as any,
      supportedFeatures: {
        customDomains: false,
        healthChecks: false,
        rollback: false,
        cancel: false
      }
    };
  }

  async deploy(params: DeploymentParams): Promise<DeploymentResult> {
    const timestamp = new Date().toISOString();
    return {
      success: false,
      status: 'failed',
      error: 'Deployment provider is not configured. Real cloud deployment requires configuring VERCEL_TOKEN, NETLIFY_TOKEN, or CLOUDFLARE_API_TOKEN in server environment variables.',
      logs: [
        {
          level: 'error',
          message: '[DEPLOYMENT_ERROR] Deployment provider is not configured on this Darkano AI server instance.',
          timestamp
        },
        {
          level: 'warn',
          message: '[CONFIG_GUIDE] To enable production publishing, add VERCEL_TOKEN, NETLIFY_TOKEN, or CLOUDFLARE_API_TOKEN in server environment variables.',
          timestamp
        }
      ]
    };
  }

  async checkHealth(url: string): Promise<HealthCheckResult> {
    return {
      status: 'unknown',
      error: 'Health checks require a configured hosting provider.'
    };
  }
}
