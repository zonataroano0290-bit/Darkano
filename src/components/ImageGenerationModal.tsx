import React, { useState } from 'react';
import { X, Sparkles, Wand2, RefreshCw, AlertCircle, CheckCircle2, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MediaItem } from '../types';

interface ImageGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSourceMedia?: MediaItem | null;
}

export const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({
  isOpen,
  onClose,
  initialSourceMedia = null
}) => {
  const {
    generateImageAction,
    editImageAction,
    stageMedia,
    setActiveLightboxImage,
    currentUser,
    userMedia
  } = useWorkspace();

  const [mode, setMode] = useState<'generate' | 'edit'>(initialSourceMedia ? 'edit' : 'generate');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedSourceId, setSelectedSourceId] = useState<string>(initialSourceMedia?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const aspectRatios = [
    { label: '1:1 Square', value: '1:1', desc: 'Avatar / Social' },
    { label: '16:9 Landscape', value: '16:9', desc: 'Desktop / Banner' },
    { label: '9:16 Portrait', value: '9:16', desc: 'Mobile / Story' },
    { label: '4:3 Standard', value: '4:3', desc: 'Photography' },
    { label: '3:4 Vertical', value: '3:4', desc: 'Poster' }
  ];

  const examplePrompts = [
    'A high-tech neural network node visualized in dark obsidian with cyan laser accents, 8k render, octane style',
    'Minimalist isometric workstation with dual curved monitors, subtle glowing ambient light, clean matte finish',
    'A majestic mechanical falcon perched on a glass skyscraper overlooking a fog-covered metropolis at dusk'
  ];

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setError(null);
    setIsGenerating(true);

    try {
      if (mode === 'generate') {
        const result = await generateImageAction(prompt.trim(), aspectRatio);
        setGeneratedResult(result);
      } else {
        if (!selectedSourceId) {
          throw new Error('Please select a source image to edit.');
        }
        const result = await editImageAction(selectedSourceId, prompt.trim());
        setGeneratedResult(result);
      }
    } catch (err: any) {
      setError(err?.message || 'Image generation operation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStageAndClose = () => {
    if (generatedResult) {
      stageMedia(generatedResult);
    }
    onClose();
  };

  const sourceImages = userMedia.filter(m => m.type === 'image' || m.type === 'generated_image' || m.type === 'edited_image');

  return (
    <div
      id="image-gen-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="image-gen-modal-content"
        className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Darkano Visual Studio</h2>
              <p className="text-xs text-neutral-400">Generate and edit visual assets via real multimodal AI</p>
            </div>
          </div>
          <button
            id="image-gen-modal-close-btn"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/20 px-6 pt-2 gap-4">
          <button
            id="tab-generate-image"
            type="button"
            onClick={() => { setMode('generate'); setError(null); }}
            className={`pb-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
              mode === 'generate'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate New Asset</span>
          </button>
          <button
            id="tab-edit-image"
            type="button"
            onClick={() => { setMode('edit'); setError(null); }}
            className={`pb-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
              mode === 'edit'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-300'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Edit Existing Image</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div id="image-gen-error-banner" className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex items-start gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <div>
                <p className="font-semibold text-red-200">Operation Error</p>
                <p className="text-red-300/90">{error}</p>
              </div>
            </div>
          )}

          {generatedResult && (
            <div id="image-gen-success-card" className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Asset Generated Successfully</span>
                </div>
                <button
                  id="preview-fullscreen-btn"
                  onClick={() => setActiveLightboxImage(generatedResult)}
                  className="text-xs text-neutral-400 hover:text-neutral-200 underline"
                >
                  View Fullscreen
                </button>
              </div>
              <div className="relative aspect-video max-h-56 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                <img
                  src={generatedResult.fileUrl}
                  alt="Generated Preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  id="stage-to-composer-btn"
                  type="button"
                  onClick={handleStageAndClose}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <span>Attach to Composer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  id="dismiss-result-btn"
                  type="button"
                  onClick={() => setGeneratedResult(null)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg transition-colors"
                >
                  Generate Another
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Source Image Selector for Edit Mode */}
            {mode === 'edit' && (
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-2">
                  Select Source Image to Edit
                </label>
                {sourceImages.length === 0 ? (
                  <div className="p-3 bg-neutral-950 border border-dashed border-neutral-800 rounded-xl text-center text-xs text-neutral-400">
                    No images found in your Vault. Upload or generate an image first.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 bg-neutral-950 rounded-xl border border-neutral-800">
                    {sourceImages.map(img => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setSelectedSourceId(img.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          selectedSourceId === img.id
                            ? 'border-purple-500 ring-2 ring-purple-500/30'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img.fileUrl} alt={img.prompt || 'Source'} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Prompt Input */}
            <div>
              <label htmlFor="image-prompt-input" className="block text-xs font-medium text-neutral-300 mb-1.5">
                {mode === 'generate' ? 'Image Generation Prompt' : 'Editing Instruction'}
              </label>
              <textarea
                id="image-prompt-input"
                rows={3}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={
                  mode === 'generate'
                    ? 'Describe the image in vivid detail (subject, lighting, composition, style)...'
                    : 'Describe what to modify (e.g., "Add neon signs to the buildings and turn the sky into sunset")...'
                }
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 resize-none font-sans"
              />
            </div>

            {/* Example Prompts */}
            {mode === 'generate' && !prompt && (
              <div>
                <span className="text-[11px] text-neutral-400 mb-1.5 block">Quick Inspiration:</span>
                <div className="flex flex-wrap gap-1.5">
                  {examplePrompts.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(p)}
                      className="px-2.5 py-1 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded-lg text-[10px] text-left transition-colors truncate max-w-xs"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Aspect Ratio Selector (Generate Mode only) */}
            {mode === 'generate' && (
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-2">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {aspectRatios.map(ar => (
                    <button
                      key={ar.value}
                      type="button"
                      onClick={() => setAspectRatio(ar.value)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        aspectRatio === ar.value
                          ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                          : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{ar.value}</div>
                      <div className="text-[9px] text-neutral-400 truncate">{ar.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Credit Cost & Action Button */}
            <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
              <div className="text-xs text-neutral-400 flex items-center gap-1.5">
                <span>Cost:</span>
                <span className="font-semibold text-amber-400">5 Credits</span>
                <span className="text-neutral-400 text-[11px]">•</span>
                <span className="text-neutral-400 text-[11px]">
                  Balance: {currentUser?.creditBalance ?? 0}
                </span>
              </div>

              <button
                id="submit-image-gen-btn"
                type="submit"
                disabled={isGenerating || !prompt.trim() || (mode === 'edit' && !selectedSourceId)}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-neutral-950 font-semibold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-98"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Synthesizing Canvas...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{mode === 'generate' ? 'Generate Asset' : 'Apply Visual Edit'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
