/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MainWorkspace } from './components/MainWorkspace';
import { ModelsModal } from './components/ModelsModal';
import { SettingsModal } from './components/SettingsModal';
import { AccountModal } from './components/AccountModal';
import { ShareModal } from './components/ShareModal';
import { CreditsModal } from './components/CreditsModal';
import { PlansModal } from './components/PlansModal';
import { AdminModal } from './components/AdminModal';
import { AuthScreen } from './components/AuthScreen';
import { ImageLightboxModal } from './components/ImageLightboxModal';
import { ImageGenerationModal } from './components/ImageGenerationModal';
import { VoiceChatModal } from './components/VoiceChatModal';
import { Shield } from 'lucide-react';

const DarkanoAppContent: React.FC = () => {
  const {
    isAuthenticated,
    authLoading,
    login,
    register,
    forgotPassword,
    resetPassword,
    authError,
    clearAuthError,
    activeLightboxImage,
    setActiveLightboxImage,
    isImageGenModalOpen,
    setImageGenModalOpen,
    isVoiceChatModalOpen,
    setVoiceChatModalOpen
  } = useWorkspace();

  // Loading state while restoring session from secure token
  if (authLoading) {
    return (
      <div className="flex h-screen w-screen bg-[#060204] items-center justify-center font-mono text-xs text-rose-400 select-none">
        <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-black/60 border border-rose-950/60 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
            <span className="tracking-wide">Validating Darkano Session Vault...</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Shield className="w-3 h-3 text-rose-500" />
            <span>Encrypted Scrypt Authentication</span>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated: Render Darkano AI Auth Screen
  if (!isAuthenticated) {
    return (
      <AuthScreen
        onLogin={login}
        onRegister={register}
        onForgotPassword={forgotPassword}
        onResetPassword={resetPassword}
        authError={authError}
        clearAuthError={clearAuthError}
        isLoading={authLoading}
      />
    );
  }

  // Authenticated: Render Main Darkano AI Application
  return (
    <div className="flex h-screen w-screen bg-[#060204] text-slate-100 overflow-hidden font-sans darkano-ambient-bg">
      {/* Expandable Menu Drawer */}
      <Sidebar />

      {/* Primary Content Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Top Header */}
        <Header />

        {/* Main AI Workspace */}
        <MainWorkspace />
      </div>

      {/* Interactive Modals */}
      <ModelsModal />
      <SettingsModal />
      <AccountModal />
      <ShareModal />
      <CreditsModal />
      <PlansModal />
      <AdminModal />
      <ImageLightboxModal
        media={activeLightboxImage}
        onClose={() => setActiveLightboxImage(null)}
      />
      <ImageGenerationModal
        isOpen={isImageGenModalOpen}
        onClose={() => setImageGenModalOpen(false)}
      />
      <VoiceChatModal
        isOpen={isVoiceChatModalOpen}
        onClose={() => setVoiceChatModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <WorkspaceProvider>
      <DarkanoAppContent />
    </WorkspaceProvider>
  );
}
