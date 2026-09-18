import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Code2,
  Compass,
  BarChart3,
  FolderTree,
  Cpu,
  Settings,
  User,
  Trash2,
  Edit2,
  X,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
  CreditCard
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceMode, ActiveModal } from '../types';
import { BrandLogo } from './BrandLogo';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    activeMode,
    setActiveMode,
    isSidebarOpen,
    setSidebarOpen,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    createNewConversation,
    selectConversation,
    activeConversationId,
    filteredConversations,
    searchQuery,
    setSearchQuery,
    renameConversation,
    deleteConversation,
    openModal,
    userProfile,
    currentUser
  } = useWorkspace();

  const isOpen = isSidebarOpen || isMobileSidebarOpen;

  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(true);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setSidebarOpen(false);
    setMobileSidebarOpen(false);
  };

  const handleNewChat = () => {
    createNewConversation(activeMode);
    setCurrentView('workspace');
    handleClose();
  };

  const handleModeSelect = (mode: WorkspaceMode) => {
    setActiveMode(mode);
    setCurrentView('workspace');
    handleClose();
  };

  const handleFilesSelect = () => {
    setCurrentView('files');
    handleClose();
  };

  const handleOpenModal = (modal: ActiveModal) => {
    openModal(modal);
    handleClose();
  };

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(id);
    setEditTitleValue(currentTitle);
  };

  const handleFinishRename = (id: string) => {
    if (editTitleValue.trim()) {
      renameConversation(id, editTitleValue.trim());
    }
    setEditingConvId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    handleClose();
  };

  // Group conversations by relative date
  const groupConversations = () => {
    const today: typeof filteredConversations = [];
    const yesterday: typeof filteredConversations = [];
    const earlier: typeof filteredConversations = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    filteredConversations.forEach(conv => {
      const convTime = new Date(conv.updatedAt).getTime();
      if (convTime >= todayStart) {
        today.push(conv);
      } else if (convTime >= yesterdayStart) {
        yesterday.push(conv);
      } else {
        earlier.push(conv);
      }
    });

    return { today, yesterday, earlier };
  };

  const { today, yesterday, earlier } = groupConversations();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-150 select-none">
      {/* Background Dim & Blur Overlay */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Slide-out Menu Drawer */}
      <div className="relative z-10 w-80 max-w-[85vw] h-full bg-[#0c0307]/95 border-r border-rose-950/50 backdrop-blur-2xl text-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        {/* Drawer Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-rose-950/40 shrink-0">
          <BrandLogo size="sm" />
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
            title="Close menu (Esc)"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-rose-400" />
          </button>
        </div>

        {/* Scrollable Menu Items Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {/* Action: New Chat */}
          <div>
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-rose-950/80 to-rose-900/60 hover:from-rose-900 hover:to-rose-800 border border-rose-700/40 text-rose-100 text-sm font-semibold tracking-wide transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)] group cursor-pointer"
              id="menu-new-chat-btn"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1 rounded-md bg-rose-500/20 text-rose-300 group-hover:scale-110 transition-transform">
                  <Plus className="w-4 h-4" />
                </div>
                <span>New Chat</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-black/40 border border-rose-500/30 px-1.5 py-0.5 rounded text-rose-300">
                {activeMode}
              </span>
            </button>
          </div>

          {/* MAIN SECTION */}
          <div className="space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-rose-300/80 font-semibold">
              Main
            </div>

            <button
              onClick={() => handleModeSelect('chat')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeMode === 'chat' && currentView === 'workspace'
                  ? 'bg-rose-950/50 text-rose-100 border border-rose-700/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-rose-400" />
              <span>AI Chat</span>
            </button>

            <button
              onClick={() => handleModeSelect('code')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeMode === 'code' && currentView === 'workspace'
                  ? 'bg-rose-950/50 text-rose-100 border border-rose-700/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span>Code</span>
            </button>

            <button
              onClick={() => handleModeSelect('research')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeMode === 'research' && currentView === 'workspace'
                  ? 'bg-rose-950/50 text-rose-100 border border-rose-700/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Compass className="w-4 h-4 text-purple-400" />
              <span>Research</span>
            </button>

            <button
              onClick={() => handleModeSelect('analyze')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeMode === 'analyze' && currentView === 'workspace'
                  ? 'bg-rose-950/50 text-rose-100 border border-rose-700/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>Analyze</span>
            </button>
          </div>

          {/* TOOLS SECTION */}
          <div className="space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-rose-300/80 font-semibold">
              Tools
            </div>

            {/* Chat History Expandable Item */}
            <div className="space-y-1">
              <button
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-rose-400" />
                  <span>Chat History</span>
                </div>
                {isHistoryExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {/* Chat History Dropdown / Content */}
              {isHistoryExpanded && (
                <div className="pl-2 pr-1 pt-1 pb-2 space-y-2 border-l border-rose-950/40 ml-4">
                  {/* Search Conversations Input */}
                  <div className="relative px-1">
                    <Search className="w-3 h-3 absolute left-3 top-2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search history..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 bg-black/50 border border-rose-950/60 rounded-md text-[11px] text-slate-200 placeholder-slate-400 focus:outline-none focus:border-rose-500/50"
                    />
                  </div>

                  {/* List of Conversations */}
                  {filteredConversations.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-slate-400">
                      No conversations found
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                      {today.length > 0 && (
                        <div>
                          <div className="text-[9px] font-mono uppercase text-slate-400 px-2 py-0.5">Today</div>
                          {today.map(c => renderConversationItem(c))}
                        </div>
                      )}
                      {yesterday.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[9px] font-mono uppercase text-slate-400 px-2 py-0.5">Yesterday</div>
                          {yesterday.map(c => renderConversationItem(c))}
                        </div>
                      )}
                      {earlier.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[9px] font-mono uppercase text-slate-400 px-2 py-0.5">Earlier</div>
                          {earlier.map(c => renderConversationItem(c))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Files View */}
            <button
              onClick={handleFilesSelect}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                currentView === 'files'
                  ? 'bg-rose-950/50 text-rose-100 border border-rose-700/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <FolderTree className="w-4 h-4 text-amber-400" />
              <span>Files</span>
            </button>

            {/* Models Configuration */}
            <button
              onClick={() => handleOpenModal('models')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Models</span>
            </button>
          </div>

          {/* SYSTEM & BILLING SECTION */}
          <div className="space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-rose-300/80 font-semibold">
              System & Billing
            </div>

            <button
              onClick={() => handleOpenModal('credits')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-rose-400" />
                <span>Credits & Ledger</span>
              </div>
              <span className="font-mono text-[11px] text-rose-300 font-bold">
                {(currentUser?.creditBalance ?? 500).toLocaleString()} cr
              </span>
            </button>

            <button
              onClick={() => handleOpenModal('plans')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              <CreditCard className="w-4 h-4 text-rose-400" />
              <span>Subscription Plans</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => handleOpenModal('admin')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-amber-300 hover:text-white hover:bg-amber-950/30 border border-amber-900/30 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Admin Console</span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/40 text-amber-300">
                  {currentUser?.role}
                </span>
              </button>
            )}

            <button
              onClick={() => handleOpenModal('settings')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </button>

            <button
              onClick={() => handleOpenModal('account')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              <User className="w-4 h-4 text-rose-400" />
              <span>Account</span>
            </button>
          </div>
        </div>

        {/* Drawer Bottom Profile Footer */}
        <div className="p-3 border-t border-rose-950/40 bg-black/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-rose-950 border border-rose-700/40 flex items-center justify-center text-xs font-mono font-bold text-rose-200">
                {userProfile.avatarText}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate">{userProfile.name}</div>
                <div className="text-[10px] font-mono text-rose-400/80 truncate flex items-center gap-1">
                  <span>{userProfile.plan}</span>
                  <span>·</span>
                  <span>{(currentUser?.creditBalance ?? 500).toLocaleString()} cr</span>
                </div>
              </div>
            </div>
            <div className="p-1 rounded bg-rose-950/60 border border-rose-800/40 text-rose-400" title="Secure Core Online">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function renderConversationItem(conv: { id: string; title: string }) {
    const isActive = activeConversationId === conv.id;
    const isEditing = editingConvId === conv.id;

    return (
      <div
        key={conv.id}
        onClick={() => handleSelectConversation(conv.id)}
        className={`group relative flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] cursor-pointer transition-all ${
          isActive
            ? 'bg-rose-950/60 text-rose-100 border border-rose-700/40 font-medium'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
          <Clock className={`w-3 h-3 shrink-0 ${isActive ? 'text-rose-400' : 'text-slate-400'}`} />
          {isEditing ? (
            <input
              type="text"
              value={editTitleValue}
              onChange={e => setEditTitleValue(e.target.value)}
              onBlur={() => handleFinishRename(conv.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleFinishRename(conv.id);
                if (e.key === 'Escape') setEditingConvId(null);
              }}
              autoFocus
              className="w-full bg-black/80 border border-rose-500 text-white text-[11px] px-1 py-0.5 rounded focus:outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{conv.title}</span>
          )}
        </div>

        {/* Hover action icons */}
        {!isEditing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => handleStartRename(conv.id, conv.title, e)}
              className="p-0.5 text-slate-400 hover:text-rose-300 rounded"
              title="Rename conversation"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={e => handleDelete(conv.id, e)}
              className="p-0.5 text-slate-400 hover:text-rose-400 rounded"
              title="Delete conversation"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
    );
  }
};
