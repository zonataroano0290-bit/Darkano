import React, { useState, useEffect, useCallback } from 'react';
import { X, Key, Plus, Trash2, Shield, Lock, Check, AlertCircle } from 'lucide-react';
import { DeploymentEnvironment, DeploymentEnvVarRecord } from '../../types';

interface ScopedEnvVarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
}

export const ScopedEnvVarsModal: React.FC<ScopedEnvVarsModalProps> = ({
  isOpen,
  onClose,
  projectId,
  apiFetch
}) => {
  const [activeEnv, setActiveEnv] = useState<DeploymentEnvironment>('production');
  const [vars, setVars] = useState<DeploymentEnvVarRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadVars = useCallback(async (env: DeploymentEnvironment) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/projects/${projectId}/scoped-env?env=${env}`);
      setVars(data.envVars || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load environment variables');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, projectId]);

  useEffect(() => {
    if (isOpen) {
      loadVars(activeEnv);
    }
  }, [isOpen, activeEnv, loadVars]);

  if (!isOpen) return null;

  const handleAddVar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiFetch(`/api/projects/${projectId}/scoped-env`, {
        method: 'POST',
        body: JSON.stringify({
          environment: activeEnv,
          key: newKey.trim(),
          value: newValue
        })
      });

      setNewKey('');
      setNewValue('');
      setSuccessMessage(`Saved "${newKey.trim()}" for ${activeEnv}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      loadVars(activeEnv);
    } catch (err: any) {
      setError(err?.message || 'Failed to set variable');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVar = async (key: string) => {
    setError(null);
    try {
      await apiFetch(`/api/projects/${projectId}/scoped-env/${encodeURIComponent(key)}?env=${activeEnv}`, {
        method: 'DELETE'
      });
      loadVars(activeEnv);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete variable');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-[#0e1420] border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#121824] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Environment Configuration
              </h3>
              <p className="text-xs text-slate-400">
                Securely encrypted environment secrets scoped per runtime
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Environment Tabs */}
        <div className="flex border-b border-slate-800 bg-[#0a0f18] px-4 pt-2 gap-2 shrink-0">
          {(['production', 'preview', 'development'] as DeploymentEnvironment[]).map(env => (
            <button
              key={env}
              onClick={() => setActiveEnv(env)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t border-t border-x transition-colors capitalize ${
                activeEnv === env
                  ? 'bg-[#0e1420] text-rose-300 border-slate-800 border-b-transparent'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              {env}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Security Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-300">Vault AES-256 Encryption Active</p>
              <p className="text-[11px] mt-0.5 leading-relaxed">
                Values are encrypted at rest and injected into runtime deployments. Secret values are never exposed in browser APIs or client responses.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Add New Variable Form */}
          <form onSubmit={handleAddVar} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-200">
              Add Variable for <span className="capitalize text-rose-300">{activeEnv}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="VARIABLE_NAME"
                value={newKey}
                onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                className="w-full px-3 py-1.5 bg-[#080c14] border border-slate-700 rounded text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
              />
              <input
                type="password"
                placeholder="Secret Value"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#080c14] border border-slate-700 rounded text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !newKey.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Encrypting & Saving...' : 'Save Variable'}</span>
            </button>
          </form>

          {/* Configured Variables List */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">
              Active {activeEnv} Variables ({vars.length})
            </div>

            {isLoading ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading variables...</div>
            ) : vars.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 bg-slate-900/40 rounded-lg border border-slate-800/60">
                No environment variables configured for {activeEnv}.
              </div>
            ) : (
              vars.map(v => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-2.5 rounded bg-[#090d14] border border-slate-800 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="text-slate-200 font-semibold truncate">{v.key}</span>
                    <span className="text-slate-600">········</span>
                  </div>
                  <button
                    onClick={() => handleDeleteVar(v.key)}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                    title="Delete variable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 bg-[#121824] border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
