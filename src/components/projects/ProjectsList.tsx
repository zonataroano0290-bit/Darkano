import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Sparkles,
  Download,
  Trash2,
  ExternalLink,
  Code2,
  Calendar,
  Layers,
  Search,
  RefreshCw,
  Box,
  AlertCircle,
  Users,
  Shield
} from 'lucide-react';
import { ProjectRecord, ProjectFramework, ProjectLanguage } from '../../types';
import { InvitationsBanner } from './InvitationsBanner';

interface ProjectsListProps {
  projects: ProjectRecord[];
  token?: string | null;
  onOpenProject: (projectId: string) => void;
  onCreateProject: (data: {
    name: string;
    description?: string;
    framework: ProjectFramework;
    language: ProjectLanguage;
  }) => Promise<void>;
  onGenerateAiProject: (prompt: string, framework: ProjectFramework) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onExportProject: (projectId: string, name: string) => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
}

export const ProjectsList: React.FC<ProjectsListProps> = ({
  projects,
  token,
  onOpenProject,
  onCreateProject,
  onGenerateAiProject,
  onDeleteProject,
  onExportProject,
  onRefresh,
  isLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Manual create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<ProjectFramework>('react-vite');
  const [language, setLanguage] = useState<ProjectLanguage>('typescript');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Project builder form state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiFramework, setAiFramework] = useState<ProjectFramework>('react-vite');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCreateProject({
        name: name.trim(),
        description: description.trim() || undefined,
        framework,
        language
      });
      setIsCreateModalOpen(false);
      setName('');
      setDescription('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      await onGenerateAiProject(aiPrompt.trim(), aiFramework);
      setIsAiModalOpen(false);
      setAiPrompt('');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getFrameworkBadge = (fw: ProjectFramework) => {
    switch (fw) {
      case 'react-vite':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 flex items-center gap-1">
            <Box className="w-3 h-3 text-cyan-400" />
            <span>React + Vite</span>
          </span>
        );
      case 'vanilla-html':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/40 flex items-center gap-1">
            <Code2 className="w-3 h-3 text-amber-400" />
            <span>Vanilla HTML/CSS/JS</span>
          </span>
        );
      case 'nodejs':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 flex items-center gap-1">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span>Node.js / Express</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#060204] overflow-y-auto darkano-ambient-bg">
      {/* Top Banner */}
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rose-950/40 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300">
                <Code2 className="w-5 h-5 text-rose-400" />
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Darkano Code Workspaces
              </h1>
            </div>
            <p className="text-xs md:text-sm text-slate-400 mt-1 font-mono">
              Real multi-file coding projects with SQLite persistence, live compilation, CodeMirror 6, and AI coding agents.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-rose-700 to-red-600 hover:from-rose-600 hover:to-red-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate with AI</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-rose-400" />
              <span>New Project</span>
            </button>

            <button
              onClick={onRefresh}
              className={`p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors ${
                isLoading ? 'animate-spin' : ''
              }`}
              title="Refresh projects"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pending Project Invitations Banner */}
        <InvitationsBanner token={token || null} onInvitationHandled={onRefresh} />

        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search workspaces by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d121c] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/60 font-mono"
            />
          </div>

          <span className="text-xs font-mono text-slate-500">
            {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800/80 rounded-2xl bg-slate-950/20 p-8 space-y-4">
            <FolderKanban className="w-12 h-12 mx-auto text-slate-600/60" />
            <div>
              <h3 className="text-base font-semibold text-slate-300">No coding projects yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Create a fresh React + Vite, Vanilla HTML, or Node.js workspace, or prompt Darkano AI to build a full multi-file project from scratch.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsAiModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Prompt AI to Build</span>
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-rose-400" />
                <span>Create Blank Project</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group flex flex-col justify-between p-4 rounded-xl bg-[#0c1017] border border-slate-800 hover:border-rose-900/60 transition-all duration-200 hover:shadow-xl hover:shadow-rose-950/10 relative"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-slate-100 group-hover:text-rose-200 transition-colors truncate">
                      {project.name}
                    </h3>
                    <div className="shrink-0">{getFrameworkBadge(project.framework)}</div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] mb-3">
                    {project.description || 'Custom software project workspace.'}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                    </span>
                    <span>·</span>
                    <span className="uppercase text-slate-400">{project.language}</span>
                    {project.currentUserRole && (
                      <>
                        <span>·</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            project.currentUserRole === 'owner'
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                              : project.currentUserRole === 'editor'
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                          }`}
                        >
                          {project.currentUserRole.toUpperCase()}
                        </span>
                      </>
                    )}
                    {(project.membersCount || 1) > 1 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-purple-400">
                          <Users className="w-3 h-3" />
                          <span>{project.membersCount}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onExportProject(project.id, project.name)}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Download as ZIP archive"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteProject(project.id)}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => onOpenProject(project.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-200 border border-rose-700/40 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <span>Open Workspace</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#111622] border border-slate-800 rounded-xl shadow-2xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-rose-400" />
              <span>Create New Project</span>
            </h2>

            <form onSubmit={handleManualCreate} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Project Name *</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g., TodoApp, AnalyticsDashboard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Short description of this project..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Framework</label>
                  <select
                    value={framework}
                    onChange={(e) => setFramework(e.target.value as ProjectFramework)}
                    className="w-full bg-[#0d121c] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
                  >
                    <option value="react-vite">React + Vite</option>
                    <option value="vanilla-html">Vanilla HTML/JS</option>
                    <option value="nodejs">Node.js / Express</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as ProjectLanguage)}
                    className="w-full bg-[#0d121c] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
                  >
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="html">HTML</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#111622] border border-slate-800 rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                <span>AI Project Builder</span>
              </h2>
              <span className="text-[11px] font-mono text-rose-300 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                Credits: ~20
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Darkano AI will synthesize a complete, multi-file codebase with functional components, styling, state management, and boilerplate.
            </p>

            <form onSubmit={handleAiGenerate} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Target Framework</label>
                <select
                  value={aiFramework}
                  onChange={(e) => setAiFramework(e.target.value as ProjectFramework)}
                  className="w-full bg-[#0d121c] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
                >
                  <option value="react-vite">React + Vite (Interactive Frontend App)</option>
                  <option value="vanilla-html">Vanilla HTML/CSS/JS (Clean Web Page)</option>
                  <option value="nodejs">Node.js Server App (APIs & Utilities)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Describe the Project *</label>
                <textarea
                  rows={4}
                  autoFocus
                  placeholder="e.g., A modern Kanban board with drag and drop columns, task priority tags, dark theme, and localStorage sync..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full bg-black/60 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-500 font-mono resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!aiPrompt.trim() || isGenerating}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Project Code...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Project</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
