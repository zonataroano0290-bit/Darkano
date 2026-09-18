import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Github,
  Check,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  RefreshCw,
  Lock,
  ArrowDownCircle,
  FileCode,
  Shield,
  Unlink
} from 'lucide-react';
import {
  ProjectRecord,
  ProjectGitStatus,
  ProjectGitCommitRecord
} from '../../types';

interface GitModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectRecord;
  token: string | null;
  onProjectUpdated?: () => void;
  onFilesChanged?: () => void;
}

export const GitModal: React.FC<GitModalProps> = ({
  isOpen,
  onClose,
  project,
  token,
  onProjectUpdated,
  onFilesChanged
}) => {
  const [gitStatus, setGitStatus] = useState<ProjectGitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Connect form state
  const [repoUrl, setRepoUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');

  // Commit form state
  const [commitMessage, setCommitMessage] = useState('');

  const isOwner = project.currentUserRole === 'owner';
  const isViewer = project.currentUserRole === 'viewer';

  const authHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  }, [token]);

  // Load Status
  const loadGitStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${project.id}/git/status`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
        if (data.connection) {
          setRepoUrl(data.connection.repoUrl || '');
          setDefaultBranch(data.connection.defaultBranch || 'main');
        }
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch Git status');
      }
    } catch (err: any) {
      console.error('Git status error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [project.id, authHeaders]);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      loadGitStatus();
    }
  }, [isOpen, loadGitStatus]);

  // Connect Repository
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setIsConnecting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/projects/${project.id}/git/connect`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          token: githubToken.trim() || undefined,
          defaultBranch: defaultBranch.trim() || 'main'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect repository');

      setFeedback({ message: 'GitHub repository connected successfully!', type: 'success' });
      setGithubToken('');
      await loadGitStatus();
      onProjectUpdated?.();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect Repository
  const handleDisconnect = async () => {
    if (!confirm('Disconnect this GitHub repository from the project? (Local files and project history will not be deleted)')) {
      return;
    }

    setIsConnecting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/disconnect`, {
        method: 'POST',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect repository');

      setFeedback({ message: 'Repository disconnected.', type: 'success' });
      await loadGitStatus();
      onProjectUpdated?.();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsConnecting(false);
    }
  };

  // Pull Changes
  const handlePull = async () => {
    setIsPulling(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/pull`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ branch: gitStatus?.connection?.defaultBranch || 'main' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pull from remote');

      setFeedback({
        message: `Pull complete! Synced ${data.filesUpdated || 0} files (Commit: ${data.commitSha?.slice(0, 7) || 'latest'}). Safety snapshot created.`,
        type: 'success'
      });
      await loadGitStatus();
      onFilesChanged?.();
      onProjectUpdated?.();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsPulling(false);
    }
  };

  // Create Commit & Push
  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/projects/${project.id}/git/commit`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: commitMessage.trim(),
          branch: gitStatus?.connection?.defaultBranch || 'main'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish Git commit');

      setFeedback({
        message: `Commit ${data.commit?.sha?.slice(0, 7)} created and pushed to GitHub!`,
        type: 'success'
      });
      setCommitMessage('');
      await loadGitStatus();
      onProjectUpdated?.();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = Boolean(gitStatus?.connected && gitStatus?.connection);
  const changedFiles = gitStatus?.changedFiles || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-neutral-800 text-white border border-neutral-700">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">Git & GitHub Integration</h2>
                {isConnected ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    CONNECTED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                    NOT CONFIGURED
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Real version control with remote GitHub repositories, commits, and pull synchronization.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-5 mt-4 p-3 text-xs rounded-lg flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="p-0.5 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs">Inspecting Git repository status...</span>
            </div>
          ) : !isConnected ? (
            /* STATE 1: NOT CONNECTED (Honest Configuration State) */
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-3">
                <div className="flex items-center gap-2.5 text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">GitHub Integration is Not Configured</h3>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  No remote Git repository has been linked to this project yet. To sync your code with GitHub, publish commits, and pull updates, connect a repository below.
                </p>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center gap-2 text-xs text-neutral-400">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Your Personal Access Token is encrypted server-side with AES-256-GCM and never exposed to the client.
                  </span>
                </div>
              </div>

              {isOwner ? (
                <form onSubmit={handleConnect} className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Github className="w-4 h-4 text-purple-400" />
                    Connect GitHub Repository
                  </h3>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Repository URL or Slug <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={repoUrl}
                      onChange={e => setRepoUrl(e.target.value)}
                      placeholder="e.g. https://github.com/octocat/hello-world or octocat/hello-world"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      GitHub Personal Access Token (PAT) <span className="text-neutral-500">(Optional for public read, required for push/commit)</span>
                    </label>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={e => setGithubToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Needs <code className="text-neutral-300">repo</code> scope for private repos and commit authoring.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Default Branch</label>
                    <input
                      type="text"
                      value={defaultBranch}
                      onChange={e => setDefaultBranch(e.target.value)}
                      placeholder="main"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isConnecting || !repoUrl.trim()}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                    Connect & Authenticate Repository
                  </button>
                </form>
              ) : (
                <div className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 text-xs text-neutral-400 text-center">
                  Only the project owner can configure Git repository connections.
                </div>
              )}
            </div>
          ) : (
            /* STATE 2: CONNECTED REPOSITORY WORKSPACE */
            <div className="space-y-6">
              {/* Repository Overview Bar */}
              <div className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">
                      {gitStatus?.connection?.repoOwner}/{gitStatus?.connection?.repoName}
                    </span>
                    <a
                      href={gitStatus?.connection?.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-400 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-neutral-400">
                    <span className="flex items-center gap-1 font-mono text-purple-400">
                      <GitBranch className="w-3.5 h-3.5" />
                      {gitStatus?.connection?.defaultBranch || 'main'}
                    </span>
                    <span>•</span>
                    <span>
                      {gitStatus?.connection?.hasToken ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Token Authenticated
                        </span>
                      ) : (
                        <span className="text-amber-400">Read-Only Mode</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handlePull}
                    disabled={isPulling || isViewer}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isPulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownCircle className="w-3.5 h-3.5 text-sky-400" />}
                    Pull Remote
                  </button>

                  {isOwner && (
                    <button
                      onClick={handleDisconnect}
                      disabled={isConnecting}
                      title="Disconnect repository"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Commit & Push Section */}
              {!isViewer && (
                <form onSubmit={handleCommit} className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-purple-400" />
                      Commit & Push to {gitStatus?.connection?.defaultBranch || 'main'}
                    </h3>
                    <span className="text-[11px] text-neutral-500">
                      {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} modified
                    </span>
                  </div>

                  <input
                    type="text"
                    required
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    placeholder="Describe your code changes..."
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                  />

                  <button
                    type="submit"
                    disabled={isCommitting || !commitMessage.trim() || !gitStatus?.connection?.hasToken}
                    className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCommit className="w-4 h-4" />}
                    Publish Commit to GitHub
                  </button>

                  {!gitStatus?.connection?.hasToken && (
                    <p className="text-[11px] text-amber-400">
                      A Personal Access Token is required to push commits to remote.
                    </p>
                  )}
                </form>
              )}

              {/* Changed Files Overview */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Modified Files in Project ({changedFiles.length})
                </h4>
                {changedFiles.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-3 text-center">Working directory is clean.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {changedFiles.map((file: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/40 border border-neutral-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="font-mono text-neutral-200">{file.path}</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                          {file.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Remote Branches List */}
              {gitStatus?.branches && gitStatus.branches.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Remote Branches ({gitStatus.branches.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {gitStatus.branches.map((branch: string) => (
                      <span
                        key={branch}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border ${
                          branch === gitStatus.connection?.defaultBranch
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        <GitBranch className="w-3 h-3" />
                        {branch}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Commit History */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Commit History ({gitStatus?.commits?.length || 0})
                </h4>

                {(!gitStatus?.commits || gitStatus.commits.length === 0) ? (
                  <p className="text-xs text-neutral-500 py-3 text-center">No commits recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {gitStatus.commits.map((commit: any) => (
                      <div
                        key={commit.id}
                        className="p-3 rounded-lg bg-neutral-950/40 border border-neutral-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white truncate">{commit.message}</span>
                          <span className="font-mono text-[11px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 shrink-0">
                            {(commit.commitHash || commit.sha || '').slice(0, 7)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                          <span>{commit.authorName || 'Author'}</span>
                          <span>•</span>
                          <span>{new Date(commit.createdAt).toLocaleString()}</span>
                          {commit.branch && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{commit.branch}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Real Git operations authenticated via GitHub REST API</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
