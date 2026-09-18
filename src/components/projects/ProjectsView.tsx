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
  AlertTriangle,
  Rocket,
  Users,
  Github,
  MessageSquare,
  Lock,
  Shield,
  MoreHorizontal,
  Save,
  X
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
import { CollaborationModal } from './CollaborationModal';
import { GitModal } from './GitModal';
import { CommentsPanel } from './CommentsPanel';
import { ConflictModal } from './ConflictModal';

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
  const [rightTab, setRightTab] = useState<'preview' | 'deployments' | 'ai' | 'patches' | 'checks' | 'comments'>('preview');
  const [mobileTab, setMobileTab] = useState<'code' | 'preview' | 'ai' | 'patches' | 'deployments' | 'checks' | 'comments'>('code');
  const [isMobileFilesOpen, setIsMobileFilesOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isSnapshotsModalOpen, setIsSnapshotsModalOpen] = useState(false);
  const [isEnvVarsModalOpen, setIsEnvVarsModalOpen] = useState(false);
  const [isScopedEnvModalOpen, setIsScopedEnvModalOpen] = useState(false);
  const [isCollaborationModalOpen, setIsCollaborationModalOpen] = useState(false);
  const [isGitModalOpen, setIsGitModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictingServerFile, setConflictingServerFile] = useState<ProjectFileRecord | null>(null);

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
      const error: any = new Error(errJson.error || `HTTP ${res.status}`);
      error.status = res.status;
      error.code = errJson.code;
      error.currentFile = errJson.currentFile;
      throw error;
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
    setIsMobileFilesOpen(false);
    setMobileTab('code');
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
  const handleSaveFile = async (force: boolean = false) => {
    if (!activeFile || !selectedProjectId) return;
    if (activeProject?.currentUserRole === 'viewer') {
      alert('Read-only: You are a Viewer on this project and cannot save modifications.');
      return;
    }

    setIsSavingFile(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/files`, {
        method: 'PUT',
        body: JSON.stringify({
          path: activeFile.path,
          content: fileContent,
          expectedVersion: activeFile.version,
          force
        })
      });

      const updated = res.file;
      setFiles(prev => prev.map(f => f.path === updated.path ? updated : f));
      setOpenFiles(prev => prev.map(f => f.path === updated.path ? updated : f));
      setActiveFile(updated);
      setIsConflictModalOpen(false);
      setConflictingServerFile(null);

      setUnsavedFiles(prev => {
        const next = new Set(prev);
        next.delete(updated.path);
        return next;
      });
    } catch (err: any) {
      if (err.status === 409 || err.code === 'VERSION_CONFLICT' || err.message?.includes('conflict') || err.message?.includes('409')) {
        setConflictingServerFile(err.currentFile || null);
        if (!err.currentFile) {
          try {
            const serverRes = await apiFetch(`/api/projects/${selectedProjectId}/files/content?path=${encodeURIComponent(activeFile.path)}`);
            setConflictingServerFile(serverRes.file || null);
          } catch {
            // ignore
          }
        }
        setIsConflictModalOpen(true);
      } else {
        alert(`Save error: ${err.message}`);
      }
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
        token={token}
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
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-full bg-[#080c14] overflow-hidden select-none">
      {/* Desktop Top Workspace Header Bar (visible on lg+) */}
      <div className="hidden lg:flex items-center justify-between px-3 py-2 bg-[#0e1420] border-b border-slate-800 shrink-0">
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
            {activeProject.currentUserRole && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${
                  activeProject.currentUserRole === 'owner'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : activeProject.currentUserRole === 'editor'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {activeProject.currentUserRole}
              </span>
            )}
          </div>
        </div>

        {/* Global Action Buttons (Desktop) */}
        <div className="flex items-center gap-2">
          {/* Team & Collaboration */}
          <button
            onClick={() => setIsCollaborationModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            title="Team Members, Invitations & Sharing"
          >
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Team</span>
            {(activeProject.membersCount || 1) > 1 && (
              <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono">
                {activeProject.membersCount}
              </span>
            )}
          </button>

          {/* Git Integration */}
          <button
            onClick={() => setIsGitModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            title="Git Remote, Commits & Push/Pull"
          >
            <Github className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Git</span>
          </button>

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
            <Play className={`w-3 h-3 fill-current ${isBuilding ? 'animate-spin' : ''}`} />
            <span>{isBuilding ? 'Building...' : 'Build'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Top Workspace Header Bar (visible on < lg) */}
      <div className="flex lg:hidden items-center justify-between px-3 py-2 bg-[#0e1420] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSelectedProjectId(null)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center min-w-[36px] min-h-[36px]"
            title="Return to Projects List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-slate-100 truncate max-w-[130px] sm:max-w-[200px]">
                {activeProject.name}
              </h2>
              {activeProject.currentUserRole && (
                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 uppercase">
                  {activeProject.currentUserRole}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-rose-400/90 truncate uppercase">
              {activeProject.framework} {activeProject.language ? `· ${activeProject.language}` : ''}
            </span>
          </div>
        </div>

        {/* Essential Action Buttons on Mobile */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Files button on mobile */}
          <button
            onClick={() => setIsMobileFilesOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium min-h-[36px] transition-colors"
            title="Open File Explorer"
          >
            <FolderTree className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[11px] font-mono">Files</span>
          </button>

          {/* Save button (shown if unsaved file exists) */}
          {activeFile && unsavedFiles.has(activeFile.path) && (
            <button
              onClick={() => handleSaveFile()}
              disabled={isSavingFile}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold min-h-[36px] shadow-sm shadow-rose-950 transition-colors cursor-pointer"
              title="Save File (Cmd/Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="text-[11px]">{isSavingFile ? '...' : 'Save'}</span>
            </button>
          )}

          {/* Build Button */}
          <button
            onClick={handleRunBuild}
            disabled={isBuilding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer min-h-[36px]"
            title="Run Project Build"
          >
            <Play className={`w-3 h-3 fill-current ${isBuilding ? 'animate-spin' : ''}`} />
            <span>{isBuilding ? 'Building' : 'Build'}</span>
          </button>

          {/* More Actions (⋯) */}
          <button
            onClick={() => setIsMobileMoreOpen(true)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center justify-center min-w-[36px] min-h-[36px]"
            title="More Actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MOBILE WORKSPACE PANEL (visible on < lg: single-panel layout) */}
      <div className="flex lg:hidden flex-1 flex-col min-h-0 min-w-0 w-full overflow-hidden relative">
        {/* Panel 1: CODE Editor */}
        {mobileTab === 'code' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-hidden">
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
              readOnly={activeProject.currentUserRole === 'viewer'}
              onOpenFilesDrawer={() => setIsMobileFilesOpen(true)}
            />
          </div>
        )}

        {/* Panel 2: PREVIEW */}
        {mobileTab === 'preview' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-hidden bg-[#0c1017]">
            <PreviewPanel
              projectId={selectedProjectId}
              latestBuild={latestBuild}
              onRunBuild={handleRunBuild}
              onFixBuildError={handleFixBuildError}
              isBuilding={isBuilding}
              isFixing={isFixingBuild}
              authToken={token || ''}
            />
          </div>
        )}

        {/* Panel 3: AI Assistant */}
        {mobileTab === 'ai' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-y-auto bg-[#0c1017]">
            <AiAssistantPanel
              activeFile={activeFile}
              onAiEdit={handleAiEdit}
              onGenerateTests={handleGenerateTests}
              onViewPatch={() => {
                setRightTab('patches');
                setMobileTab('patches');
              }}
              isLoading={isAiExecuting}
            />
          </div>
        )}

        {/* Panel 4: CHANGES / Patches */}
        {mobileTab === 'patches' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-y-auto bg-[#0c1017]">
            <PatchesPanel
              patches={patches}
              onApplyPatch={handleApplyPatch}
              onRejectPatch={handleRejectPatch}
              isLoading={isSavingFile}
            />
          </div>
        )}

        {/* Panel 5: Secondary - Deployments */}
        {mobileTab === 'deployments' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-hidden bg-[#0c1017]">
            <div className="flex items-center justify-between px-3 py-2 bg-[#121822] border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs font-semibold text-slate-200">Cloud Deployments</span>
              </div>
              <button
                onClick={() => setMobileTab('code')}
                className="text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
              >
                Back to Code
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DeploymentsPanel
                projectId={selectedProjectId}
                projectName={activeProject.name}
                apiFetch={apiFetch}
                creditBalance={currentUser?.creditBalance ?? 50}
              />
            </div>
          </div>
        )}

        {/* Panel 6: Secondary - Checks */}
        {mobileTab === 'checks' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-hidden bg-[#0c1017]">
            <div className="flex items-center justify-between px-3 py-2 bg-[#121822] border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">Quality & Diagnostics Checks</span>
              </div>
              <button
                onClick={() => setMobileTab('code')}
                className="text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
              >
                Back to Code
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ChecksPanel
                checks={qualityChecks}
                onRunChecks={handleRunChecks}
                isLoading={isRunningChecks}
              />
            </div>
          </div>
        )}

        {/* Panel 7: Secondary - Discussions */}
        {mobileTab === 'comments' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-hidden bg-[#0c1017]">
            <div className="flex items-center justify-between px-3 py-2 bg-[#121822] border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-slate-200">Project Discussions</span>
              </div>
              <button
                onClick={() => setMobileTab('code')}
                className="text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
              >
                Back to Code
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <CommentsPanel
                project={activeProject}
                activeFile={activeFile}
                token={token}
                currentUserId={currentUser?.id || ''}
              />
            </div>
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM NAVIGATION SYSTEM (visible on < lg) */}
      <nav className="flex lg:hidden items-center justify-around bg-[#0c1017]/95 backdrop-blur-md border-t border-slate-800 shrink-0 px-1 py-1 select-none z-30 pb-[max(env(safe-area-inset-bottom),8px)]">
        {/* FILES tab (opens file drawer) */}
        <button
          onClick={() => setIsMobileFilesOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg text-slate-400 hover:text-slate-200 transition-colors flex-1 min-h-[44px]"
          title="Open File Explorer"
        >
          <div className="relative">
            <FolderTree className="w-4 h-4 text-slate-300" />
            <span className="absolute -top-1 -right-2.5 px-1 text-[8px] font-mono bg-slate-800 rounded-full text-slate-300">
              {files.filter(f => f.fileType === 'file').length}
            </span>
          </div>
          <span className="text-[10px] font-medium tracking-wide">FILES</span>
        </button>

        {/* CODE tab */}
        <button
          onClick={() => setMobileTab('code')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors flex-1 min-h-[44px] ${
            mobileTab === 'code' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Open Code Editor"
        >
          <div className="relative">
            <Code2 className="w-4 h-4" />
            {activeFile && unsavedFiles.has(activeFile.path) && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
          <span className="text-[10px] font-medium tracking-wide">CODE</span>
        </button>

        {/* PREVIEW tab */}
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors flex-1 min-h-[44px] ${
            mobileTab === 'preview' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Open Live Preview"
        >
          <div className="relative">
            <Eye className="w-4 h-4" />
            {latestBuild?.status === 'success' && (
              <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </div>
          <span className="text-[10px] font-medium tracking-wide">PREVIEW</span>
        </button>

        {/* AI tab */}
        <button
          onClick={() => setMobileTab('ai')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors flex-1 min-h-[44px] ${
            mobileTab === 'ai' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Open AI Coding Assistant"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px] font-medium tracking-wide">AI</span>
        </button>

        {/* CHANGES tab */}
        <button
          onClick={() => setMobileTab('patches')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors flex-1 min-h-[44px] ${
            mobileTab === 'patches' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Open Code Proposals & Patches"
        >
          <div className="relative">
            <FileDiff className="w-4 h-4" />
            {patches.length > 0 && (
              <span className="absolute -top-1 -right-2.5 px-1 text-[9px] font-mono bg-rose-600 text-white rounded-full">
                {patches.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-wide">CHANGES</span>
        </button>
      </nav>

      {/* DESKTOP WORKSPACE SPLIT (visible on lg+: 3-column layout) */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
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
            readOnly={activeProject.currentUserRole === 'viewer'}
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

              <button
                onClick={() => setRightTab('comments')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  rightTab === 'comments'
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-700/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <span>Discussions</span>
              </button>
            </div>
          </div>

          {/* Panel Content (Desktop) */}
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

            {rightTab === 'comments' && (
              <CommentsPanel
                project={activeProject}
                activeFile={activeFile}
                token={token}
                currentUserId={currentUser?.id || ''}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile File Explorer Drawer */}
      {isMobileFilesOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileFilesOpen(false)}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative w-[85%] max-w-[340px] h-full bg-[#0c1017] shadow-2xl flex flex-col border-r border-slate-800 z-10 animate-in slide-in-from-left duration-200">
            <FileTree
              files={files}
              activeFile={activeFile}
              onSelectFile={(file) => {
                handleSelectFile(file);
                setIsMobileFilesOpen(false);
                setMobileTab('code');
              }}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onRenameItem={handleRenameItem}
              onDeleteItem={handleDeleteItem}
              onRefresh={() => loadProjectDetails(selectedProjectId)}
              isLoading={isLoadingFiles}
              className="w-full h-full flex flex-col min-h-0 select-none bg-[#0c1017]"
              onCloseDrawer={() => setIsMobileFilesOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile More Actions Sheet */}
      {isMobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileMoreOpen(false)}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          />

          {/* Sheet Container */}
          <div className="relative w-full sm:max-w-md bg-[#0e1420] border-t sm:border border-slate-800 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl flex flex-col gap-3 max-h-[85vh] overflow-y-auto z-10 pb-[max(env(safe-area-inset-bottom),16px)]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-100">Project Options</span>
                <span className="text-[10px] font-mono text-rose-400">({activeProject.name})</span>
              </div>
              <button
                onClick={() => setIsMobileMoreOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Team & Collaboration */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsCollaborationModalOpen(true);
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <Users className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Team</span>
                  <span className="text-[10px] text-slate-500">{activeProject.membersCount || 1} members</span>
                </div>
              </button>

              {/* Git Integration */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsGitModalOpen(true);
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <Github className="w-4 h-4 text-slate-300 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Git Remote</span>
                  <span className="text-[10px] text-slate-500">Commits & Sync</span>
                </div>
              </button>

              {/* Snapshots */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  loadSnapshots();
                  setIsSnapshotsModalOpen(true);
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <History className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Snapshots</span>
                  <span className="text-[10px] text-slate-500">Version rollback</span>
                </div>
              </button>

              {/* Env Vars */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  loadEnvVars();
                  setIsEnvVarsModalOpen(true);
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <Key className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Env Vars</span>
                  <span className="text-[10px] text-slate-500">Project config</span>
                </div>
              </button>

              {/* Scoped Env */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsScopedEnvModalOpen(true);
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <Key className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Scoped Env</span>
                  <span className="text-[10px] text-slate-500">Prod/Preview</span>
                </div>
              </button>

              {/* Deployments */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setMobileTab('deployments');
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <Rocket className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Deployments</span>
                  <span className="text-[10px] text-slate-500">Cloud providers</span>
                </div>
              </button>

              {/* Checks */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setMobileTab('checks');
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Quality Checks</span>
                  <span className="text-[10px] text-slate-500">Diagnostics</span>
                </div>
              </button>

              {/* Comments */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setMobileTab('comments');
                }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-left min-h-[44px]"
              >
                <MessageSquare className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">Discussions</span>
                  <span className="text-[10px] text-slate-500">Comments</span>
                </div>
              </button>

              {/* Export ZIP */}
              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  handleExportProject(activeProject.id, activeProject.name);
                }}
                className="col-span-2 flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 min-h-[44px] transition-colors"
              >
                <Download className="w-4 h-4 text-rose-400" />
                <span className="font-medium">Export Project (.ZIP archive)</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Collaboration Modal (Phase 11) */}
      <CollaborationModal
        isOpen={isCollaborationModalOpen}
        onClose={() => setIsCollaborationModalOpen(false)}
        project={activeProject}
        token={token}
        currentUserId={currentUser?.id || ''}
        onProjectUpdated={() => {
          loadProjectDetails(activeProject.id);
          loadProjects();
        }}
      />

      {/* Git Integration Modal (Phase 11) */}
      <GitModal
        isOpen={isGitModalOpen}
        onClose={() => setIsGitModalOpen(false)}
        project={activeProject}
        token={token}
        onProjectUpdated={() => {
          loadProjectDetails(activeProject.id);
          loadProjects();
        }}
        onFilesChanged={() => {
          loadProjectDetails(activeProject.id);
        }}
      />

      {/* Version Conflict Modal (Phase 11) */}
      <ConflictModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        filePath={activeFile?.path || ''}
        localContent={fileContent}
        serverFile={conflictingServerFile}
        onForceOverwrite={() => handleSaveFile(true)}
        onAcceptServerVersion={() => {
          if (conflictingServerFile) {
            setFileContent(conflictingServerFile.content);
            setActiveFile(conflictingServerFile);
            setFiles(prev => prev.map(f => f.path === conflictingServerFile.path ? conflictingServerFile : f));
            setOpenFiles(prev => prev.map(f => f.path === conflictingServerFile.path ? conflictingServerFile : f));
          }
          setIsConflictModalOpen(false);
          setConflictingServerFile(null);
        }}
      />
    </div>
  );
};
