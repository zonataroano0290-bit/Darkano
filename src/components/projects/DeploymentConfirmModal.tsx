import React, { useState } from 'react';
import { X, Rocket, AlertTriangle, ShieldCheck, Zap, Info, Server } from 'lucide-react';
import { DeploymentEnvironment, DeploymentProviderStatus } from '../../types';

interface DeploymentConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (environment: DeploymentEnvironment) => Promise<void>;
  projectName: string;
  providerStatus: DeploymentProviderStatus | null;
  isDeploying: boolean;
  creditBalance: number;
}

export const DeploymentConfirmModal: React.FC<DeploymentConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  providerStatus,
  isDeploying,
  creditBalance
}) => {
  const [environment, setEnvironment] = useState<DeploymentEnvironment>('production');

  if (!isOpen) return null;

  const creditCost = environment === 'production' ? 15 : 5;
  const hasSufficientCredits = creditBalance >= creditCost;
  const isProviderConfigured = providerStatus?.configured === true;

  const handleDeploy = async () => {
    if (!isProviderConfigured || !hasSufficientCredits || isDeploying) return;
    await onConfirm(environment);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#0e1420] border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#121824] border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/50">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Deploy Project to Cloud
              </h3>
              <p className="text-xs text-slate-400">
                Deploy <span className="font-semibold text-slate-200">{projectName}</span> to production or preview
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeploying}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-slate-300">
          {/* Environment Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Select Target Environment
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEnvironment('production')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  environment === 'production'
                    ? 'bg-rose-950/40 border-rose-600/80 text-white ring-1 ring-rose-500/30'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-semibold mb-1">
                  <span className="text-rose-300">Production</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-200">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Primary public branch with full custom domain routing and health checks.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setEnvironment('preview')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  environment === 'preview'
                    ? 'bg-rose-950/40 border-rose-600/80 text-white ring-1 ring-rose-500/30'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-semibold mb-1">
                  <span className="text-slate-200">Preview</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    Staging
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Ephemeral branch preview for staging reviews before production release.
                </p>
              </button>
            </div>
          </div>

          {/* Provider Verification Card */}
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span>Cloud Provider:</span>
              </span>
              <span className="font-semibold text-slate-200">
                {providerStatus?.name || 'Detecting...'}
              </span>
            </div>

            {!isProviderConfigured && (
              <div className="p-2 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300 flex items-start gap-2 text-[11px] leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold">Deployment provider is not configured.</p>
                  <p className="text-amber-300/80 mt-0.5">
                    Configure VERCEL_TOKEN, NETLIFY_TOKEN, or CLOUDFLARE_API_TOKEN in server environment variables to enable real deployment.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Verification Pipeline Steps */}
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60 space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real Server-Side Deployment Pipeline</span>
            </div>
            <p>1. Sandbox compilation & bundle check (no mock builds)</p>
            <p>2. Environment variables injection for {environment}</p>
            <p>3. Direct hosting API dispatch and real-time log ingestion</p>
            <p>4. Automated HTTP health probe on the live provider URL</p>
          </div>

          {/* Billing / Credit Check */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">Deployment Cost:</span>
              <span className="text-amber-300 font-bold">{creditCost} credits</span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Balance: <span className={hasSufficientCredits ? 'text-emerald-400' : 'text-rose-400'}>{creditBalance}</span>
            </div>
          </div>

          {!hasSufficientCredits && (
            <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px]">
              Insufficient credits. You need at least {creditCost} credits to deploy to {environment}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 bg-[#121824] border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeploying}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDeploy}
            disabled={!isProviderConfigured || !hasSufficientCredits || isDeploying}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white shadow-sm transition-all cursor-pointer"
          >
            {isDeploying ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Deploying...</span>
              </>
            ) : (
              <>
                <Rocket className="w-3.5 h-3.5" />
                <span>Confirm & Deploy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
