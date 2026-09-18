import React, { useState, useEffect, useCallback } from 'react';
import {
  Code2,
  FolderTree,
  Play,
  History,
  Key,
  Download,
  ArrowLeft,
  Settings,
  Sparkles,
  FileDiff,
  Activity,
  Maximize2,
  Minimize2,
  RefreshCw,
  Eye,
  Terminal,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  ProjectRecord,
  ProjectFileRecord,
  ProjectSnapshotRecord,
  ProjectBuildRecord,
  ProjectPatchRecord,
  ProjectEnvVarRecord,
  ProjectQualityChecksResult,
  ProjectFramework,
  ProjectLanguage
} from '../../types';

import { ProjectsList } from './ProjectsList';
import { FileTree } from './FileTree';
import { EditorPanel } from './EditorPanel';
import { AiAssistantPanel } from './AiAssistantPanel';
import { PatchesPanel } from './PatchesPanel';
import { PreviewPanel } from './PreviewPanel';
import { ChecksPanel } from './ChecksPanel';
import { SnapshotsModal } from './SnapshotsModal';
import { EnvVarsModal } from './EnvVarsModal';
import { DeploymentsPanel } from './DeploymentsPanel';
import { ScopedEnvVarsModal } from './ScopedEnvVarsModal';
import { Rocket } from 'lucide-react';

export const ProjectsView: React.FC = () => {
  const { token, currentUser } = useWorkspace();

  // Navigation State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);

  // Project Data State
  const [files, setFiles] = useState<ProjectFileRecord[]>([]);
  const [openFiles, setOpenFiles] = useState<ProjectFileRecord[]>([]);
  const [activeFile, setActiveFile] = useState<ProjectFileRecord | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set());

  // Subsystem Data State
  const [snapshots, setSnapshots] = useState<ProjectSnapshotRecord[]>([]);
  const [latestBuild, setLatestBuild] = useState<ProjectBuildRecord | null>(null);
  const [patches, setPatches] = useState<ProjectPatchRecord[]>([]);
  const [envVars, setEnvVars] = useState<ProjectEnvVarRecord[]>([]);
  const [qualityChecks, setQualityChecks] = useState<ProjectQualityChecksResult | null>(null);

  // UI Tabs & Modals
  const [rightTab, setRightTab] = useState<'preview' | 'deployments' | 'ai' | 'patches' | 'checks'>('preview');
  const [isSnapshotsModalOpen, setIsSnapshotsModalOpen] = useState(false);
  const [isEnvVarsModalOpen, setIsEnvVarsModalOpen] = useState(false);
  const [isScopedEnvModalOpen, setIsScopedEnvModalOpen] = useState(false);

  // Loading flags
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isFixingBuild, setIsFixingBuild] = useState(false);
  const [isAiExecuting, setIsAiExecuting] = useState(false);
  const [isRunningChecks, setIsRunningChecks] = useState(false);

  // Helper for authenticated requests
  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, [token]);

  // Load all projects on mount
  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const data = await apiFetch('/api/projects');
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load project details and subresources when selected
  const loadProjectDetails = useCallback(async (projectId: string) => {
    setIsLoadingFiles(true);
    try {
      const [projData, filesData, buildsData, patchesData] = await Promise.all([
        apiFetch(`/api/projects/${projectId}`),
        apiFetch(`/api/projects/${projectId}/files`),
        apiFetch(`/api/projects/${projectId}/builds`),
        apiFetch(`/api/projects/${projectId}/patches`)
      ]);

      setActiveProject(projData.project);
      const fileList: ProjectFileRecord[] = filesData.files || [];
      setFiles(fileList);

      const latest = buildsData.builds?.[0] || null;
      setLatestBuild(latest);
      setPatches(patchesData.patches || []);

      // Auto-open first file or App/index file if none open
      if (fileList.length > 0) {
        const defaultFile = fileList.find(f => f.fileType === 'file' && (f.path.includes('App.') || f.path.includes('index.'))) ||
          fileList.find(f => f.fileType === 'file');

        if (defaultFile) {
          setActiveFile(defaultFile);
          setFileContent(defaultFile.content);
          setOpenFiles([defaultFile]);
        }
      }
    } catch (err) {
      console.error('Failed to load project details:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId);
    } else {
      setActiveProject(null);
      setFiles([]);
      setOpenFiles([]);
      setActiveFile(null);
      setFileContent('');
      setUnsavedFiles(new Set());
    }
  }, [selectedProjectId, loadProjectDetails]);

  // Load Snapshots
  const loadSnapshots = async () => {
    if (!selectedProjectId) return;
    try {
      const data = await apiFetch(`/api/projects/${selectedProjectId}/snapshots`);
      setSnapshots(data.snapshots || []);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    }
  };

  // Load Env Vars
  const loadEnvVars = async () => {
    if (!selectedProjectId) return;
    try {
      const data = await apiFetch(`/api/projects/${selectedProjectId}/env`);
      setEnvVars(data.envVars || []);
    } catch (err) {
      console.error('Failed to load env vars:', err);
    }
  };

  // File selection
  const handleSelectFile = (file: ProjectFileRecord) => {
    if (file.fileType !== 'file') return;

    if (!openFiles.some(f => f.path === file.path)) {
      setOpenFiles(prev => [...prev, file]);
    }
    setActiveFile(file);
    setFileContent(file.content);
  };

  // File content change in CodeMirror
  const handleContentChange = (newContent: string) => {
    setFileContent(newContent);
    if (!activeFile) return;

    if (newContent !== activeFile.content) {
      setUnsavedFiles(prev => new Set(prev).add(activeFile.path));
    } else {
      setUnsavedFiles(prev => {
        const next = new Set(prev);
        next.delete(activeFile.path);
        return next;
      });
    }
  };

  // Save active file
  const handleSaveFile = async () => {
    if (!activeFile || !selectedProjectId) return;

    setIsSavingFile(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/files/${activeFile.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: fileContent })
      });

      const updated = res.file;
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      setOpenFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      setActiveFile(updated);

      setUnsavedFiles(prev => {
        const next = new Set(prev);
        next.delete(updated.path);
        return next;
      });
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setIsSavingFile(false);
    }
  };

  // Close tab
  const handleCloseFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openFiles.filter(f => f.path !== path);
    setOpenFiles(remaining);

    if (activeFile?.path === path) {
      const next = remaining[remaining.length - 1] || null;
      setActiveFile(next);
      setFileContent(next ? next.content : '');
    }
  };

  // Create file
  const handleCreateFile = async (path: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/files`, {
        method: 'POST',
        body: JSON.stringify({ path, content: '', fileType: 'file' })
      });
      const newFile = res.file;
      setFiles(prev => [...prev, newFile]);
      handleSelectFile(newFile);
    } catch (err: any) {
      alert(`Create file error: ${err.message}`);
    }
  };

  // Create folder
  const handleCreateFolder = async (path: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/files`, {
        method: 'POST',
        body: JSON.stringify({ path, fileType: 'directory' })
      });
      setFiles(prev => [...prev, res.file]);
    } catch (err: any) {
      alert(`Create folder error: ${err.message}`);
    }
  };

  // Rename item
  const handleRenameItem = async (oldPath: string, newPath: string, isFolder: boolean) => {
    if (!selectedProjectId) return;
    try {
      if (isFolder) {
        await apiFetch(`/api/projects/${selectedProjectId}/folders/rename`, {
          method: 'POST',
          body: JSON.stringify({ oldPath, newPath })
        });
      } else {
        const target = files.find(f => f.path === oldPath);
        if (!target) return;
        await apiFetch(`/api/projects/${selectedProjectId}/files/${target.id}`, {
          method: 'PUT',
          body: JSON.stringify({ path: newPath })
        });
      }
      loadProjectDetails(selectedProjectId);
    } catch (err: any) {
      alert(`Rename error: ${err.message}`);
    }
  };

  // Delete item
  const handleDeleteItem = async (path: string, isFolder: boolean) => {
    if (!selectedProjectId) return;
    try {
      if (isFolder) {
        await apiFetch(`/api/projects/${selectedProjectId}/folders?path=${encodeURIComponent(path)}`, {
          method: 'DELETE'
        });
      } else {
        const target = files.find(f => f.path === path);
        if (!target) return;
        await apiFetch(`/api/projects/${selectedProjectId}/files/${target.id}`, {
          method: 'DELETE'
        });
      }
      loadProjectDetails(selectedProjectId);
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Run build
  const handleRunBuild = async () => {
    if (!selectedProjectId) return;
    setIsBuilding(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/build`, {
        method: 'POST'
      });
      setLatestBuild(res.build);
      setRightTab('preview');
    } catch (err: any) {
      alert(`Build failure: ${err.message}`);
    } finally {
      setIsBuilding(false);
    }
  };

  // Fix build error with AI
  const handleFixBuildError = async () => {
    if (!selectedProjectId || !latestBuild?.errors) return;
    setIsFixingBuild(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/ai/fix-build`, {
        method: 'POST',
        body: JSON.stringify({
          buildError: latestBuild.errors,
          buildOutput: latestBuild.output
        })
      });

      if (res.patch) {
        setPatches(prev => [res.patch, ...prev]);
        setRightTab('patches');
      } else {
        alert(res.explanation || 'AI analyzed build error, but no single file patch was proposed.');
      }
    } catch (err: any) {
      alert(`AI error: ${err.message}`);
    } finally {
      setIsFixingBuild(false);
    }
  };

  // AI Edit code
  const handleAiEdit = async (params: {
    instruction: string;
    actionType: any;
    mediaBase64?: string;
    mediaMimeType?: string;
  }) => {
    if (!selectedProjectId || !activeFile) {
      throw new Error('No active file selected');
    }

    setIsAiExecuting(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/ai/edit-file`, {
        method: 'POST',
        body: JSON.stringify({
          path: activeFile.path,
          instruction: params.instruction,
          actionType: params.actionType,
          mediaBase64: params.mediaBase64,
          mediaMimeType: params.mediaMimeType
        })
      });

      if (res.patch) {
        setPatches(prev => [res.patch, ...prev]);
      }
      return { explanation: res.explanation, patch: res.patch };
    } finally {
      setIsAiExecuting(false);
    }
  };

  // Generate automated tests
  const handleGenerateTests = async () => {
    if (!selectedProjectId || !activeFile) return;
    setIsAiExecuting(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/ai/generate-tests`, {
        method: 'POST',
        body: JSON.stringify({ path: activeFile.path })
      });
      if (res.patch) {
        setPatches(prev => [res.patch, ...prev]);
        setRightTab('patches');
      }
    } catch (err: any) {
      alert(`Test generation error: ${err.message}`);
    } finally {
      setIsAiExecuting(false);
    }
  };

  // Apply patch
  const handleApplyPatch = async (patchId: string) => {
    if (!selectedProjectId) return;
    try {
      await apiFetch(`/api/projects/${selectedProjectId}/patches/${patchId}/apply`, {
        method: 'POST'
      });
      // Refresh files and project
      await loadProjectDetails(selectedProjectId);
      setPatches(prev => prev.filter(p => p.id !== patchId));
    } catch (err: any) {
      alert(`Apply patch error: ${err.message}`);
    }
  };

  // Reject patch
  const handleRejectPatch = async (patchId: string) => {
    if (!selectedProjectId) return;
    try {
      await apiFetch(`/api/projects/${selectedProjectId}/patches/${patchId}/reject`, {
        method: 'POST'
      });
      setPatches(prev => prev.filter(p => p.id !== patchId));
    } catch (err: any) {
      alert(`Reject patch error: ${err.message}`);
    }
  };

  // Run quality checks
  const handleRunChecks = async () => {
    if (!selectedProjectId) return;
    setIsRunningChecks(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/checks`);
      setQualityChecks(res.checks);
    } catch (err: any) {
      alert(`Diagnostics error: ${err.message}`);
    } finally {
      setIsRunningChecks(false);
    }
  };

  // Snapshot actions
  const handleCreateSnapshot = async (description: string) => {
    if (!selectedProjectId) return;
    await apiFetch(`/api/projects/${selectedProjectId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ description })
    });
    loadSnapshots();
  };

  const handleRollbackSnapshot = async (snapshotId: string) => {
    if (!selectedProjectId) return;
    await apiFetch(`/api/projects/${selectedProjectId}/snapshots/${snapshotId}/rollback`, {
      method: 'POST'
    });
    setIsSnapshotsModalOpen(false);
    loadProjectDetails(selectedProjectId);
  };

  // Env vars actions
  const handleSetEnvVar = async (key: string, value: string) => {
    if (!selectedProjectId) return;
    await apiFetch(`/api/projects/${selectedProjectId}/env`, {
      method: 'POST',
      body: JSON.stringify({ key, value })
    });
    loadEnvVars();
  };

  const handleDeleteEnvVar = async (key: string) => {
    if (!selectedProjectId) return;
    await apiFetch(`/api/projects/${selectedProjectId}/env/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });
    loadEnvVars();
  };

  // Export ZIP
  const handleExportProject = async (projectId: string, projName: string) => {
    const url = `/api/projects/${projectId}/export?token=${encodeURIComponent(token || '')}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${projName.toLowerCase().replace(/\s+/g, '-')}.zip`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Create manual project
  const handleCreateProject = async (data: {
    name: string;
    description?: string;
    framework: ProjectFramework;
    language: ProjectLanguage;
  }) => {
    const res = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    await loadProjects();
    setSelectedProjectId(res.project.id);
  };

  // Generate AI project
  const handleGenerateAiProject = async (prompt: string, framework: ProjectFramework) => {
    const res = await apiFetch('/api/projects/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, framework })
    });
    await loadProjects();
    setSelectedProjectId(res.project.id);
  };

  // Delete project
  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to completely delete this project workspace and all sandbox files?')) {
      return;
    }
    await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
    loadProjects();
  };

  // If no project selected, show Projects Dashboard
  if (!selectedProjectId || !activeProject) {
    return (
      <ProjectsList
        projects={projects}
        onOpenProject={(id) => setSelectedProjectId(id)}
        onCreateProject={handleCreateProject}
        onGenerateAiProject={handleGenerateAiProject}
        onDeleteProject={handleDeleteProject}
        onExportProject={handleExportProject}
        onRefresh={loadProjects}
        isLoading={isLoadingProjects}
      />
    );
  }

  // Active Project Workspace View
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#080c14] overflow-hidden select-none">
      {/* Top Workspace Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e1420] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedProjectId(null)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 text-xs font-medium transition-colors"
            title="Return to Projects List"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Projects</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800" />

          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-slate-100 truncate max-w-[180px]">
              {activeProject.name}
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 uppercase">
              {activeProject.framework}
            </span>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Snapshots Button */}
          <button
            onClick={() => {
              loadSnapshots();
              setIsSnapshotsModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            title="Snapshots & Rollback"
          >
            <History className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Snapshots</span>
          </button>

          {/* Env Vars Button */}
          <button
            onClick={() => {
              loadEnvVars();
              setIsEnvVarsModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            title="Environment Variables"
          >
            <Key className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Env Vars</span>
          </button>

          {/* Scoped Env Button */}
          <button
            onClick={() => setIsScopedEnvModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            title="Scoped Environment Secrets (Prod/Preview/Dev)"
          >
            <Key className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Scoped Env</span>
          </button>

          {/* Export Zip */}
          <button
            onClick={() => handleExportProject(activeProject.id, activeProject.name)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            title="Export ZIP archive"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Deploy Button */}
          <button
            onClick={() => setRightTab('deployments')}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            title="Open Cloud Deployments"
          >
            <Rocket className="w-3 h-3 text-rose-400" />
            <span className="hidden sm:inline">Deploy</span>
          </button>

          {/* Run Build Shortcut */}
          <button
            onClick={handleRunBuild}
            disabled={isBuilding}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isBuilding ? 'Building...' : 'Build'}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Split: Left (FileTree), Center (Editor), Right (Tabs: Preview, AI, Patches, Checks) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Project Explorer */}
        <FileTree
          files={files}
          activeFile={activeFile}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRenameItem={handleRenameItem}
          onDeleteItem={handleDeleteItem}
          onRefresh={() => loadProjectDetails(selectedProjectId)}
          isLoading={isLoadingFiles}
        />

        {/* Center: CodeMirror Editor */}
        <div className="flex-1 flex min-w-0">
          <EditorPanel
            activeFile={activeFile}
            openFiles={openFiles}
            unsavedFiles={unsavedFiles}
            fileContent={fileContent}
            onContentChange={handleContentChange}
            onSaveFile={handleSaveFile}
            onSelectFile={handleSelectFile}
            onCloseFile={handleCloseFile}
            isSaving={isSavingFile}
          />
        </div>

        {/* Right: Interactive Panels (Preview / AI / Patches / Quality Checks) */}
        <div className="w-[420px] lg:w-[480px] xl:w-[560px] flex flex-col min-h-0 bg-[#0c1017] border-l border-slate-800/80">
          {/* Panel Selector Tabs */}
          <div className="flex items-center justify-between px-2 bg-[#121822] border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-1 py-1">
              <button
                onClick={() => setRightTab('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  rightTab === 'preview'
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live Preview</span>
              </button>

              <button
                onClick={() => setRightTab('deployments')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  rightTab === 'deployments'
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Rocket className="w-3.5 h-3.5 text-rose-400" />
                <span>Deployments</span>
              </button>

              <button
                onClick={() => setRightTab('ai')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  rightTab === 'ai'
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                <span>AI Coding</span>
              </button>

              <button
                onClick={() => setRightTab('patches')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors relative ${
                  rightTab === 'patches'
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileDiff className="w-3.5 h-3.5 text-amber-400" />
                <span>Patches</span>
                {patches.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-mono flex items-center justify-center">
                    {patches.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setRightTab('checks')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  rightTab === 'checks'
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Checks</span>
              </button>
            </div>
          </div>

          {/* Panel Content */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {rightTab === 'preview' && (
              <PreviewPanel
                projectId={selectedProjectId}
                latestBuild={latestBuild}
                onRunBuild={handleRunBuild}
                onFixBuildError={handleFixBuildError}
                isBuilding={isBuilding}
                isFixing={isFixingBuild}
                authToken={token || ''}
              />
            )}

            {rightTab === 'deployments' && (
              <DeploymentsPanel
                projectId={selectedProjectId}
                projectName={activeProject.name}
                apiFetch={apiFetch}
                creditBalance={currentUser?.creditBalance ?? 50}
              />
            )}

            {rightTab === 'ai' && (
              <AiAssistantPanel
                activeFile={activeFile}
                onAiEdit={handleAiEdit}
                onGenerateTests={handleGenerateTests}
                onViewPatch={() => setRightTab('patches')}
                isLoading={isAiExecuting}
              />
            )}

            {rightTab === 'patches' && (
              <PatchesPanel
                patches={patches}
                onApplyPatch={handleApplyPatch}
                onRejectPatch={handleRejectPatch}
                isLoading={isSavingFile}
              />
            )}

            {rightTab === 'checks' && (
              <ChecksPanel
                checks={qualityChecks}
                onRunChecks={handleRunChecks}
                isLoading={isRunningChecks}
              />
            )}
          </div>
        </div>
      </div>

      {/* Snapshots Modal */}
      <SnapshotsModal
        isOpen={isSnapshotsModalOpen}
        onClose={() => setIsSnapshotsModalOpen(false)}
        snapshots={snapshots}
        onCreateSnapshot={handleCreateSnapshot}
        onRollbackSnapshot={handleRollbackSnapshot}
        isLoading={false}
      />

      {/* Environment Variables Modal */}
      <EnvVarsModal
        isOpen={isEnvVarsModalOpen}
        onClose={() => setIsEnvVarsModalOpen(false)}
        envVars={envVars}
        onSetEnvVar={handleSetEnvVar}
        onDeleteEnvVar={handleDeleteEnvVar}
        isLoading={false}
      />

      {/* Scoped Environment Variables Modal (Phase 10) */}
      <ScopedEnvVarsModal
        isOpen={isScopedEnvModalOpen}
        onClose={() => setIsScopedEnvModalOpen(false)}
        projectId={selectedProjectId}
        apiFetch={apiFetch}
      />
    </div>
  );
};
