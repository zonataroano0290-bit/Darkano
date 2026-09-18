import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Link as LinkIcon,
  Activity,
  Shield,
  Trash2,
  Mail,
  Copy,
  Check,
  Clock,
  LogOut,
  AlertCircle,
  Loader2,
  X,
  ExternalLink
} from 'lucide-react';
import {
  ProjectRecord,
  ProjectMemberRecord,
  ProjectInvitationRecord,
  ProjectShareLinkRecord,
  ProjectActivityRecord,
  ProjectRole
} from '../../types';

interface CollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectRecord;
  token: string | null;
  currentUserId?: string;
  onProjectUpdated?: () => void;
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({
  isOpen,
  onClose,
  project,
  token,
  currentUserId,
  onProjectUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'invite' | 'links' | 'activity'>('members');

  // Data states
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitationRecord[]>([]);
  const [shareLinks, setShareLinks] = useState<ProjectShareLinkRecord[]>([]);
  const [activities, setActivities] = useState<ProjectActivityRecord[]>([]);

  // Loading & Action states
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');

  // Share Link Form
  const [linkPermission, setLinkPermission] = useState<'view' | 'comment' | 'edit'>('view');
  const [linkExpiresDays, setLinkExpiresDays] = useState(30);

  // Join via link input
  const [joinToken, setJoinToken] = useState('');

  const isOwner = project.currentUserRole === 'owner';
  const isViewer = project.currentUserRole === 'viewer';

  const authHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  }, [token]);

  // Load Members
  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  }, [project.id, authHeaders]);

  // Load Invitations
  const loadInvitations = useCallback(async () => {
    if (!isOwner) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/invitations`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    }
  }, [project.id, isOwner, authHeaders]);

  // Load Share Links
  const loadShareLinks = useCallback(async () => {
    if (!isOwner) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/share-links`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setShareLinks(data.shareLinks || []);
      }
    } catch (err) {
      console.error('Failed to load share links:', err);
    }
  }, [project.id, isOwner, authHeaders]);

  // Load Activity
  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/activity?limit=50`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activity || []);
      }
    } catch (err) {
      console.error('Failed to load activity:', err);
    }
  }, [project.id, authHeaders]);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    Promise.all([
      loadMembers(),
      loadInvitations(),
      loadShareLinks(),
      loadActivity()
    ]).finally(() => setIsLoading(false));
  }, [isOpen, loadMembers, loadInvitations, loadShareLinks, loadActivity]);

  // Handle Role Change
  const handleUpdateRole = async (memberUserId: string, newRole: ProjectRole) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members/${memberUserId}/role`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update member role');
      setFeedback({ message: 'Role updated successfully.', type: 'success' });
      loadMembers();
      loadActivity();
      onProjectUpdated?.();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  };

  // Handle Remove Member / Leave
  const handleRemoveMember = async (memberUserId: string, isSelf: boolean) => {
    if (!confirm(isSelf ? 'Are you sure you want to leave this project?' : 'Remove this collaborator from the project?')) {
      return;
    }
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members/${memberUserId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove member');
      setFeedback({ message: isSelf ? 'You have left the project.' : 'Member removed.', type: 'success' });
      loadMembers();
      loadActivity();
      onProjectUpdated?.();
      if (isSelf) {
        onClose();
      }
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  };

  // Handle Send Invitation
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/invitations`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          inviteeEmail: inviteEmail.trim(),
          role: inviteRole
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation');
      setFeedback({ message: `Invitation sent to ${inviteEmail}!`, type: 'success' });
      setInviteEmail('');
      loadInvitations();
      loadActivity();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revoke Invitation
  const handleRevokeInvite = async (invitationId: string) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invitation');
      setFeedback({ message: 'Invitation revoked.', type: 'success' });
      loadInvitations();
      loadActivity();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  };

  // Handle Create Share Link
  const handleCreateShareLink = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/share-links`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          permission: linkPermission,
          expiresInDays: linkExpiresDays
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create share link');
      setFeedback({ message: 'Share link created!', type: 'success' });
      loadShareLinks();
      loadActivity();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revoke Share Link
  const handleRevokeShareLink = async (linkId: string) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/share-links/${linkId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke share link');
      setFeedback({ message: 'Share link revoked.', type: 'success' });
      loadShareLinks();
      loadActivity();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  };

  // Handle Join Via Link Token
  const handleJoinViaToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinToken.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/share-links/join', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: joinToken.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join project');
      setFeedback({ message: 'Successfully joined project!', type: 'success' });
      setJoinToken('');
      loadMembers();
      loadActivity();
      onProjectUpdated?.();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">Project Collaboration</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {project.currentUserRole?.toUpperCase() || 'COLLABORATOR'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Manage members, project invitations, secure share links, and audit history.
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

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/60 px-5 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'members'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Members ({members.length})
          </button>

          {isOwner && (
            <button
              onClick={() => setActiveTab('invite')}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'invite'
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Invite & Pending ({invitations.length})
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => setActiveTab('links')}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'links'
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              Share Links ({shareLinks.length})
            </button>
          )}

          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'activity'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            Activity Log
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

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs">Loading collaboration data...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: MEMBERS */}
              {activeTab === 'members' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {members.map(member => {
                      const isSelf = member.userId === currentUserId;
                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/80 hover:border-neutral-700/80 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs uppercase shadow-sm">
                              {member.userDisplayName?.charAt(0) || member.userEmail?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-white">
                                  {member.userDisplayName || member.userEmail}
                                </span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-neutral-400">{member.userEmail}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Role selection for Owner */}
                            {isOwner && !isSelf && member.role !== 'owner' ? (
                              <select
                                value={member.role}
                                onChange={e => handleUpdateRole(member.userId, e.target.value as ProjectRole)}
                                className="bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-neutral-200 focus:outline-none focus:border-purple-500"
                              >
                                <option value="editor">Editor (Read/Write)</option>
                                <option value="viewer">Viewer (Read-only)</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                                  member.role === 'owner'
                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                    : member.role === 'editor'
                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                                }`}
                              >
                                {member.role.toUpperCase()}
                              </span>
                            )}

                            {/* Remove or Leave Action */}
                            {isOwner && !isSelf && (
                              <button
                                onClick={() => handleRemoveMember(member.userId, false)}
                                title="Remove collaborator"
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}

                            {!isOwner && isSelf && (
                              <button
                                onClick={() => handleRemoveMember(member.userId, true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium border border-rose-500/20 transition-colors"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                Leave Project
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: INVITE & PENDING */}
              {activeTab === 'invite' && (
                <div className="space-y-6">
                  {/* Send Invite Form */}
                  <form onSubmit={handleSendInvite} className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-400" />
                      Invite Authenticated Collaborator
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Send an official collaboration invite to any registered Darkano AI user account.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-300 mb-1">User Email</label>
                        <input
                          type="email"
                          required
                          value={inviteEmail}
                          onChange={e => setInviteEmail(e.target.value)}
                          placeholder="collaborator@example.com"
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1">Role</label>
                        <select
                          value={inviteRole}
                          onChange={e => setInviteRole(e.target.value as any)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="editor">Editor (Can edit files)</option>
                          <option value="viewer">Viewer (Read-only)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !inviteEmail.trim()}
                      className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Send Project Invitation
                    </button>
                  </form>

                  {/* Pending Invitations List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Pending Invitations ({invitations.length})
                    </h4>
                    {invitations.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-3 text-center">No pending invitations for this project.</p>
                    ) : (
                      <div className="space-y-2">
                        {invitations.map(invite => (
                          <div
                            key={invite.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-neutral-950/40 border border-neutral-800 text-xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <Mail className="w-4 h-4 text-neutral-400" />
                              <div>
                                <span className="font-medium text-neutral-200">{invite.inviteeEmail}</span>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500">
                                  <span>Role: {invite.role.toUpperCase()}</span>
                                  <span>•</span>
                                  <span>Expires: {new Date(invite.expiresAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium border border-rose-500/20 transition-colors"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: SHARE LINKS */}
              {activeTab === 'links' && (
                <div className="space-y-6">
                  {/* Create Share Link Form */}
                  <div className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-purple-400" />
                      Create Secure Share Link
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Generate a cryptographic link that grants immediate access to collaborators upon sign-in.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1">Access Level</label>
                        <select
                          value={linkPermission}
                          onChange={e => setLinkPermission(e.target.value as any)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="view">View-Only (Read files, run preview)</option>
                          <option value="comment">Commenter (Can comment on code)</option>
                          <option value="edit">Editor (Can edit files and build)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1">Expires In</label>
                        <select
                          value={linkExpiresDays}
                          onChange={e => setLinkExpiresDays(Number(e.target.value))}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value={7}>7 Days</option>
                          <option value={30}>30 Days</option>
                          <option value={90}>90 Days</option>
                          <option value={365}>1 Year</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleCreateShareLink}
                      disabled={isSubmitting}
                      className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                      Generate Cryptographic Share Link
                    </button>
                  </div>

                  {/* Active Share Links List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Active Share Links ({shareLinks.length})
                    </h4>
                    {shareLinks.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-3 text-center">No active share links.</p>
                    ) : (
                      <div className="space-y-2">
                        {shareLinks.map(link => {
                          const linkUrl = `${window.location.origin}/#share=${link.token}`;
                          return (
                            <div
                              key={link.id}
                              className="p-3 rounded-lg bg-neutral-950/40 border border-neutral-800 space-y-2"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 font-semibold rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                                    {link.permission.toUpperCase()}
                                  </span>
                                  <span className="text-neutral-500">
                                    Used {link.useCount ?? 0} time{(link.useCount ?? 0) !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <span className="text-[11px] text-neutral-500">
                                  Expires {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  readOnly
                                  value={linkUrl}
                                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1 text-xs text-neutral-300 font-mono select-all focus:outline-none"
                                />
                                <button
                                  onClick={() => copyToClipboard(linkUrl, link.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
                                >
                                  {copiedId === link.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  {copiedId === link.id ? 'Copied' : 'Copy'}
                                </button>
                                <button
                                  onClick={() => handleRevokeShareLink(link.id)}
                                  className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
                                >
                                  Revoke
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: ACTIVITY LOG */}
              {activeTab === 'activity' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Recent Project Activity & Audit Log
                  </h4>

                  {activities.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-6 text-center">No recorded activity yet.</p>
                  ) : (
                    <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-800">
                      {activities.map(act => (
                        <div key={act.id} className="relative flex items-start gap-3 text-xs">
                          <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-purple-500 ring-4 ring-neutral-900" />
                          <div className="flex-1 p-3 rounded-lg bg-neutral-950/40 border border-neutral-800">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-white">
                                {act.actorDisplayName || act.actorEmail || act.userDisplayName || act.userEmail || 'System'}
                              </span>
                              <span className="text-[11px] text-neutral-500">
                                {new Date(act.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-neutral-300 mt-1">
                              <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px] font-mono mr-1.5 border border-neutral-700">
                                {act.action || act.eventType}
                              </span>
                              {act.targetType && (
                                <span className="text-neutral-400">on {act.targetType}</span>
                              )}
                              {act.targetId && (
                                <span className="font-mono text-neutral-300 ml-1 text-[11px]">
                                  "{act.targetId}"
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Strict server-side RBAC & audit logging enabled</span>
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
