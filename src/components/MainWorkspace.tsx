import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { EmptyState } from './EmptyState';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { FilesView } from './FilesView';

export const MainWorkspace: React.FC = () => {
  const { currentView, messages } = useWorkspace();

  if (currentView === 'files') {
    return (
      <main className="flex-1 flex flex-col min-h-0 bg-[#060204] relative overflow-hidden darkano-ambient-bg">
        <FilesView />
      </main>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-[#060204] relative overflow-hidden darkano-ambient-bg">
      {/* Subtle atmospheric dark-red radial illumination behind center */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[480px] bg-rose-950/20 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-rose-950/10 rounded-full blur-[120px] pointer-events-none" />

      {isEmpty ? (
        /* Minimal Centered Welcome Screen */
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-6">
            <EmptyState />
            <Composer isCentered />
          </div>
        </div>
      ) : (
        /* Active Chat Mode: Scrollable messages + bottom composer */
        <>
          <div className="flex-1 flex flex-col min-h-0 relative z-10 overflow-y-auto">
            <MessageList />
          </div>
          <div className="p-3 sm:p-4 bg-[#080205]/80 backdrop-blur-xl border-t border-rose-950/30 shrink-0 z-10">
            <Composer />
          </div>
        </>
      )}
    </main>
  );
};
