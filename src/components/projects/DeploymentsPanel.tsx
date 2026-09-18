import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  RefreshCw,
  ExternalLink,
  Activity,
  Terminal,
  RotateCcw,
  Square,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Server,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Filter
} from 'lucide-react';
import {
  DeploymentRecord,
  DeploymentLogRecord,
  DeploymentProviderStatus,
  DeploymentEnvironment
} from '../../types';
import { DeploymentLogsModal } from './DeploymentLogsModal';
import { DeploymentConfirmModal } from './DeploymentConfirmModal';

interface DeploymentsPanelProps {
  projectId: string;
  projectName: string;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  creditBalance: number;
}

export const DeploymentsPanel: React.FC<DeploymentsPanelProps> = ({
  projectId,
  projectName,
  apiFetch,
  creditBalance
}) => {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [providerStatus, setProviderStatus] = useState<DeploymentProviderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [filterEnv, setFilterEnv] = useState<'all' | DeploymentEnvironment>('all');

  // Logs Modal State
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentRecord | null>(null);
  const [logs, setLogs] = useState<DeploymentLogRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Deploy Confirm Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // AI Readiness State
  const [readiness, setReadiness] = useState<any | null>(null);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);

  // AI Diagnosis State
  const [aiDiagnosis, setAiDiagnosis] = useState<{
    deploymentId: string;
    rootCause: string;
    suggestedFix: string;
    actionableSteps: string[];
  } | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // Action Loading states
  const [healthCheckingId, setHealthCheckingId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Load Provider Status
  const loadProviderStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/api/deployments/providers');
      setProviderStatus(data.active || null);
    } catch (err) {
      console.error('Failed to load provider status:', err);
    }
  }, [apiFetch]);

  // Load Deployments List
  const loadDeployments = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch(`/api/projects/${projectId}/deployments`);
      setDeployments(data.deployments || []);
    } catch (err) {
      console.error('Failed to load deployments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, projectId]);

  // Initial Load
  useEffect(() => {
    loadProviderStatus();
    loadDeployments();
  }, [loadProviderStatus, loadDeployments]);

  // Periodic polling for active builds/deployments
  useEffect(() => {
    const hasActive = deployments.some(d => ['queued', 'building', 'deploying'].includes(d.status));
    if (!hasActive) return;

    const interval = setInterval(() => {
      loadDeployments();
    }, 3000);

    return () => clearInterval(interval);
  }, [deployments, loadDeployments]);

  // Open Logs
  const handleOpenLogs = async (dep: DeploymentRecord) => {
    setSelectedDeployment(dep);
    setIsLogsModalOpen(true);
    setIsLoadingLogs(true);
    try {
      const data = await apiFetch(`/api/projects/${projectId}/deployments/${dep.id}/logs`);
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Refresh active logs
  const handleRefreshActiveLogs = async () => {
    if (!selectedDeployment) return;
    setIsLoadingLogs(true);
    try {
      const data = await apiFetch(`/api/projects/${projectId}/deployments/${selectedDeployment.id}/logs`);
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to refresh logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Trigger Deployment
  const handleConfirmDeploy = async (environment: DeploymentEnvironment) => {
    setIsDeploying(true);
    try {
      await apiFetch(`/api/projects/${projectId}/deployments`, {
        method: 'POST',
        body: JSON.stringify({ environment })
      });
      setIsConfirmModalOpen(false);
      loadDeployments();
    } catch (err: any) {
      alert(`Deployment failed to start: ${err?.message || 'Server error'}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Health Check
  const handleRunHealthCheck = async (dep: DeploymentRecord) => {
    setHealthCheckingId(dep.id);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/deployments/${dep.id}/health`, {
        method: 'POST'
      });
      // Update local state with latest health check
      setDeployments(prev =>
        prev.map(d => (d.id === dep.id ? { ...d, healthStatus: res.healthStatus } : d))
      );
    } catch (err: any) {
      alert(`Health check failed: ${err?.message || 'Error'}`);
    } finally {
      setHealthCheckingId(null);
    }
  };

  // Stop Deployment
  const handleStopDeployment = async (dep: DeploymentRecord) => {
    try {
      await apiFetch(`/api/projects/${projectId}/deployments/${dep.id}/stop`, {
        method: 'POST'
      });
      loadDeployments();
    } catch (err: any) {
      alert(`Failed to stop deployment: ${err?.message || 'Error'}`);
    }
  };

  // Cancel Deployment
  const handleCancelDeployment = async (dep: DeploymentRecord) => {
    try {
      await apiFetch(`/api/projects/${projectId}/deployments/${dep.id}/cancel`, {
        method: 'POST'
      });
      loadDeployments();
    } catch (err: any) {
      alert(`Failed to cancel deployment: ${err?.message || 'Error'}`);
    }
  };

  // Rollback to Deployment
  const handleRollback = async (dep: DeploymentRecord) => {
    if (!confirm(`Are you sure you want to rollback to deployment ${dep.id}? This will restore project files to that snapshot and trigger a new deployment.`)) {
      return;
    }

    setRollingBackId(dep.id);
    try {
      await apiFetch(`/api/projects/${projectId}/deployments/${dep.id}/rollback`, {
        method: 'POST'
      });
      loadDeployments();
    } catch (err: any) {
      alert(`Rollback failed: ${err?.message || 'Error'}`);
    } finally {
      setRollingBackId(null);
    }
  };

  // Run AI Readiness Check
  const handleCheckReadiness = async () => {
    setIsLoadingReadiness(true);
    try {
      const data = await apiFetch(`/api/projects/${projectId}/ai/deployment-readiness`);
      setReadiness(data);
    } catch (err: any) {
      alert(`Readiness check failed: ${err?.message || 'Error'}`);
    } finally {
      setIsLoadingReadiness(false);
    }
  };

  // Run AI Error Diagnosis
  const handleDiagnoseError = async (dep: DeploymentRecord) => {
    setIsDiagnosing(true);
    try {
      const logsData = await apiFetch(`/api/projects/${projectId}/deployments/${dep.id}/logs`).catch(() => ({ logs: [] }));
      const recentLogs = (logsData.logs || []).map((l: any) => l.message).join('\n');

      const data = await apiFetch(`/api/projects/${projectId}/ai/deployment-error`, {
        method: 'POST',
        body: JSON.stringify({
          deploymentId: dep.id,
          errorMessage: dep.errorMessage,
          errorLogs: recentLogs
        })
      });

      setAiDiagnosis({
        deploymentId: dep.id,
        rootCause: data.rootCause,
        suggestedFix: data.suggestedFix,
        actionableSteps: data.actionableSteps || []
      });
    } catch (err: any) {
      alert(`AI diagnosis failed: ${err?.message || 'Error'}`);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const filteredDeployments = deployments.filter(d => {
    if (filterEnv === 'all') return true;
    return d.environment === filterEnv;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>RUNNING</span>
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40">
            <XCircle className="w-3 h-3" />
            <span>FAILED</span>
          </span>
        );
      case 'building':
      case 'deploying':
      case 'queued':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span className="uppercase">{status}</span>
          </span>
        );
      case 'stopped':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
            <Square className="w-2.5 h-2.5" />
            <span>STOPPED</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
            <span>CANCELLED</span>
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 uppercase">
            {status}
          </span>
        );
    }
  };

  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'healthy':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40" title="HTTP 2xx/3xx confirmed">
            <CheckCircle2 className="w-3 h-3" />
            <span>HEALTHY</span>
          </span>
        );
      case 'unhealthy':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-800/40" title="Non-200 or timeout error">
            <XCircle className="w-3 h-3" />
            <span>UNHEALTHY</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800" title="Health unknown or unprobed">
            <HelpCircle className="w-3 h-3" />
            <span>UNKNOWN</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#080c14] overflow-y-auto">
      {/* Top Banner & Control Bar */}
      <div className="p-4 bg-[#0e1420] border-b border-slate-800 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-rose-400" />
              <span>Cloud Deployments & Infrastructure</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real server-side builds, production hosting, health verification, and rollbacks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckReadiness}
              disabled={isLoadingReadiness}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
              title="Inspect project for deployment readiness"
            >
              <Sparkles className={`w-3.5 h-3.5 text-rose-400 ${isLoadingReadiness ? 'animate-spin' : ''}`} />
              <span>{isLoadingReadiness ? 'Checking...' : 'Readiness'}</span>
            </button>

            <button
              onClick={() => setIsConfirmModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Deploy to Cloud</span>
            </button>
          </div>
        </div>

        {/* Provider Status Card */}
        <div className="flex flex-wrap items-center justify-between p-2.5 rounded-lg bg-[#0a0f18] border border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400">Hosting Provider:</span>
            <span className="font-semibold text-slate-200">
              {providerStatus?.name || 'No Provider Configured'}
            </span>
            {providerStatus?.configured ? (
              <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-mono">
                CONFIGURED
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40 text-[10px] font-mono">
                NOT CONFIGURED
              </span>
            )}
          </div>

          <button
            onClick={() => {
              loadProviderStatus();
              loadDeployments();
            }}
            disabled={isLoading}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Unconfigured Provider Notice */}
        {providerStatus && !providerStatus.configured && (
          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300/90 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-amber-200">Deployment provider is not configured.</span>
              <p className="mt-0.5 text-[11px] text-amber-300/80">
                To deploy to real cloud infrastructure, set <code className="px-1 py-0.5 bg-black/40 rounded text-rose-300">VERCEL_TOKEN</code>, <code className="px-1 py-0.5 bg-black/40 rounded text-rose-300">NETLIFY_TOKEN</code>, or <code className="px-1 py-0.5 bg-black/40 rounded text-rose-300">CLOUDFLARE_API_TOKEN</code> in your server environment variables.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AI Readiness Card (if checked) */}
      {readiness && (
        <div className="m-4 p-4 rounded-xl bg-[#0e1420] border border-slate-800 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <h4 className="text-xs font-semibold text-slate-200">AI Deployment Readiness Assessment</h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Score:</span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                readiness.score >= 70 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40' : 'bg-rose-950 text-rose-300 border border-rose-800/40'
              }`}>
                {readiness.score}/100
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{readiness.summary}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {readiness.checklist?.map((item: any, idx: number) => (
              <div key={idx} className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-slate-300">{item.item}</span>
                  {item.status === 'passed' ? (
                    <span className="text-emerald-400 text-[10px] uppercase font-mono">PASSED</span>
                  ) : (
                    <span className="text-rose-400 text-[10px] uppercase font-mono">FAILED</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>

          {readiness.recommendations?.length > 0 && (
            <div className="text-[11px] text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300">Recommendations:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {readiness.recommendations.map((rec: string, i: number) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* AI Error Diagnosis Card (if opened) */}
      {aiDiagnosis && (
        <div className="m-4 p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>AI Deployment Error Diagnosis ({aiDiagnosis.deploymentId})</span>
            </div>
            <button
              onClick={() => setAiDiagnosis(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Dismiss
            </button>
          </div>

          <div className="p-2.5 rounded bg-[#090d14] border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div>
              <span className="font-semibold text-rose-400">Root Cause: </span>
              <span>{aiDiagnosis.rootCause}</span>
            </div>
            <div>
              <span className="font-semibold text-emerald-400">Suggested Fix: </span>
              <span>{aiDiagnosis.suggestedFix}</span>
            </div>
          </div>

          {aiDiagnosis.actionableSteps?.length > 0 && (
            <div className="text-xs text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300">Actionable Steps:</span>
              <ol className="list-decimal list-inside space-y-0.5">
                {aiDiagnosis.actionableSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Deployment History Table / Cards */}
      <div className="flex-1 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Deployment History</span>
            <span className="text-[11px] font-mono text-slate-500">
              ({deployments.length})
            </span>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
            <Filter className="w-3 h-3 text-slate-500 ml-1.5" />
            {(['all', 'production', 'preview'] as const).map(env => (
              <button
                key={env}
                onClick={() => setFilterEnv(env)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition-colors ${
                  filterEnv === env
                    ? 'bg-rose-950 text-rose-200 border border-rose-700/60 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>

        {deployments.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-[#0e1420] border border-slate-800 rounded-xl space-y-3">
            <Rocket className="w-10 h-10 mx-auto text-slate-600 stroke-[1.5]" />
            <div>
              <p className="text-sm font-medium text-slate-300">No deployments yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Ready to publish? Click <strong>Deploy to Cloud</strong> above to compile your project and deploy it to a live cloud host.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDeployments.map(dep => (
              <div
                key={dep.id}
                className="p-4 rounded-xl bg-[#0e1420] border border-slate-800 hover:border-slate-700/80 transition-all space-y-3"
              >
                {/* Deployment Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(dep.status)}
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      {dep.environment.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {dep.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {getHealthBadge(dep.healthStatus)}
                    <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(dep.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Deployment Details & URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Live URL: </span>
                    {dep.deploymentUrl ? (
                      <a
                        href={dep.deploymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-rose-400 hover:underline font-mono inline-flex items-center gap-1"
                      >
                        <span>{dep.deploymentUrl}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500 italic font-mono">Unavailable</span>
                    )}
                  </div>

                  <div className="sm:text-right font-mono text-[11px] text-slate-400">
                    Provider: <span className="text-slate-300">{dep.provider}</span> · Duration: <span className="text-slate-300">{dep.durationMs}ms</span>
                  </div>
                </div>

                {/* Error Banner if Failed */}
                {dep.status === 'failed' && dep.errorMessage && (
                  <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 space-y-1">
                    <p className="font-mono break-all">{dep.errorMessage}</p>
                    <button
                      onClick={() => handleDiagnoseError(dep)}
                      disabled={isDiagnosing}
                      className="text-[11px] text-rose-400 hover:underline flex items-center gap-1 mt-1 font-semibold"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Diagnose with AI</span>
                    </button>
                  </div>
                )}

                {/* Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenLogs(dep)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                      title="View real execution logs"
                    >
                      <Terminal className="w-3.5 h-3.5 text-slate-400" />
                      <span>View Logs</span>
                    </button>

                    {dep.deploymentUrl && (
                      <button
                        onClick={() => handleRunHealthCheck(dep)}
                        disabled={healthCheckingId === dep.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                        title="Ping deployment endpoint"
                      >
                        <Activity className={`w-3.5 h-3.5 text-emerald-400 ${healthCheckingId === dep.id ? 'animate-spin' : ''}`} />
                        <span>Health Check</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {['queued', 'building', 'deploying'].includes(dep.status) && (
                      <button
                        onClick={() => handleCancelDeployment(dep)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800/40 text-rose-300 transition-colors"
                      >
                        <Square className="w-3 h-3" />
                        <span>Cancel</span>
                      </button>
                    )}

                    {dep.status === 'running' && (
                      <button
                        onClick={() => handleStopDeployment(dep)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Square className="w-3 h-3" />
                        <span>Stop</span>
                      </button>
                    )}

                    {dep.snapshotId && (
                      <button
                        onClick={() => handleRollback(dep)}
                        disabled={rollingBackId === dep.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                        title="Rollback project to this deployment snapshot"
                      >
                        <RotateCcw className={`w-3 h-3 text-rose-400 ${rollingBackId === dep.id ? 'animate-spin' : ''}`} />
                        <span>Rollback</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real Deployment Logs Modal */}
      <DeploymentLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
        deployment={selectedDeployment}
        logs={logs}
        onRefreshLogs={handleRefreshActiveLogs}
        isLoading={isLoadingLogs}
      />

      {/* Deployment Confirmation Modal */}
      <DeploymentConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmDeploy}
        projectName={projectName}
        providerStatus={providerStatus}
        isDeploying={isDeploying}
        creditBalance={creditBalance}
      />
    </div>
  );
};
