import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Check, X, Users, AlertCircle, Loader2 } from 'lucide-react';
import { ProjectInvitationRecord } from '../../types';

interface InvitationsBannerProps {
  token: string | null;
  onInvitationHandled: () => void;
}

export const InvitationsBanner: React.FC<InvitationsBannerProps> = ({ token, onInvitationHandled }) => {
  const [invitations, setInvitations] = useState<ProjectInvitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/user/invitations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to fetch pending invitations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleAccept = async (invite: ProjectInvitationRecord) => {
    if (!token) return;
    setProcessingId(invite.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: invite.token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept invitation');
      setFeedback({ message: `Joined ${invite.projectName || 'project'} as ${invite.role.toUpperCase()}!`, type: 'success' });
      fetchInvitations();
      onInvitationHandled();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invite: ProjectInvitationRecord) => {
    if (!token) return;
    setProcessingId(invite.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/invitations/decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: invite.token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to decline invitation');
      setFeedback({ message: 'Invitation declined.', type: 'success' });
      fetchInvitations();
      onInvitationHandled();
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  if (invitations.length === 0 && !feedback) {
    return null;
  }

  return (
    <div className="mb-6 space-y-3">
      {feedback && (
        <div
          className={`flex items-center gap-2 p-3 text-sm rounded-lg border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {invitations.map(invite => (
        <div
          key={invite.id}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent border border-sky-500/20 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-500/20 text-sky-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">Project Collaboration Invitation</span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  {invite.role.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-neutral-300 mt-0.5">
                <span className="font-medium text-white">{invite.inviterDisplayName || invite.inviterEmail || 'A collaborator'}</span> invited you to collaborate on{' '}
                <span className="font-medium text-white">"{invite.projectName || 'Project'}"</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleAccept(invite)}
              disabled={processingId === invite.id}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {processingId === invite.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Accept
            </button>
            <button
              onClick={() => handleDecline(invite)}
              disabled={processingId === invite.id}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700 transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
