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
  ChevronDown,
  Workflow,
  Mic,
  MicOff,
  Image as ImageIcon,
  Palette,
  AlertTriangle,
  RefreshCw,
  Radio
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceMode, MediaItem } from '../types';

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
    stagedMedia,
    stageMedia,
    unstageMedia,
    uploadMediaBlob,
    transcribeAudioAction,
    setImageGenModalOpen,
    setVoiceChatModalOpen,
    setActiveLightboxImage,
    isGenerating,
    stopGeneration
  } = useWorkspace();

  const [input, setInput] = useState('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if ((!input.trim() && stagedComposerFiles.length === 0 && stagedMedia.length === 0) || isGenerating) return;
    sendMessage(input, stagedComposerFiles, stagedMedia);
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

  const handleMediaUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const isAudio = file.type.startsWith('audio/');
        const mediaRecord = await uploadMediaBlob(file, file.type, isAudio ? 'audio' : 'image');
        stageMedia(mediaRecord);
      } catch (err: any) {
        console.error('Failed to upload media:', err);
      }
    }
    e.target.value = '';
  };

  // Real Microphone Audio Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsTranscribing(true);
        try {
          const result = await transcribeAudioAction(audioBlob);
          if (result.transcript) {
            setInput(prev => (prev ? `${prev} ${result.transcript}` : result.transcript));
          }
        } catch (err: any) {
          console.error('Speech transcription failed:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone permission denied:', err);
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
    }
  };

  const modeIcons: Record<
    WorkspaceMode,
    { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
  > = {
    chat: { label: 'Chat', icon: Sparkles, color: 'text-rose-400' },
    code: { label: 'Code', icon: Code2, color: 'text-emerald-400' },
    research: { label: 'Research', icon: Compass, color: 'text-purple-400' },
    analyze: { label: 'Analyze', icon: BarChart3, color: 'text-amber-400' },
    agent: { label: 'Agent', icon: Workflow, color: 'text-cyan-400' }
  };

  const hasAttachedMedia = stagedMedia.length > 0;
  const hasImages = stagedMedia.some(m => m.type === 'image' || m.type === 'generated_image' || m.mimeType.startsWith('image/'));
  const visionSupported = selectedModel.capabilityMatrix ? selectedModel.capabilityMatrix.vision : true;

  const canSubmit =
    (input.trim().length > 0 || stagedComposerFiles.some(f => f.status === 'ready') || hasAttachedMedia) &&
    !isGenerating &&
    !stagedComposerFiles.some(f => f.status === 'uploading') &&
    !(hasImages && !visionSupported);

  const getPlaceholder = () => {
    if (isRecordingAudio) return `Recording your voice (${recordingSeconds}s)... Speak clearly.`;
    if (isTranscribing) return 'Transcribing speech with Gemini Audio Engine...';
    switch (activeMode) {
      case 'agent':
        return 'Ask Darkano to plan and autonomously execute multi-step tool tasks...';
      case 'research':
        return 'Ask Darkano to research live sources, verify citations, and analyze web data...';
      case 'analyze':
        return 'Ask Darkano to parse files, extract metrics, or inspect images...';
      case 'code':
        return 'Ask Darkano to engineer algorithms, analyze repos, or generate production code...';
      default:
        return 'Ask Darkano anything, attach images to inspect, or record voice...';
    }
  };

  return (
    <div className={`w-full ${isCentered ? 'max-w-3xl mx-auto' : 'max-w-4xl mx-auto'}`}>
      {/* Hidden File & Media Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
        id="composer-file-input"
      />
      <input
        type="file"
        ref={mediaInputRef}
        onChange={handleMediaUploadChange}
        accept="image/png,image/jpeg,image/webp,image/gif,audio/mp3,audio/wav,audio/webm,audio/m4a"
        multiple
        className="hidden"
        id="composer-media-input"
      />

      {/* Vision Capability Warning Banner if image attached with non-vision model */}
      {hasImages && !visionSupported && (
        <div id="vision-unsupported-warning" className="mb-2 p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Model Warning:</strong> '{selectedModel.name}' does not support Vision/Image inspection. Switch to a vision model (Gemini 3.8 Flash or Gemini 2.5 Pro).
            </span>
          </div>
          <button
            onClick={() => openModal('models')}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg font-medium underline text-[11px] shrink-0"
          >
            Switch Model
          </button>
        </div>
      )}

      {/* Staged Attached Files & Media Preview Bar */}
      {(stagedComposerFiles.length > 0 || stagedMedia.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {/* Staged Media (Images / Audio) */}
          {stagedMedia.map(media => (
            <div
              key={media.id}
              className="flex items-center gap-2 pl-1.5 pr-1.5 py-1 rounded-lg border bg-neutral-900 border-neutral-800 text-neutral-200 text-xs shadow-sm"
            >
              {media.type === 'audio' ? (
                <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <Mic className="w-3.5 h-3.5" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveLightboxImage(media)}
                  className="w-6 h-6 rounded overflow-hidden bg-black shrink-0 border border-neutral-700 hover:opacity-80"
                  title="Click to preview"
                >
                  <img src={media.fileUrl} alt="Preview" className="w-full h-full object-cover" />
                </button>
              )}
              <span className="font-mono text-[11px] truncate max-w-[120px] sm:max-w-[160px]">
                {media.prompt || (media.type === 'audio' ? 'Voice Recording' : 'Image Attachment')}
              </span>
              <span className="text-[10px] font-mono text-neutral-400 uppercase">
                {media.mimeType.split('/')[1]}
              </span>
              <button
                type="button"
                onClick={() => unstageMedia(media.id)}
                className="p-0.5 text-neutral-400 hover:text-rose-300 rounded transition-colors"
                title="Remove media"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Staged Documents */}
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
                type="button"
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
          {/* Left: Attachments, Voice, Studio & Mode Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Attach Document Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all cursor-pointer"
              title="Attach documents (PDF, Code, Data)"
              id="composer-attach-btn"
            >
              <Paperclip className="w-4 h-4 text-rose-400/90" />
              <span className="hidden sm:inline text-xs font-medium">Doc</span>
            </button>

            {/* Attach Image Button */}
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all cursor-pointer"
              title="Attach Images / Audio for Multimodal Analysis"
              id="composer-media-btn"
            >
              <ImageIcon className="w-4 h-4 text-amber-400/90" />
              <span className="hidden sm:inline text-xs font-medium">Image</span>
            </button>

            {/* Voice Dictation (Microphone) */}
            <button
              type="button"
              onClick={isRecordingAudio ? stopRecording : startRecording}
              disabled={isTranscribing}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                isRecordingAudio
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                  : isTranscribing
                  ? 'bg-neutral-800 text-neutral-400'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
              title={isRecordingAudio ? 'Stop Recording' : 'Voice Dictation (Speak Prompt)'}
              id="composer-mic-btn"
            >
              {isTranscribing ? (
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
              ) : isRecordingAudio ? (
                <>
                  <MicOff className="w-4 h-4 text-red-400" />
                  <span className="text-[11px] font-mono font-bold text-red-300">{recordingSeconds}s</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-purple-400/90" />
                  <span className="hidden sm:inline text-xs font-medium">Voice</span>
                </>
              )}
            </button>

            {/* Visual Studio (Generate Images) */}
            <button
              type="button"
              onClick={() => setImageGenModalOpen(true)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-xl transition-all cursor-pointer"
              title="Open Darkano Visual Studio (Generate or Edit Images)"
              id="composer-image-studio-btn"
            >
              <Palette className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline text-xs font-medium">Visual Studio</span>
            </button>

            {/* Live Voice Chat Mode */}
            <button
              type="button"
              onClick={() => setVoiceChatModalOpen(true)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-xl transition-all cursor-pointer"
              title="Open Live Voice Conversation Mode"
              id="composer-voice-mode-btn"
            >
              <Radio className="w-4 h-4 text-indigo-400" />
              <span className="hidden md:inline text-xs font-medium">Voice Mode</span>
            </button>

            {/* Compact Mode Selector */}
            <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/[0.06] ml-1">
              {(['chat', 'code', 'research', 'analyze', 'agent'] as WorkspaceMode[]).map(mode => {
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
                    <span className="hidden lg:inline text-[11px]">{info.label}</span>
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
              {visionSupported && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Vision Capable" />
              )}
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

