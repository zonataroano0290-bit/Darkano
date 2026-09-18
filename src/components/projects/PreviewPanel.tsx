import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  RefreshCw,
  ExternalLink,
  Terminal,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Square,
  Server
} from 'lucide-react';
import { ProjectBuildRecord } from '../../types';

interface PreviewPanelProps {
  projectId: string;
  latestBuild: ProjectBuildRecord | null;
  onRunBuild: () => Promise<void>;
  onFixBuildError: () => Promise<void>;
  isBuilding: boolean;
  isFixing: boolean;
  authToken: string;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  projectId,
  latestBuild,
  onRunBuild,
  onFixBuildError,
  isBuilding,
  isFixing,
  authToken
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'logs'>('preview');
  const [previewKey, setPreviewKey] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<'Running' | 'Stopped' | 'Unavailable'>('Unavailable');
  const [isActionLoading, setIsActionLoading] = useState(false);

  const previewUrl = `/api/projects/${projectId}/preview?token=${encodeURIComponent(authToken)}&t=${previewKey}`;

  // Check preview runtime status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/preview-status`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewStatus(data.status || 'Unavailable');
      }
    } catch {
      setPreviewStatus('Unavailable');
    }
  }, [projectId, authToken]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus, latestBuild]);

  const handleReloadPreview = async () => {
    setIsActionLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/preview-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'refresh' })
      });
      setPreviewKey(k => k + 1);
      await checkStatus();
    } catch (err) {
      console.error('Failed to refresh preview:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStopPreview = async () => {
    setIsActionLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/preview-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'stop' })
      });
      setPreviewStatus('Stopped');
      setPreviewKey(k => k + 1);
    } catch (err) {
      console.error('Failed to stop preview:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStartPreview = async () => {
    setIsActionLoading(true);
    try {
      await onRunBuild();
      setPreviewKey(k => k + 1);
      await checkStatus();
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOpenExternal = () => {
    window.open(previewUrl, '_blank');
  };

  const buildStatus = latestBuild?.status || 'none';
  const hasFailed = buildStatus === 'failed';
  const hasSucceeded = buildStatus === 'success';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#090d14]">
      {/* Action Bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#121822] border-b border-slate-800 shrink-0 gap-2 overflow-x-auto select-none">
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Start/Build Button */}
          <button
            onClick={handleStartPreview}
            disabled={isBuilding || isActionLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer min-h-[36px]"
            title="Compile project and refresh live sandbox"
          >
            {isBuilding || isActionLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isBuilding ? 'Building...' : previewStatus === 'Running' ? 'Rebuild' : 'Start Preview'}</span>
          </button>

          {/* Stop Button */}
          {previewStatus === 'Running' && (
            <button
              onClick={handleStopPreview}
              disabled={isActionLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded text-xs transition-colors cursor-pointer min-h-[36px]"
              title="Stop preview sandbox runtime"
            >
              <Square className="w-3 h-3" />
              <span>Stop</span>
            </button>
          )}

          {/* Runtime State Badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono">
            {previewStatus === 'Running' && (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden xs:inline">Running</span>
              </span>
            )}
            {previewStatus === 'Stopped' && (
              <span className="flex items-center gap-1 text-slate-500">
                <Square className="w-2.5 h-2.5" />
                <span className="hidden xs:inline">Stopped</span>
              </span>
            )}
            {previewStatus === 'Unavailable' && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                <span className="hidden xs:inline">Unavailable</span>
              </span>
            )}
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors min-h-[32px] ${
                viewMode === 'preview'
                  ? 'bg-rose-950/80 text-rose-200 border border-rose-600/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setViewMode('logs')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors min-h-[32px] ${
                viewMode === 'logs'
                  ? 'bg-rose-950/80 text-rose-200 border border-rose-600/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Logs</span>
            </button>
          </div>

          <button
            onClick={handleReloadPreview}
            disabled={isActionLoading}
            className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Reload Preview"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Build Failure Banner & Fix With AI */}
      {hasFailed && (
        <div className="p-3 bg-rose-950/40 border-b border-rose-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-rose-200">Compilation Error Detected: </span>
              <span className="text-rose-300/90 font-mono text-[11px] truncate block">
                {latestBuild?.errors || 'Syntax or build error in project source.'}
              </span>
            </div>
          </div>

          <button
            onClick={onFixBuildError}
            disabled={isFixing}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white rounded text-xs font-semibold shadow-sm shrink-0 transition-colors cursor-pointer min-h-[40px]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFixing ? 'Analyzing...' : 'Fix with AI'}</span>
          </button>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex-1 min-h-0 relative">
        {viewMode === 'preview' ? (
          previewStatus === 'Stopped' ? (
            <div className="w-full h-full flex items-center justify-center p-6 bg-[#080c14] text-center">
              <div className="max-w-sm space-y-3">
                <Square className="w-8 h-8 mx-auto text-slate-600" />
                <h4 className="text-sm font-semibold text-slate-200">Preview Stopped</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The preview runtime has been stopped and memory artifacts cleaned. Click <strong>Start Preview</strong> to rebuild and resume.
                </p>
                <button
                  onClick={handleStartPreview}
                  disabled={isBuilding || isActionLoading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Start Preview
                </button>
              </div>
            </div>
          ) : (
            <iframe
              key={previewKey}
              src={previewUrl}
              title="Project Preview"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
            />
          )
        ) : (
          <div className="w-full h-full bg-[#070a0f] p-3 overflow-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
            {latestBuild ? (
              latestBuild.output || 'No output recorded for this build.'
            ) : (
              <span className="text-slate-600">No build has been executed yet. Click "Start Preview" or "Run Build" above.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
