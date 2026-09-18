import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Paperclip,
  Sparkles,
  Code2,
  Compass,
  BarChart3,
  Cpu,
  X,
  FileText,
  Square,
  ChevronDown
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceMode } from '../types';

interface ComposerProps {
  isCentered?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ isCentered = false }) => {
  const {
    activeMode,
    setActiveMode,
    selectedModel,
    sendMessage,
    openModal,
    stagedComposerFiles,
    unstageComposerFile,
    uploadFiles,
    isGenerating,
    stopGeneration
  } = useWorkspace();

  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if ((!input.trim() && stagedComposerFiles.length === 0) || isGenerating) return;
    sendMessage(input, stagedComposerFiles);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  const modeIcons: Record<
    WorkspaceMode,
    { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
  > = {
    chat: { label: 'Chat', icon: Sparkles, color: 'text-rose-400' },
    code: { label: 'Code', icon: Code2, color: 'text-emerald-400' },
    research: { label: 'Research', icon: Compass, color: 'text-purple-400' },
    analyze: { label: 'Analyze', icon: BarChart3, color: 'text-amber-400' }
  };

  const canSubmit =
    (input.trim().length > 0 || stagedComposerFiles.some(f => f.status === 'ready')) &&
    !isGenerating &&
    !stagedComposerFiles.some(f => f.status === 'uploading');

  const getPlaceholder = () => {
    switch (activeMode) {
      case 'research':
        return 'Ask Darkano to research live sources, verify citations, and analyze web data...';
      case 'analyze':
        return 'Ask Darkano to parse and analyze staged files, extract metrics, or inspect code...';
      case 'code':
        return 'Ask Darkano to engineer algorithms, analyze repos, or generate production code...';
      default:
        return 'Ask Darkano anything...';
    }
  };

  return (
    <div className={`w-full ${isCentered ? 'max-w-3xl mx-auto' : 'max-w-4xl mx-auto'}`}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
        id="composer-file-input"
      />

      {/* Staged Attached Files Preview Bar */}
      {stagedComposerFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {stagedComposerFiles.map(file => (
            <div
              key={file.id}
              className={`flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs shadow-sm ${
                file.status === 'error'
                  ? 'bg-red-950/40 border-red-800/50 text-red-200'
                  : file.status === 'uploading'
                  ? 'bg-rose-950/20 border-rose-800/30 text-rose-300'
                  : 'bg-rose-950/40 border-rose-800/40 text-rose-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="font-mono text-[11px] truncate max-w-[140px] sm:max-w-[200px]">
                {file.name}
              </span>
              {file.status === 'uploading' ? (
                <span className="text-[10px] font-mono text-rose-400 animate-pulse font-semibold">
                  {file.progress}%
                </span>
              ) : file.status === 'error' ? (
                <span className="text-[10px] font-mono text-red-400 font-semibold" title={file.processingError}>
                  Failed
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-400">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              )}
              <button
                onClick={() => unstageComposerFile(file.id)}
                className="p-0.5 text-slate-400 hover:text-rose-300 rounded transition-colors"
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Large Rounded Dark Glass Composer Box */}
      <div className="relative rounded-2xl sm:rounded-3xl bg-[#0f0308]/85 border border-rose-900/30 focus-within:border-rose-500/50 backdrop-blur-2xl transition-all duration-200 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.8),0_0_25px_-5px_rgba(159,18,57,0.12)] focus-within:shadow-[0_12px_40px_-5px_rgba(0,0,0,0.9),0_0_30px_rgba(225,29,72,0.18)]">
        {/* Main Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={getPlaceholder()}
          className="w-full pt-4 pb-2 px-4 sm:px-5 bg-transparent text-sm sm:text-base text-slate-100 placeholder-slate-400 focus:outline-none resize-none min-h-[56px] max-h-[200px] leading-relaxed"
          id="composer-textarea"
        />

        {/* Bottom Controls Bar inside Box */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t border-white/[0.04] gap-2 flex-wrap">
          {/* Left: Attach & Compact Mode Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Attach File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all cursor-pointer"
              title="Attach files (Code, PDF, Data)"
              id="composer-attach-btn"
            >
              <Paperclip className="w-4 h-4 text-rose-400/90" />
              <span className="hidden sm:inline text-xs font-medium">Attach</span>
            </button>

            {/* Compact Mode Selector */}
            <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/[0.06]">
              {(['chat', 'code', 'research', 'analyze'] as WorkspaceMode[]).map(mode => {
                const info = modeIcons[mode];
                const Icon = info.icon;
                const isSelected = activeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveMode(mode)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-950/60 text-white font-semibold border border-rose-700/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={`Switch to ${info.label} mode`}
                  >
                    <Icon className={`w-3 h-3 ${isSelected ? info.color : 'text-slate-400'}`} />
                    <span className="hidden md:inline text-[11px]">{info.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Model Selector & Send / Stop Button */}
          <div className="flex items-center gap-2">
            {/* Model Selector Pill */}
            <button
              type="button"
              onClick={() => openModal('models')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-slate-300 hover:text-white bg-black/40 hover:bg-rose-950/30 border border-white/[0.06] hover:border-rose-800/30 rounded-xl transition-all cursor-pointer"
              title="Select Model"
              id="composer-model-btn"
            >
              <Cpu className="w-3.5 h-3.5 text-rose-400" />
              <span className="truncate max-w-[95px] sm:max-w-[140px] text-[11px]">{selectedModel.name}</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {/* Send or Stop Generation Button */}
            {isGenerating ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30 transition-all cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse"
                title="Stop generation"
                id="composer-stop-btn"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSubmit}
                className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl transition-all ${
                  canSubmit
                    ? 'bg-gradient-to-r from-rose-700 to-red-600 text-white hover:from-rose-600 hover:to-red-500 hover:shadow-[0_0_16px_rgba(225,29,72,0.45)] active:scale-95 cursor-pointer'
                    : 'bg-white/[0.04] text-slate-400 cursor-not-allowed border border-white/[0.04]'
                }`}
                aria-label="Send message"
                id="composer-send-btn"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
