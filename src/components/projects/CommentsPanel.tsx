import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Circle,
  Trash2,
  CornerDownRight,
  Filter,
  FileCode,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { ProjectRecord, ProjectCommentRecord, ProjectFileRecord } from '../../types';

interface CommentsPanelProps {
  project: ProjectRecord;
  activeFile: ProjectFileRecord | null;
  token: string | null;
  currentUserId: string;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  project,
  activeFile,
  token,
  currentUserId
}) => {
  const [comments, setComments] = useState<ProjectCommentRecord[]>([]);
  const [filterToFile, setFilterToFile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [lineStart, setLineStart] = useState<string>('');
  const [lineEnd, setLineEnd] = useState<string>('');

  const authHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  }, [token]);

  const loadComments = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = filterToFile && activeFile
        ? `/api/projects/${project.id}/comments?filePath=${encodeURIComponent(activeFile.path)}`
        : `/api/projects/${project.id}/comments`;

      const res = await fetch(url, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [project.id, filterToFile, activeFile, authHeaders]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/projects/${project.id}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          filePath: activeFile?.path || null,
          content: newCommentText.trim(),
          lineStart: lineStart ? Number(lineStart) : null,
          lineEnd: lineEnd ? Number(lineEnd) : null
        })
      });

      if (res.ok) {
        setNewCommentText('');
        setLineStart('');
        setLineEnd('');
        loadComments();
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/projects/${project.id}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          filePath: activeFile?.path || null,
          content: replyText.trim(),
          parentId
        })
      });

      if (res.ok) {
        setReplyText('');
        setReplyingToId(null);
        loadComments();
      }
    } catch (err) {
      console.error('Failed to post reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleResolve = async (commentId: string, currentResolved: boolean) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/comments/${commentId}/resolve`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ resolved: !currentResolved })
      });
      if (res.ok) {
        loadComments();
      }
    } catch (err) {
      console.error('Failed to toggle resolve:', err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment thread?')) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (res.ok) {
        loadComments();
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  // Group root comments and replies
  const rootComments = comments.filter(c => !c.parentId);
  const repliesByParent = comments.reduce((acc, c) => {
    if (c.parentId) {
      acc[c.parentId] = acc[c.parentId] || [];
      acc[c.parentId].push(c);
    }
    return acc;
  }, {} as Record<string, ProjectCommentRecord[]>);

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-l border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-semibold text-white">Project Discussions</h3>
          <span className="text-[11px] text-neutral-400">({comments.length})</span>
        </div>

        {activeFile && (
          <button
            onClick={() => setFilterToFile(!filterToFile)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              filterToFile
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-neutral-400 hover:text-white bg-neutral-800'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>This File</span>
          </button>
        )}
      </div>

      {/* New Comment Box */}
      <form onSubmit={handlePostComment} className="p-3 border-b border-neutral-800 bg-neutral-950/30 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <FileCode className="w-3 h-3 text-neutral-500" />
            {activeFile ? activeFile.path : 'General Project Note'}
          </span>
          {activeFile && (
            <div className="flex items-center gap-1">
              <span>Lines:</span>
              <input
                type="number"
                placeholder="From"
                value={lineStart}
                onChange={e => setLineStart(e.target.value)}
                className="w-12 bg-neutral-900 border border-neutral-800 rounded px-1 text-[11px] text-center text-white"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="To"
                value={lineEnd}
                onChange={e => setLineEnd(e.target.value)}
                className="w-12 bg-neutral-900 border border-neutral-800 rounded px-1 text-[11px] text-center text-white"
              />
            </div>
          )}
        </div>

        <textarea
          rows={2}
          value={newCommentText}
          onChange={e => setNewCommentText(e.target.value)}
          placeholder="Leave a comment or review note..."
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 resize-none"
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !newCommentText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Post Comment
          </button>
        </div>
      </form>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-neutral-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            <span className="text-xs">Loading comments...</span>
          </div>
        ) : rootComments.length === 0 ? (
          <div className="text-center py-10 text-neutral-500 text-xs">
            No comments yet. Start a discussion with your team!
          </div>
        ) : (
          rootComments.map(comment => {
            const replies = repliesByParent[comment.id] || [];
            const isAuthor = comment.userId === currentUserId;
            const isOwner = project.currentUserRole === 'owner';
            const isResolved = Boolean(comment.isResolved ?? comment.resolved);
            const author = comment.authorName || comment.userDisplayName || comment.authorEmail || comment.userEmail || 'Member';

            return (
              <div
                key={comment.id}
                className={`p-3 rounded-xl border text-xs space-y-2 transition-colors ${
                  isResolved
                    ? 'bg-neutral-950/20 border-neutral-800/40 opacity-70'
                    : 'bg-neutral-950/50 border-neutral-800'
                }`}
              >
                {/* Comment Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white text-[10px] uppercase">
                      {author.charAt(0)}
                    </div>
                    <div>
                      <span className="font-semibold text-white">
                        {author}
                      </span>
                      <span className="text-[10px] text-neutral-500 ml-2">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Toggle Resolved */}
                    <button
                      onClick={() => handleToggleResolve(comment.id, isResolved)}
                      title={isResolved ? 'Mark active' : 'Resolve discussion'}
                      className={`p-1 rounded transition-colors ${
                        isResolved ? 'text-emerald-400 hover:text-emerald-300' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {isResolved ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </button>

                    {/* Delete (author or owner) */}
                    {(isAuthor || isOwner) && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        title="Delete comment"
                        className="p-1 rounded text-neutral-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* File Reference if attached */}
                {comment.filePath && (
                  <div className="flex items-center gap-1 text-[11px] text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 w-fit">
                    <FileCode className="w-3 h-3" />
                    <span>{comment.filePath}</span>
                    {comment.lineStart && (
                      <span className="text-neutral-400">
                        (L{comment.lineStart}{comment.lineEnd && comment.lineEnd !== comment.lineStart ? `-${comment.lineEnd}` : ''})
                      </span>
                    )}
                  </div>
                )}

                {/* Comment Content */}
                <p className="text-neutral-200 whitespace-pre-wrap leading-relaxed">
                  {comment.content}
                </p>

                {/* Replies Thread */}
                {replies.length > 0 && (
                  <div className="pt-2 pl-3 border-l-2 border-neutral-800 space-y-2 mt-2">
                    {replies.map(reply => {
                      const replyAuthor = reply.authorName || reply.userDisplayName || reply.authorEmail || reply.userEmail || 'Member';
                      return (
                        <div key={reply.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-white text-[11px]">
                              {replyAuthor}
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-neutral-300 text-[11px] whitespace-pre-wrap">
                            {reply.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply Input or Trigger */}
                <div className="pt-1">
                  {replyingToId === comment.id ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Write a reply..."
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setReplyingToId(null);
                            setReplyText('');
                          }}
                          className="px-2.5 py-1 text-xs text-neutral-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handlePostReply(comment.id)}
                          disabled={isSubmitting || !replyText.trim()}
                          className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReplyingToId(comment.id)}
                      className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-purple-400 transition-colors"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      Reply
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
