import React from 'react';
import {
  Menu,
  Plus,
  Cpu,
  ChevronDown
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BrandLogo } from './BrandLogo';

export const Header: React.FC = () => {
  const {
    selectedModel,
    openModal,
    setSidebarOpen,
    createNewConversation,
    activeMode,
    messages,
    userProfile
  } = useWorkspace();

  const handleOpenMenu = () => {
    setSidebarOpen(true);
  };

  const handleNewChat = () => {
    createNewConversation(activeMode);
  };

  return (
    <header className="h-14 px-3 sm:px-5 flex items-center justify-between bg-[#080205]/80 backdrop-blur-xl border-b border-rose-950/40 shrink-0 select-none z-20">
      {/* Left: Menu toggle button + Darkano AI Branding */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Simple Menu button */}
        <button
          onClick={handleOpenMenu}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] hover:border-rose-800/30 transition-all text-xs font-medium cursor-pointer shadow-sm group"
          aria-label="Open menu"
          id="main-menu-toggle-btn"
        >
          <Menu className="w-4 h-4 text-rose-400 group-hover:text-rose-300 transition-colors" />
          <span className="hidden sm:inline font-medium tracking-wide">Menu</span>
        </button>

        {/* Darkano AI Logo */}
        <div className="cursor-pointer" onClick={() => handleNewChat()} title="New Session">
          <BrandLogo size="md" />
        </div>
      </div>

      {/* Right: Small Model Indicator & Quick New Chat */}
      <div className="flex items-center gap-2">
        {/* Small Model Indicator pill */}
        <button
          onClick={() => openModal('models')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-300 hover:text-white bg-white/[0.03] hover:bg-rose-950/30 border border-white/[0.07] hover:border-rose-800/30 transition-all cursor-pointer shadow-sm"
          title="Configure AI model"
          id="header-model-indicator-btn"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <Cpu className="w-3.5 h-3.5 text-rose-400 hidden xs:inline" />
          <span className="truncate max-w-[100px] sm:max-w-[150px] font-medium">{selectedModel.name}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {/* User Account Avatar Button */}
        <button
          onClick={() => openModal('account')}
          className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg text-xs font-mono text-slate-300 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.07] hover:border-rose-700/40 transition-all cursor-pointer shadow-sm"
          title="Account profile & database vault"
          id="header-user-account-btn"
        >
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-rose-900 to-neutral-900 border border-rose-600/50 flex items-center justify-center text-[10px] font-bold text-rose-200">
            {userProfile.avatarText}
          </div>
          <span className="hidden sm:inline font-sans text-xs truncate max-w-[100px]">{userProfile.name.split(' ')[0]}</span>
        </button>

        {/* New Chat Quick Button (shown especially when in conversation) */}
        {messages.length > 0 && (
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-200 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 hover:border-rose-600/60 transition-all cursor-pointer shadow-[0_0_12px_rgba(225,29,72,0.15)]"
            title="Start new conversation"
            id="header-new-chat-btn"
          >
            <Plus className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">New</span>
          </button>
        )}
      </div>
    </header>
  );
};
