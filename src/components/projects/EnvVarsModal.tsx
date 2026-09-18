import React, { useState } from 'react';
import {
  Key,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ProjectEnvVarRecord } from '../../types';

interface EnvVarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  envVars: ProjectEnvVarRecord[];
  onSetEnvVar: (key: string, value: string) => Promise<void>;
  onDeleteEnvVar: (key: string) => Promise<void>;
  isLoading: boolean;
}

export const EnvVarsModal: React.FC<EnvVarsModalProps> = ({
  isOpen,
  onClose,
  envVars,
  onSetEnvVar,
  onDeleteEnvVar,
  isLoading
}) => {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanKey = newKey.trim().toUpperCase();
    if (!cleanKey) {
      setError('Key name cannot be empty');
      return;
    }

    if (!/^[A-Z_][A-Z0-9_]*$/.test(cleanKey)) {
      setError('Key must contain only uppercase letters, numbers, and underscores (e.g. API_KEY, DATABASE_URL)');
      return;
    }

    try {
      await onSetEnvVar(cleanKey, newValue);
      setNewKey('');
      setNewValue('');
    } catch (err: any) {
      setError(err?.message || 'Failed to set environment variable');
    }
  };

  const handleDelete = async (key: string) => {
    if (window.confirm(`Delete environment variable "${key}"?`)) {
      await onDeleteEnvVar(key);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[#111622] border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#161d2b]">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">Project Environment Variables</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Warning Notice */}
        <div className="px-4 py-2.5 bg-blue-950/20 border-b border-blue-900/30 flex items-start gap-2.5 text-xs text-blue-300 font-mono">
          <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p>
            Variables are securely encrypted in the SQLite database and only injected into isolated sandbox builds. Values are masked for security.
          </p>
        </div>

        {/* Add Env Form */}
        <form onSubmit={handleAdd} className="p-4 border-b border-slate-800 bg-slate-900/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Variable Key
              </label>
              <input
                type="text"
                placeholder="VITE_API_ENDPOINT"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                className="w-full bg-black/60 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Value
              </label>
              <div className="relative">
                <input
                  type={showValue ? 'text' : 'password'}
                  placeholder="Secret value..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full bg-black/60 border border-slate-700 rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-400 font-mono flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!newKey.trim() || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Set Variable</span>
            </button>
          </div>
        </form>

        {/* Existing List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {envVars.length === 0 ? (
            <div className="text-center py-6 text-slate-500 font-mono text-xs">
              No environment variables defined for this project.
            </div>
          ) : (
            envVars.map((v) => (
              <div
                key={v.key}
                className="p-2.5 rounded-lg bg-[#0e131d] border border-slate-800 flex items-center justify-between font-mono text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-rose-300 font-semibold">{v.key}</span>
                  <span className="text-slate-500">=</span>
                  <span className="text-slate-400">••••••••••••••••</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                    Active
                  </span>
                  <button
                    onClick={() => handleDelete(v.key)}
                    disabled={isLoading}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete variable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-[#161d2b] flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
