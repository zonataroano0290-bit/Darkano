import React, { useState } from 'react';
import {
  History,
  RotateCcw,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { ProjectSnapshotRecord } from '../../types';

interface SnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: ProjectSnapshotRecord[];
  onCreateSnapshot: (description: string) => Promise<void>;
  onRollbackSnapshot: (snapshotId: string) => Promise<void>;
  isLoading: boolean;
}

export const SnapshotsModal: React.FC<SnapshotsModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  onCreateSnapshot,
  onRollbackSnapshot,
  isLoading
}) => {
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || isCreating) return;

    setIsCreating(true);
    try {
      await onCreateSnapshot(description.trim());
      setDescription('');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRollback = async (snapshot: ProjectSnapshotRecord) => {
    const confirmed = window.confirm(
      `Are you sure you want to rollback to snapshot: "${snapshot.description}" created on ${new Date(snapshot.createdAt).toLocaleString()}?\n\nThis will replace the current file contents with this snapshot. A backup snapshot will be saved automatically.`
    );
    if (confirmed) {
      await onRollbackSnapshot(snapshot.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[#111622] border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#161d2b]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-semibold text-slate-100">Project Snapshots & Rollback</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create Snapshot Form */}
        <form onSubmit={handleCreate} className="p-4 border-b border-slate-800/80 bg-slate-900/30">
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">
            Create Point-in-Time Snapshot
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g., Working authentication flow before navbar redesign"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
            />
            <button
              type="submit"
              disabled={!description.trim() || isCreating || isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isCreating ? 'Saving...' : 'Save Snapshot'}</span>
            </button>
          </div>
        </form>

        {/* Snapshots List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {snapshots.length === 0 ? (
            <div className="text-center py-8 text-slate-500 font-mono text-xs">
              No snapshots recorded yet.
            </div>
          ) : (
            snapshots.map((snap) => {
              let fileCount = 0;
              try {
                fileCount = JSON.parse(snap.filesJson).length;
              } catch {
                fileCount = 0;
              }

              return (
                <div
                  key={snap.id}
                  className="p-3 rounded-lg bg-[#0e131d] border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-200 truncate font-mono">
                        {snap.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-mono">
                      <span>{new Date(snap.createdAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>{fileCount} files</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRollback(snap)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-xs font-semibold shrink-0 border border-slate-700 transition-colors cursor-pointer"
                    title="Restore all project files to this snapshot"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rollback</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-[#161d2b] flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Rollback completely restores database file contents.</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
