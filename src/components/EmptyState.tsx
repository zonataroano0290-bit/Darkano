import React from 'react';
import { BrandLogo } from './BrandLogo';
import { useWorkspace } from '../context/WorkspaceContext';

export const EmptyState: React.FC = () => {
  const { sendMessage, activeMode } = useWorkspace();

  const samplePrompts = [
    { label: 'Autonomous Multi-Step Research', prompt: 'Research recent breakthroughs in photonic quantum computing, verify source claims, and synthesize a structured analysis.' },
    { label: 'Write a high-performance LRU cache', prompt: 'Write a production-ready, high-performance thread-safe LRU cache in TypeScript with O(1) ops.' },
    { label: 'Analyze distributed consensus', prompt: 'Explain the core architectural trade-offs between Raft, Paxos, and Zab in distributed systems.' }
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto w-full select-none">
      {/* Darkano AI Logo */}
      <div className="mb-4">
        <BrandLogo size="lg" className="justify-center" />
      </div>

      {/* Short, elegant welcome headline */}
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white tracking-tight mb-2">
        How can I help you today?
      </h1>

      <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
        Frontier reasoning, systems architecture, and polyglot code synthesis.
      </p>

      {/* Minimal, subtle prompt pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
        {samplePrompts.map((item, index) => (
          <button
            key={index}
            onClick={() => sendMessage(item.prompt)}
            className="px-3 py-1.5 rounded-full text-xs text-slate-300 hover:text-white bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 hover:border-rose-700/50 transition-all cursor-pointer shadow-sm"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
