import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  ArrowDown,
  ShieldCheck
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MessageItem } from './MessageItem';

export const MessageList: React.FC = () => {
  const {
    messages,
    isLoading,
    isGenerating,
    selectedModel,
    streamTick,
    isBackendConnected
  } = useWorkspace();

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const isNearBottomRef = useRef<boolean>(true);

  // Monitor scroll position
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNear = distanceFromBottom < 120;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(!isNear && (isGenerating || messages.length > 3));
  };

  // Auto-scroll when new messages arrive or when streaming chunks arrive
  useEffect(() => {
    if (isNearBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streamTick, isLoading]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto min-h-0"
    >
      {/* Session Context Banner */}
      <div className="py-2 px-4 bg-[#0e0307]/50 border-b border-rose-950/30 text-[11px] font-mono text-slate-400">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-slate-300 font-medium">
              {isBackendConnected ? 'Darkano AI Gateway Connected' : 'Connecting to Gateway...'}
            </span>
            <span className="text-rose-950">•</span>
            <span>Model: <strong className="text-rose-300 font-semibold">{selectedModel.name}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
            <span>Secure Provider Layer</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}

      {/* Loading State Waveform / Synthesis Pulse */}
      {isLoading && (
        <div className="py-5 px-4 sm:px-6 bg-[#0c0206]/60 border-t border-rose-950/30">
          <div className="max-w-4xl mx-auto flex items-start gap-3 sm:gap-4">
            <div className="w-8 h-8 rounded-lg bg-[#150308] border border-rose-500/50 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(225,29,72,0.3)]">
              <Sparkles className="w-4 h-4 text-rose-400 animate-spin" />
            </div>
            <div className="flex-1 space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-rose-400">Darkano Engine</span>
                <span className="text-[10px] font-mono text-slate-400 bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {selectedModel.name}
                </span>
                <span className="text-[10px] font-mono text-rose-400/80 animate-pulse">
                  Synthesizing neural response...
                </span>
              </div>
              <div className="h-1.5 w-48 rounded-full bg-rose-950/60 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-600 to-red-400 rounded-full animate-pulse w-2/3" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} className="h-4" />

      {/* Floating Scroll to Bottom button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-6 z-30 p-2.5 rounded-full bg-rose-950/90 hover:bg-rose-900 border border-rose-700/50 text-white shadow-xl hover:shadow-[0_0_15px_rgba(225,29,72,0.4)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowDown className="w-4 h-4 text-rose-400" />
          <span className="hidden sm:inline">Latest</span>
        </button>
      )}
    </div>
  );
};
