import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Filter, RefreshCw } from 'lucide-react';
import { DeploymentLogRecord, DeploymentRecord } from '../../types';

interface DeploymentLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deployment: DeploymentRecord | null;
  logs: DeploymentLogRecord[];
  onRefreshLogs: () => void;
  isLoading: boolean;
}

export const DeploymentLogsModal: React.FC<DeploymentLogsModalProps> = ({
  isOpen,
  onClose,
  deployment,
  logs,
  onRefreshLogs,
  isLoading
}) => {
  const [copied, setCopied] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');

  if (!isOpen || !deployment) return null;

  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'all') return true;
    return log.level === filterLevel;
  });

  const handleCopyLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-rose-400 bg-rose-950/50 border-rose-800/40';
      case 'warn':
        return 'text-amber-400 bg-amber-950/50 border-amber-800/40';
      case 'system':
        return 'text-indigo-400 bg-indigo-950/50 border-indigo-800/40';
      default:
        return 'text-slate-300 bg-slate-900/60 border-slate-800/60';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[#0e1420] border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#121824] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-800 text-rose-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  Deployment Logs
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  {deployment.id}
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40">
                  {deployment.environment}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Provider: {deployment.provider} · Status: {deployment.status}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onRefreshLogs}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0a0f18] border-b border-slate-800/80 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400 font-medium">Filter:</span>
            {['all', 'info', 'warn', 'error', 'system'].map(level => (
              <button
                key={level}
                onClick={() => setFilterLevel(level)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition-colors ${
                  filterLevel === level
                    ? 'bg-rose-950 text-rose-200 border border-rose-700/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono text-slate-500">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Console Log Stream */}
        <div className="flex-1 p-4 bg-[#070a10] overflow-y-auto font-mono text-xs space-y-1.5 select-text">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-xs">No logs recorded for this level or deployment.</p>
            </div>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className="flex items-start gap-2.5 leading-relaxed py-1 px-2 rounded hover:bg-slate-900/40 transition-colors border-b border-slate-900/40 last:border-0"
              >
                <span className="text-[10px] text-slate-600 shrink-0 select-none pt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-semibold shrink-0 select-none ${getLevelColor(
                    log.level
                  )}`}
                >
                  {log.level}
                </span>
                <span className="text-slate-300 break-all whitespace-pre-wrap flex-1">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0e1420] border-t border-slate-800 shrink-0 text-xs text-slate-500">
          <span className="font-mono">
            {deployment.deploymentUrl ? (
              <a
                href={deployment.deploymentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-rose-400 hover:underline flex items-center gap-1"
              >
                {deployment.deploymentUrl}
              </a>
            ) : (
              'No public URL assigned'
            )}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
