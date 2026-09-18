import { DeploymentProvider } from './types.js';
import { NoneDeploymentProvider } from './noneProvider.js';
import { VercelDeploymentProvider } from './vercelProvider.js';
import { NetlifyDeploymentProvider } from './netlifyProvider.js';
import { CloudflarePagesDeploymentProvider } from './cloudflarePagesProvider.js';
import { DeploymentProviderStatus } from '../../types.js';

export class DeploymentProviderRegistry {
  private static noneProvider = new NoneDeploymentProvider();
  private static vercelProvider = new VercelDeploymentProvider();
  private static netlifyProvider = new NetlifyDeploymentProvider();
  private static cloudflareProvider = new CloudflarePagesDeploymentProvider();

  /**
   * Get active deployment provider according to configured environment variables
   */
  static getActiveProvider(preferred?: string): DeploymentProvider {
    const explicitlyConfigured = (preferred || process.env.DEPLOYMENT_PROVIDER || '').toLowerCase().trim();

    if (explicitlyConfigured === 'vercel') {
      return this.vercelProvider.isConfigured() ? this.vercelProvider : this.noneProvider;
    }
    if (explicitlyConfigured === 'netlify') {
      return this.netlifyProvider.isConfigured() ? this.netlifyProvider : this.noneProvider;
    }
    if (explicitlyConfigured === 'cloudflare') {
      return this.cloudflareProvider.isConfigured() ? this.cloudflareProvider : this.noneProvider;
    }

    // Auto-detect configured providers
    if (this.vercelProvider.isConfigured()) {
      return this.vercelProvider;
    }
    if (this.netlifyProvider.isConfigured()) {
      return this.netlifyProvider;
    }
    if (this.cloudflareProvider.isConfigured()) {
      return this.cloudflareProvider;
    }

    // Default to unconfigured provider
    return this.noneProvider;
  }

  /**
   * Get provider by exact name
   */
  static getProviderByName(name: string): DeploymentProvider {
    switch (name.toLowerCase()) {
      case 'vercel':
        return this.vercelProvider;
      case 'netlify':
        return this.netlifyProvider;
      case 'cloudflare':
        return this.cloudflareProvider;
      default:
        return this.noneProvider;
    }
  }

  /**
   * Get overall provider status for UI / Diagnostics
   */
  static getProviderStatuses(): {
    active: DeploymentProviderStatus;
    available: DeploymentProviderStatus[];
  } {
    const active = this.getActiveProvider();
    const allProviders = [
      this.vercelProvider,
      this.netlifyProvider,
      this.cloudflareProvider,
      this.noneProvider
    ];

    const available = allProviders.map(p => {
      const details = p.getDetails();
      return {
        provider: details.provider,
        configured: details.configured,
        name: details.name,
        reason: details.reason,
        supportedEnvironments: details.supportedEnvironments,
        supportedFeatures: details.supportedFeatures
      };
    });

    const activeDetails = active.getDetails();

    return {
      active: {
        provider: activeDetails.provider,
        configured: activeDetails.configured,
        name: activeDetails.name,
        reason: activeDetails.reason,
        supportedEnvironments: activeDetails.supportedEnvironments,
        supportedFeatures: activeDetails.supportedFeatures
      },
      available
    };
  }
}
