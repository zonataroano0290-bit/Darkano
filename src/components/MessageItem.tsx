import React, { useState } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Terminal,
  Clock,
  Sparkles,
  Code2,
  Compass,
  BarChart3,
  Trash2,
  Globe,
  ExternalLink,
  Volume2,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { ChatMessage, WorkspaceMode, MediaItem } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';
import { AgentTaskCard } from './AgentTaskCard';
import { AudioPlayerInline } from './AudioPlayerInline';

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const {
    userProfile,
    regenerateMessage,
    deleteMessage,
    models,
    approveTaskStep,
    cancelAgentTask,
    retryAgentTask,
    setActiveLightboxImage,
    synthesizeSpeechAction
  } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [isSynthesizingTTS, setIsSynthesizingTTS] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(message.ttsAudioUrl || null);

  const isUser = message.role === 'user';
  const modelInfo = models.find(m => m.id === message.modelId);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = (codeText: string, index: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  const handleSynthesizeTTS = async () => {
    if (isSynthesizingTTS || !message.content) return;
    if (ttsAudioUrl) {
      // Toggle or replay
      return;
    }
    setIsSynthesizingTTS(true);
    try {
      const result = await synthesizeSpeechAction(message.content.slice(0, 1500), 'Kore', message.id);
      setTtsAudioUrl(result.audioUrl);
    } catch (err) {
      console.error('Speech synthesis error:', err);
    } finally {
      setIsSynthesizingTTS(false);
    }
  };

  // Helper to render markdown-like content (code blocks, headers, lists, bold)
  const renderFormattedContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    let codeBlockCount = 0;

    return parts.map((part, idx) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const currentCodeIdx = codeBlockCount++;
        const firstLineEnd = part.indexOf('\n');
        const lang = firstLineEnd !== -1 ? part.slice(3, firstLineEnd).trim() || 'code' : 'code';
        const codeContent = firstLineEnd !== -1 ? part.slice(firstLineEnd + 1, -3) : part.slice(3, -3);

        const isCodeCopied = copiedCodeIndex === currentCodeIdx;

        return (
          <div key={idx} className="my-3 rounded-xl overflow-hidden border border-rose-950/50 bg-[#090204] shadow-xl">
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-rose-950/20 border-b border-rose-950/40 text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-rose-400" />
                <span className="font-mono text-[11px] text-rose-200/90 uppercase tracking-wider">{lang}</span>
              </div>
              <button
                onClick={() => handleCopyCode(codeContent, currentCodeIdx)}
                className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-rose-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5 cursor-pointer"
                title="Copy code"
              >
                {isCodeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{isCodeCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs sm:text-sm font-mono text-slate-200 overflow-x-auto leading-relaxed selection:bg-rose-500/30">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }

      const lines = part.split('\n');
      return (
        <div key={idx} className="space-y-2">
          {lines.map((line, lineIdx) => {
            if (!line.trim()) return <div key={lineIdx} className="h-1.5" />;

            if (line.startsWith('### ')) {
              return (
                <h3 key={lineIdx} className="text-sm sm:text-base font-semibold text-white tracking-wide mt-3 mb-1">
                  {line.replace('### ', '')}
                </h3>
              );
            }
            if (line.startsWith('#### ')) {
              return (
                <h4 key={lineIdx} className="text-xs sm:text-sm font-medium text-rose-300 tracking-wide mt-2 mb-1">
                  {line.replace('#### ', '')}
                </h4>
              );
            }
            if (line.startsWith('- ') || line.startsWith('* ')) {
              return (
                <div key={lineIdx} className="flex items-start gap-2 text-xs sm:text-sm leading-relaxed text-slate-300 pl-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400/80 mt-2 shrink-0" />
                  <span>{formatInlineStyles(line.slice(2))}</span>
                </div>
              );
            }
            if (/^\d+\.\s/.test(line)) {
              const numMatch = line.match(/^(\d+)\.\s(.*)$/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 text-xs sm:text-sm leading-relaxed text-slate-300 pl-2">
                    <span className="font-mono text-rose-400 text-[11px] sm:text-xs font-semibold mt-0.5">{numMatch[1]}.</span>
                    <span>{formatInlineStyles(numMatch[2])}</span>
                  </div>
                );
              }
            }

            return (
              <p key={lineIdx} className="text-xs sm:text-sm leading-relaxed text-slate-200">
                {formatInlineStyles(line)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  const formatInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((chunk, i) => {
      if (chunk.startsWith('**') && chunk.endsWith('**')) {
        return <strong key={i} className="font-bold text-white">{chunk.slice(2, -2)}</strong>;
      }
      if (chunk.startsWith('`') && chunk.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-200 font-mono text-[11px] border border-rose-900/40">
            {chunk.slice(1, -1)}
          </code>
        );
      }
      return chunk;
    });
  };

  const getModeBadge = (mode: WorkspaceMode) => {
    switch (mode) {
      case 'code':
        return { label: 'Code', icon: Code2, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
      case 'research':
        return { label: 'Research', icon: Compass, color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' };
      case 'analyze':
        return { label: 'Analyze', icon: BarChart3, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
      default:
        return { label: 'Chat', icon: Sparkles, color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' };
    }
  };

  const badge = getModeBadge(message.mode);
  const BadgeIcon = badge.icon;

  return (
    <div
      className={`group py-4 px-4 sm:px-6 transition-colors ${
        isUser
          ? 'bg-[#140409]/40 border-b border-rose-950/30'
          : 'bg-[#090205]/60 border-b border-rose-950/40'
      }`}
    >
      <div className="max-w-4xl mx-auto flex items-start gap-3 sm:gap-4">
        {/* Avatar */}
        {isUser ? (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-950 to-neutral-900 border border-rose-800/40 flex items-center justify-center text-xs font-mono font-bold text-rose-200 shrink-0 shadow-sm mt-0.5">
            {userProfile.avatarText}
          </div>
        ) : (
          <div className="relative w-8 h-8 rounded-lg bg-[#150308] border border-rose-500/40 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(225,29,72,0.2)] mt-0.5">
            <div className="w-4 h-4 text-rose-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4h7a5 5 0 0 1 5 5 5 5 0 0 1-5 5H5" />
                <path d="M12 14l5 6" />
                <circle cx="12" cy="9" r="1.5" fill="#f43f5e" />
              </svg>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-black" />
          </div>
        )}

        {/* Message Body */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white font-mono">
                {isUser ? userProfile.name : 'Darkano AI'}
              </span>

              {!isUser && (
                <>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${badge.color}`}>
                    <BadgeIcon className="w-2.5 h-2.5" />
                    {badge.label}
                  </span>
                  {modelInfo && (
                    <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">
                      {modelInfo.name}
                    </span>
                  )}
                </>
              )}

              <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {message.timestamp}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopyMessage}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/5 transition-colors cursor-pointer"
                title={copied ? 'Copied' : 'Copy message'}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {!isUser && (
                <button
                  onClick={() => regenerateMessage(message.id)}
                  className="p-1 text-slate-400 hover:text-rose-300 rounded hover:bg-white/5 transition-colors cursor-pointer"
                  title="Regenerate response"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => deleteMessage(message.id)}
                className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors cursor-pointer"
                title="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Attached Files display if any */}
          {message.attachedFiles && message.attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {message.attachedFiles.map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-900/40 text-xs text-rose-200"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span className="font-mono text-[11px] truncate max-w-[180px]">{file.name}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  {file.metadata?.format && (
                    <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-rose-950/60 border border-rose-800/40 text-rose-300">
                      {file.metadata.format}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Phase 8 Multimodal: Media Attachments (Images, Audio) */}
          {message.mediaAttachments && message.mediaAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2.5 mb-3">
              {message.mediaAttachments.map(media => {
                if (media.type === 'audio' || media.mimeType.startsWith('audio/')) {
                  return (
                    <div key={media.id} className="w-full">
                      <AudioPlayerInline
                        audioUrl={media.fileUrl}
                        title={media.prompt || 'Audio Voice Recording'}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={media.id}
                    className="group/img relative rounded-xl overflow-hidden border border-neutral-800 bg-black cursor-pointer hover:border-amber-500/50 transition-all max-w-[240px]"
                    onClick={() => setActiveLightboxImage(media)}
                  >
                    <img
                      src={media.fileUrl}
                      alt={media.prompt || 'Visual Asset'}
                      className="w-full h-36 object-cover transition-transform duration-200 group-hover/img:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                      <p className="text-[11px] text-white font-medium truncate">{media.prompt || 'Visual Asset'}</p>
                      <span className="text-[9px] text-amber-400 font-mono">Click to expand</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phase 7: Real Agent Multi-Step Task Execution Card */}
          {message.agentTask && (
            <AgentTaskCard
              task={message.agentTask}
              onApprove={approveTaskStep}
              onCancel={cancelAgentTask}
              onRetry={retryAgentTask}
            />
          )}

          {/* Real Pipeline Stage Indicator */}
          {message.currentStage && !message.agentTask && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-2.5 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 font-mono text-xs animate-pulse">
              <Compass className="w-3.5 h-3.5 text-rose-400 animate-spin" />
              <span>{message.currentStage}</span>
            </div>
          )}

          {/* Citations Tag Chips */}
          {message.citations && message.citations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {message.citations.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-rose-900/40 text-[10px] font-mono text-rose-300"
                >
                  <FileText className="w-3 h-3 text-rose-400" />
                  <span>{c.sourceName || 'Document'}</span>
                  {c.page !== undefined && <span>(p. {c.page})</span>}
                  {c.sheet && <span>({c.sheet})</span>}
                </span>
              ))}
            </div>
          )}

          {/* Content or Status States */}
          {message.status === 'loading' ? (
            <div className="flex items-center gap-2.5 py-2 text-xs font-mono text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Darkano neural matrix synthesizing...</span>
            </div>
          ) : message.status === 'error' ? (
            <div className="my-2 p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-rose-200">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-rose-300">Inference Interrupted</p>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed font-mono">
                    {message.errorMessage || 'An error occurred while communicating with the provider cluster.'}
                  </p>
                </div>
                <button
                  onClick={() => regenerateMessage(message.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-800/50 text-rose-200 text-xs font-mono border border-rose-600/50 transition-colors shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs sm:text-sm text-slate-200">
              {renderFormattedContent(message.content)}
              {message.status === 'streaming' && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-rose-500 align-middle animate-pulse rounded-sm" />
              )}
              {message.status === 'stopped' && (
                <div className="mt-2 text-[10px] font-mono text-amber-400/80 italic flex items-center gap-1">
                  <span>[Generation stopped by user]</span>
                </div>
              )}
              {/* TTS Speech Synthesis Audio Player if synthesized */}
              {ttsAudioUrl && (
                <div className="mt-3">
                  <AudioPlayerInline
                    audioUrl={ttsAudioUrl}
                    voiceName="Kore"
                    title="Assistant Speech Synthesis"
                    autoPlay={true}
                  />
                </div>
              )}
            </div>
          )}

          {/* Verified Grounded Sources Card (Research Mode) */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3.5 p-3 rounded-xl bg-[#0e0307]/80 border border-rose-900/40 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-semibold text-rose-300">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-rose-400" />
                  <span>Verified Grounded Sources ({message.sources.length})</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Real Search Grounding</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.sources.map((src, sIdx) => (
                  <a
                    key={sIdx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-black/40 border border-rose-950/60 hover:border-rose-700/50 hover:bg-rose-950/20 transition-all flex items-start gap-2 text-left group/src"
                  >
                    <Globe className="w-3.5 h-3.5 text-rose-400/80 shrink-0 mt-0.5 group-hover/src:text-rose-300" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-slate-200 truncate group-hover/src:text-white">
                        {src.title}
                      </div>
                      <div className="text-[10px] font-mono text-rose-400/80 flex items-center gap-1 mt-0.5">
                        <span className="truncate">{src.domain}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover/src:opacity-100 shrink-0" />
                      </div>
                      {src.snippet && (
                        <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                          {src.snippet}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Footer Metrics & Actions for AI message */}
          {!isUser && (
            <div className="mt-3 pt-2 border-t border-rose-950/30 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                {message.metrics && (
                  <>
                    <span>Tokens: {message.metrics.tokens}</span>
                    <span>•</span>
                    <span>Latency: {message.metrics.latencyMs}ms</span>
                    {message.metrics.computeNode && (
                      <>
                        <span>•</span>
                        <span className="text-rose-400/80">{message.metrics.computeNode}</span>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Feedback & Speech Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  id={`tts-btn-${message.id}`}
                  onClick={handleSynthesizeTTS}
                  disabled={isSynthesizingTTS}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    ttsAudioUrl
                      ? 'text-purple-400 bg-purple-500/10'
                      : 'text-slate-400 hover:text-purple-300 hover:bg-white/5'
                  }`}
                  title="Read aloud (Text-to-Speech)"
                >
                  {isSynthesizingTTS ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setFeedback(feedback === 'like' ? null : 'like')}
                  className={`p-1 rounded hover:bg-white/5 transition-colors cursor-pointer ${
                    feedback === 'like' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Helpful"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setFeedback(feedback === 'dislike' ? null : 'dislike')}
                  className={`p-1 rounded hover:bg-white/5 transition-colors cursor-pointer ${
                    feedback === 'dislike' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Unhelpful"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCopyMessage}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
                  title="Copy full output"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
