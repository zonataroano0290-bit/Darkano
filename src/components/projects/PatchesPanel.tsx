import React, { useState } from 'react';
import {
  Check,
  X,
  FileDiff,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { ProjectPatchRecord } from '../../types';

interface PatchesPanelProps {
  patches: ProjectPatchRecord[];
  onApplyPatch: (patchId: string) => Promise<void>;
  onRejectPatch: (patchId: string) => Promise<void>;
  isLoading: boolean;
}

export const PatchesPanel: React.FC<PatchesPanelProps> = ({
  patches,
  onApplyPatch,
  onRejectPatch,
  isLoading
}) => {
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(
    patches[0]?.id || null
  );
  const [mobileDiffView, setMobileDiffView] = useState<'proposed' | 'original' | 'both'>('proposed');

  const selectedPatch = patches.find(p => p.id === selectedPatchId) || patches[0];

  if (patches.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 font-mono text-xs">
        <FileDiff className="w-8 h-8 mb-2 text-slate-600" />
        <p className="text-slate-400 font-medium">No Pending Patches</p>
        <p className="text-slate-600 mt-1">Use AI Coding or Error Fix to propose structured code changes for review.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c1017] w-full max-w-full">
      {/* Header / Selector */}
      <div className="p-2.5 border-b border-slate-800 bg-[#121822] flex items-center justify-between gap-2 overflow-x-auto shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <FileDiff className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-200">
            Proposals ({patches.length})
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
          {patches.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPatchId(p.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors shrink-0 ${
                selectedPatch?.id === p.id
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-600/40 font-semibold'
                  : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.path.split('/').pop()}
            </button>
          ))}
        </div>
      </div>

      {selectedPatch && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Patch Details & Actions Bar */}
          <div className="p-3 bg-slate-900/50 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">File:</span>
                <span className="text-rose-300 font-semibold truncate">{selectedPatch.path}</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-medium truncate">
                {selectedPatch.diffSummary}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onRejectPatch(selectedPatch.id)}
                disabled={isLoading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors min-h-[38px]"
              >
                <X className="w-3.5 h-3.5 text-rose-400" />
                <span>Reject</span>
              </button>

              <button
                onClick={() => onApplyPatch(selectedPatch.id)}
                disabled={isLoading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer min-h-[38px]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Patch</span>
              </button>
            </div>
          </div>

          {/* Safety Notice & Mobile View Selector */}
          <div className="px-3 py-1.5 bg-blue-950/20 border-b border-blue-900/30 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0">
            <div className="flex items-center gap-1.5 text-blue-300 truncate">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">Safety snapshot auto-created on apply</span>
            </div>

            {/* Mobile View Toggle */}
            <div className="flex md:hidden items-center gap-0.5 bg-slate-900 p-0.5 rounded border border-slate-800 shrink-0">
              <button
                onClick={() => setMobileDiffView('proposed')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  mobileDiffView === 'proposed'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Proposed
              </button>
              <button
                onClick={() => setMobileDiffView('original')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  mobileDiffView === 'original'
                    ? 'bg-rose-950 text-rose-300 border border-rose-700/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => setMobileDiffView('both')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  mobileDiffView === 'both'
                    ? 'bg-slate-800 text-slate-200 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Both
              </button>
            </div>
          </div>

          {/* Diff Content Preview */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden font-mono text-xs">
            {/* Original Content */}
            <div className={`flex flex-col min-h-0 bg-[#090d13] ${mobileDiffView === 'proposed' ? 'hidden md:flex' : 'flex'}`}>
              <div className="px-3 py-1.5 bg-[#0f141c] border-b border-slate-800 text-[11px] font-semibold text-rose-400 flex items-center justify-between shrink-0">
                <span>Current Version</span>
                <span className="text-slate-500 text-[10px]">Before AI Edit</span>
              </div>
              <div className="flex-1 overflow-auto p-3 text-slate-400 whitespace-pre">
                {selectedPatch.originalContent || '// (New file)'}
              </div>
            </div>

            {/* Proposed Content */}
            <div className={`flex flex-col min-h-0 bg-[#090d13] ${mobileDiffView === 'original' ? 'hidden md:flex' : 'flex'}`}>
              <div className="px-3 py-1.5 bg-[#0f141c] border-b border-slate-800 text-[11px] font-semibold text-emerald-400 flex items-center justify-between shrink-0">
                <span>Proposed Change</span>
                <span className="text-emerald-500/80 text-[10px]">After AI Edit</span>
              </div>
              <div className="flex-1 overflow-auto p-3 text-slate-200 whitespace-pre">
                {selectedPatch.proposedContent}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
