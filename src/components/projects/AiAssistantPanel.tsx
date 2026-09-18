import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Bug,
  Zap,
  RefreshCw,
  PlusCircle,
  FileCheck2,
  Image as ImageIcon,
  Send,
  HelpCircle,
  CheckCircle2,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { ProjectFileRecord, ProjectPatchRecord } from '../../types';

interface AiAssistantPanelProps {
  activeFile: ProjectFileRecord | null;
  onAiEdit: (params: {
    instruction: string;
    actionType: any;
    mediaBase64?: string;
    mediaMimeType?: string;
  }) => Promise<{ explanation: string; patch: ProjectPatchRecord | null }>;
  onGenerateTests: () => Promise<void>;
  onViewPatch: (patch: ProjectPatchRecord) => void;
  isLoading: boolean;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  activeFile,
  onAiEdit,
  onGenerateTests,
  onViewPatch,
  isLoading
}) => {
  const [instruction, setInstruction] = useState('');
  const [actionType, setActionType] = useState<string>('fix');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [lastGeneratedPatch, setLastGeneratedPatch] = useState<ProjectPatchRecord | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const actions = [
    { id: 'fix', label: 'Fix Code / Bug', icon: Bug, desc: 'Detect and resolve bugs, runtime errors, or broken syntax.' },
    { id: 'add_functionality', label: 'Add Feature', icon: PlusCircle, desc: 'Implement new UI components, methods, or state logic.' },
    { id: 'optimize', label: 'Optimize', icon: Zap, desc: 'Improve performance, reduce re-renders, and streamline memory.' },
    { id: 'refactor', label: 'Refactor', icon: Wand2, desc: 'Clean up architecture, extract sub-modules, and standardize types.' },
    { id: 'improve_a11y', label: 'Accessibility', icon: Sparkles, desc: 'Add ARIA attributes, semantic HTML, and keyboard navigation.' },
    { id: 'explain', label: 'Explain Code', icon: HelpCircle, desc: 'Get a clear walkthrough of this file or logic without editing.' }
  ];

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, SVG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setSelectedImage({
        base64,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isLoading || !activeFile) return;

    try {
      const res = await onAiEdit({
        instruction: instruction.trim(),
        actionType,
        mediaBase64: selectedImage?.base64,
        mediaMimeType: selectedImage?.mimeType
      });

      setExplanation(res.explanation);
      setLastGeneratedPatch(res.patch);
      setInstruction('');
      setSelectedImage(null);
    } catch (err: any) {
      alert(`AI error: ${err?.message || 'Operation failed'}`);
    }
  };

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 font-mono text-xs">
        <Sparkles className="w-8 h-8 mb-2 text-rose-400/50" />
        <p className="text-slate-300 font-medium">Select a file to enable AI Coding</p>
        <p className="text-slate-500 mt-1">Open any project file from the left explorer to explain, refactor, or fix code.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c1017] p-3 overflow-y-auto space-y-4">
      {/* Target File Info */}
      <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Target File:</span>
          <span className="text-rose-300 font-semibold">{activeFile.path}</span>
        </div>
        <button
          onClick={onGenerateTests}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-950/60 border border-rose-700/40 text-rose-300 hover:bg-rose-900/60 text-[11px] font-sans font-medium transition-colors"
          title="Generate automated tests for this file"
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Generate Tests</span>
        </button>
      </div>

      {/* Action Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
          Select Coding Objective
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {actions.map(act => {
            const Icon = act.icon;
            const isSelected = actionType === act.id;
            return (
              <button
                key={act.id}
                type="button"
                onClick={() => setActionType(act.id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg text-left transition-all border text-xs min-h-[42px] ${
                  isSelected
                    ? 'bg-rose-950/50 border-rose-500/80 text-rose-100 font-medium'
                    : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-rose-400' : 'text-slate-500'}`} />
                <span className="truncate">{act.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Prompt Form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-between">
          <span>Instruction</span>
          <span className="text-[10px] text-slate-500 font-normal">Credits: ~8</span>
        </label>

        <textarea
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={`Describe what Darkano AI should ${actionType === 'fix' ? 'fix or troubleshoot' : actionType === 'add_functionality' ? 'build or add' : 'change'}...`}
          className="w-full bg-[#111622] border border-slate-700/60 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono resize-none"
        />

        {/* Multimodal Attachment */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700/50 transition-colors min-h-[40px]"
              title="Upload UI screenshot, wireframe, or error image"
            >
              <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
              <span>{selectedImage ? selectedImage.name.slice(0, 16) + '...' : 'Attach Image'}</span>
            </button>
            {selectedImage && (
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="text-xs text-rose-400 hover:underline min-h-[40px] px-1 flex items-center"
              >
                Remove
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!instruction.trim() || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer min-h-[40px]"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Patch...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Execute AI</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Generated Patch Callout */}
      {lastGeneratedPatch && (
        <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Structured Patch Proposal Ready</span>
            </span>
            <button
              onClick={() => onViewPatch(lastGeneratedPatch)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Review Diff</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-300 font-mono">
            {lastGeneratedPatch.diffSummary}
          </p>
        </div>
      )}

      {/* Explanation output */}
      {explanation && (
        <div className="space-y-1 p-3 rounded bg-[#111622] border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
            AI Diagnosis / Explanation
          </span>
          <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
            {explanation}
          </div>
        </div>
      )}
    </div>
  );
};
