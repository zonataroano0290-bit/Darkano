import {
  DeploymentEnvironment,
  DeploymentProviderName,
  DeploymentRecord,
  DeploymentHealthStatus,
  ProjectFileRecord
} from '../../types.js';

export interface DeploymentParams {
  deploymentId: string;
  projectId: string;
  userId: string;
  projectName: string;
  environment: DeploymentEnvironment;
  files: ProjectFileRecord[];
  envVars: Record<string, string>;
  buildArtifactPath?: string;
  buildCommand?: string;
}

export interface DeploymentResult {
  success: boolean;
  status: 'running' | 'failed' | 'queued' | 'deploying';
  deploymentUrl?: string;
  providerDeploymentId?: string;
  logs: Array<{ level: 'info' | 'warn' | 'error' | 'system'; message: string; timestamp: string }>;
  error?: string;
  rawResponse?: any;
}

export interface HealthCheckResult {
  status: DeploymentHealthStatus;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

export interface DeploymentProvider {
  readonly name: DeploymentProviderName;
  readonly displayName: string;

  isConfigured(): boolean;
  getDetails(): {
    configured: boolean;
    provider: DeploymentProviderName;
    name: string;
    reason?: string;
    targetProject?: string;
    supportedEnvironments: DeploymentEnvironment[];
    supportedFeatures: {
      customDomains: boolean;
      healthChecks: boolean;
      rollback: boolean;
      cancel: boolean;
    };
  };

  deploy(params: DeploymentParams): Promise<DeploymentResult>;
  checkHealth?(url: string): Promise<HealthCheckResult>;
  cancelDeployment?(providerDeploymentId: string): Promise<boolean>;
  getDeploymentStatus?(providerDeploymentId: string): Promise<{ status: string; url?: string }>;
}
