import React from 'react';
import { AlertTriangle, RefreshCw, Check, X, FileDiff, ArrowRight } from 'lucide-react';
import { ProjectFileRecord } from '../../types';

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  localContent: string;
  serverFile: ProjectFileRecord | null;
  onForceOverwrite: () => void;
  onAcceptServerVersion: () => void;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  onClose,
  filePath,
  localContent,
  serverFile,
  onForceOverwrite,
  onAcceptServerVersion
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Version Conflict Detected</h2>
              <p className="text-xs text-amber-300/80 mt-0.5 font-mono">
                {filePath}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 text-neutral-300 leading-relaxed">
            Another collaborator modified and saved this file while you were editing. To prevent accidental data loss, Darkano AI halted the save. Choose how to resolve this collision:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Unsaved Version */}
            <div className="space-y-1.5 flex flex-col">
              <div className="flex items-center justify-between font-semibold text-neutral-300 px-1">
                <span>Your Unsaved Edit</span>
                <span className="text-[11px] text-amber-400 font-mono">Local Buffer</span>
              </div>
              <pre className="flex-1 p-3 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-[11px] text-neutral-300 overflow-auto max-h-64 whitespace-pre-wrap select-all">
                {localContent}
              </pre>
            </div>

            {/* Server Current Version */}
            <div className="space-y-1.5 flex flex-col">
              <div className="flex items-center justify-between font-semibold text-neutral-300 px-1">
                <span>Server Current Version</span>
                <span className="text-[11px] text-sky-400 font-mono">
                  v{serverFile?.version || 1}
                </span>
              </div>
              <pre className="flex-1 p-3 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-[11px] text-neutral-300 overflow-auto max-h-64 whitespace-pre-wrap select-all">
                {serverFile?.content || '(Empty)'}
              </pre>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
          >
            Cancel & Keep Editing
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onAcceptServerVersion}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Discard Mine & Load Server Version
            </button>

            <button
              onClick={onForceOverwrite}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Overwrite with My Changes (Force)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
