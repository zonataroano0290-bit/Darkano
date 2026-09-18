import React, { useState } from 'react';
import {
  X,
  Cpu,
  Search,
  Check
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { AIModel } from '../types';

export const ModelsModal: React.FC = () => {
  const {
    activeModal,
    closeModal,
    models,
    selectedModelId,
    setSelectedModelId,
    settings,
    updateSettings
  } = useWorkspace();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (activeModal !== 'models') return null;

  const categories = [
    { id: 'all', label: 'All Models' },
    { id: 'multimodal', label: 'Multimodal & Vision' },
    { id: 'flagship', label: 'Flagship Reasoning' },
    { id: 'fast', label: 'Ultra Fast' },
    { id: 'coding', label: 'Coding & AST' },
    { id: 'open-weights', label: 'Open Weights' }
  ];

  const filteredModels = models.filter(m => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.provider.toLowerCase().includes(search.toLowerCase()) ||
      m.capabilities.some(c => c.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'all' ||
      (selectedCategory === 'multimodal' && (m.capabilityMatrix?.vision || m.capabilityMatrix?.image_generation || m.capabilityMatrix?.audio_input)) ||
      (selectedCategory === 'flagship' && (m.category === 'flagship' || m.category === 'reasoning')) ||
      m.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleSelectModel = (model: AIModel) => {
    if (model.isAvailable === false) {
      alert(`Model '${model.name}' requires ${model.provider} API credentials on the server. Currently active available models include Darkano Ultra v2 and Gemini 3.8 Flash.`);
      return;
    }
    setSelectedModelId(model.id);
  };

  const handleSetDefault = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateSettings({
      models: {
        ...settings.models,
        defaultModelId: modelId
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={closeModal}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-2xl bg-[#0c0307]/95 border border-rose-950/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-rose-950/40 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-950/50 border border-rose-800/40 text-rose-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">AI Models & Compute Engines</h2>
              <p className="text-xs text-slate-400">
                Switch active inference model or configure default routing architectures.
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            id="models-modal-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-rose-950/40 space-y-3 bg-[#0a0205]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by model name, provider, or capability..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-rose-950/60 focus:border-rose-500/50 rounded-xl text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500/30"
              id="models-search-input"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/50 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Models Grid / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-rose-950/30">
          {filteredModels.length === 0 ? (
            <div className="py-12 text-center">
              <Cpu className="w-8 h-8 text-rose-950 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No models match your query.</p>
            </div>
          ) : (
            filteredModels.map(model => {
              const isSelected = selectedModelId === model.id;
              const isDefault = settings.models.defaultModelId === model.id;

              return (
                <div
                  key={model.id}
                  onClick={() => handleSelectModel(model)}
                  className={`p-4 rounded-xl transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-rose-950/30 border-rose-600/50 shadow-[0_0_20px_rgba(225,29,72,0.15)] ring-1 ring-rose-500/30'
                      : 'bg-white/[0.02] border-rose-950/30 hover:border-rose-900/50 hover:bg-rose-950/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 shadow-inner"
                        style={{
                          backgroundColor: `${model.accentColor}18`,
                          border: `1px solid ${model.accentColor}50`,
                          color: model.accentColor
                        }}
                      >
                        {model.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-white font-mono">{model.name}</h3>
                          <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                            {model.provider}
                          </span>
                          {model.isAvailable === false ? (
                            <span className="text-[10px] font-mono text-amber-400 bg-amber-950/50 border border-amber-500/30 px-1.5 py-0.5 rounded">
                              API Key Required
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Ready
                            </span>
                          )}
                          {model.isFlagship && (
                            <span className="text-[10px] font-mono font-semibold text-rose-300 bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.5 rounded">
                              Flagship Core
                            </span>
                          )}
                          {isDefault && (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {model.description}
                        </p>

                        {/* Specs row */}
                        <div className="flex items-center gap-3 mt-2.5 text-[11px] font-mono text-slate-400 flex-wrap">
                          <span>Context: <strong className="text-slate-200">{model.contextWindow}</strong></span>
                          <span>•</span>
                          <span>Output: <strong className="text-slate-200">{model.maxOutputTokens}</strong></span>
                          <span>•</span>
                          <span>Latency: <strong className="text-rose-400">{model.latencyTier}</strong></span>
                        </div>

                        {/* Capability Tags */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {model.capabilityMatrix?.vision && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-600/30">
                              Vision Analysis
                            </span>
                          )}
                          {model.capabilityMatrix?.image_generation && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-600/30">
                              Image Generation
                            </span>
                          )}
                          {model.capabilityMatrix?.audio_input && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-600/30">
                              Audio In (STT)
                            </span>
                          )}
                          {model.capabilityMatrix?.audio_output && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-600/30">
                              Voice TTS
                            </span>
                          )}
                          {model.capabilities.map(cap => (
                            <span
                              key={cap}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/5"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Selection Controls */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {isSelected ? (
                        <span className="flex items-center gap-1 text-xs font-semibold font-mono text-rose-300 bg-rose-950/60 border border-rose-600/40 px-2.5 py-1 rounded-lg">
                          <Check className="w-3.5 h-3.5" />
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSelectModel(model)}
                          className="text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-white/10 hover:border-rose-800/40 transition-colors"
                        >
                          Select
                        </button>
                      )}

                      {!isDefault && (
                        <button
                          onClick={e => handleSetDefault(model.id, e)}
                          className="text-[10px] text-slate-400 hover:text-rose-300 underline"
                        >
                          Set as Default
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-rose-950/40 bg-[#090205] flex items-center justify-between text-xs font-mono text-slate-400">
          <span>8 Production Models Configured</span>
          <button
            onClick={closeModal}
            className="px-4 py-1.5 bg-gradient-to-r from-rose-800 to-rose-600 hover:from-rose-700 hover:to-rose-500 text-white font-semibold rounded-lg transition-all text-xs shadow-sm cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
