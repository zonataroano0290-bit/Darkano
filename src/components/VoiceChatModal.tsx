import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, MicOff, Volume2, Sparkles, RefreshCw, AlertCircle, Play, Pause } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

interface VoiceChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceChatModal: React.FC<VoiceChatModalProps> = ({ isOpen, onClose }) => {
  const {
    transcribeAudioAction,
    synthesizeSpeechAction,
    sendMessage,
    messages,
    isGenerating,
    activeConversation
  } = useWorkspace();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to talk');
  const [voiceName, setVoiceName] = useState<string>('Kore');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const voices = [
    { name: 'Kore', label: 'Kore (Balanced & Clear)' },
    { name: 'Puck', label: 'Puck (Engaging & Warm)' },
    { name: 'Fenrir', label: 'Fenrir (Deep & Resonant)' },
    { name: 'Aoede', label: 'Aoede (Melodic & Expressive)' },
    { name: 'Charon', label: 'Charon (Calm & Authoritative)' }
  ];

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (!isOpen) return null;

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioCaptured(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setStatusMessage('Listening...');
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setError('Microphone access denied or unavailable. Please check your browser permissions.');
      setStatusMessage('Microphone unavailable');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      setStatusMessage('Transcribing speech with Gemini...');
    }
  };

  const handleAudioCaptured = async (blob: Blob) => {
    try {
      const result = await transcribeAudioAction(blob);
      const text = result.transcript.trim();

      if (!text) {
        setStatusMessage('No speech detected. Try again.');
        setIsProcessing(false);
        return;
      }

      setLastTranscript(text);
      setStatusMessage('Querying Darkano reasoning engine...');

      // Send to chat
      sendMessage(text);
      setIsProcessing(false);
      setStatusMessage('Response generating in chat...');
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError(err?.message || 'Speech recognition failed');
      setStatusMessage('Recognition failed');
      setIsProcessing(false);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Find latest assistant message to auto-speak
  const latestAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.status === 'ready');

  const speakLatestMessage = async () => {
    if (!latestAssistantMsg || !latestAssistantMsg.content) return;
    setError(null);
    setIsProcessing(true);
    setStatusMessage(`Synthesizing response with ${voiceName}...`);

    try {
      const tts = await synthesizeSpeechAction(latestAssistantMsg.content.slice(0, 1000), voiceName, latestAssistantMsg.id);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = tts.audioUrl;
        audioPlayerRef.current.play();
      }
      setStatusMessage(`Playing audio (${voiceName})`);
    } catch (err: any) {
      setError(err?.message || 'Voice synthesis failed');
      setStatusMessage('Voice playback failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      id="voice-chat-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <audio ref={audioPlayerRef} className="hidden" />

      <div
        id="voice-chat-modal-content"
        className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        <button
          id="voice-modal-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-200 rounded-full hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-2 flex items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <Mic className="w-4 h-4" />
          </div>
          <h2 className="text-base font-semibold text-neutral-100">Live Voice Mode</h2>
        </div>
        <p className="text-xs text-neutral-400 mb-6">Real-time speech transcription & voice synthesis</p>

        {error && (
          <div id="voice-error-banner" className="mb-4 p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Central Orb / Visualizer */}
        <div className="my-6 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            {isRecording && (
              <>
                <div className="absolute w-36 h-36 rounded-full bg-purple-500/20 animate-ping duration-1000" />
                <div className="absolute w-28 h-28 rounded-full bg-purple-500/30 animate-pulse" />
              </>
            )}
            <button
              id="voice-mic-main-button"
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`relative z-10 w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all active:scale-95 ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
                  : 'bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30'
              }`}
            >
              {isProcessing ? (
                <RefreshCw className="w-8 h-8 animate-spin" />
              ) : isRecording ? (
                <>
                  <MicOff className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-mono">{formatDuration(recordingDuration)}</span>
                </>
              ) : (
                <>
                  <Mic className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Tap to Speak</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-4 text-xs font-medium text-neutral-300">
            {statusMessage}
          </div>
        </div>

        {/* Last Transcript Display */}
        {lastTranscript && (
          <div className="mb-4 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-left">
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Your Speech:</div>
            <p className="text-xs text-neutral-200 font-mono italic truncate">"{lastTranscript}"</p>
          </div>
        )}

        {/* Latest Response Speaker Button */}
        {latestAssistantMsg && latestAssistantMsg.content && (
          <div className="mb-4 flex items-center justify-between p-2.5 bg-neutral-950/60 border border-neutral-800 rounded-xl text-left">
            <div className="truncate mr-2">
              <div className="text-[10px] text-purple-400 font-medium">Assistant Ready</div>
              <div className="text-xs text-neutral-300 truncate">{latestAssistantMsg.content.slice(0, 45)}...</div>
            </div>
            <button
              id="voice-speak-response-btn"
              onClick={speakLatestMessage}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 rounded-lg text-xs flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Read Aloud</span>
            </button>
          </div>
        )}

        {/* Voice Selection */}
        <div className="mt-2 pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <span>Synthesizer Voice:</span>
          <select
            id="voice-select-dropdown"
            value={voiceName}
            onChange={e => setVoiceName(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-neutral-200 focus:outline-none focus:border-purple-500"
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
