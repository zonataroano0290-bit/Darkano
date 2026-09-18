import React, { useState } from 'react';
import {
  X,
  User,
  Palette,
  MessageSquare,
  Cpu,
  Bell,
  Lock,
  BarChart3,
  Check,
  Download,
  Trash2,
  ShieldCheck
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SettingsTab } from '../types';

export const SettingsModal: React.FC = () => {
  const {
    activeModal,
    closeModal,
    settings,
    updateSettings,
    settingsTab,
    setSettingsTab,
    userProfile,
    setUserProfile,
    models,
    clearAllConversations
  } = useWorkspace();

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  if (activeModal !== 'settings') return null;

  const triggerSaveNotification = () => {
    setSavedMessage('Settings updated successfully');
    setTimeout(() => setSavedMessage(null), 2000);
  };

  const navItems: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'chat', label: 'Chat & Inference', icon: MessageSquare },
    { id: 'models', label: 'Models & Routing', icon: Cpu },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy & Security', icon: Lock },
    { id: 'usage', label: 'Usage & Quota', icon: BarChart3 }
  ];

  const handleExportAudit = () => {
    const data = {
      exportTimestamp: new Date().toISOString(),
      user: userProfile,
      settings,
      stats: {
        totalConversations: localStorage.getItem('darkano_ai_conversations_v1')?.length || 0,
        activeModel: settings.models.defaultModelId
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `darkano-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none">
      <div className="w-full max-w-3xl bg-[#0c0307]/95 rounded-2xl border border-rose-950/60 shadow-2xl overflow-hidden flex flex-col sm:flex-row max-h-[85vh] animate-in zoom-in-95 duration-150 text-slate-200">
        {/* Left Navigation Sidebar */}
        <div className="w-full sm:w-56 bg-black/40 border-b sm:border-b-0 sm:border-r border-rose-950/40 p-3 sm:p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-300 font-semibold px-2 py-1">
              Preferences
            </div>
            {navItems.map(item => {
              const Icon = item.icon;
              const isSelected = settingsTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSettingsTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-rose-950/60 text-rose-200 font-semibold border border-rose-700/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  id={`settings-tab-${item.id}-btn`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-rose-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block text-[10px] font-mono text-slate-400 px-3 py-2 border-t border-rose-950/40">
            Darkano Core v1.0.4
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col bg-[#090205]/90 min-w-0">
          {/* Top Bar */}
          <div className="px-6 py-4 border-b border-rose-950/40 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white capitalize font-mono">
              {navItems.find(n => n.id === settingsTab)?.label} Settings
            </h3>
            <div className="flex items-center gap-3">
              {savedMessage && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                  <Check className="w-3.5 h-3.5" />
                  {savedMessage}
                </span>
              )}
              <button
                onClick={closeModal}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
                id="settings-modal-close-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tab Panes */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* 1. Account */}
            {settingsTab === 'account' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-rose-950/40">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-950 to-neutral-900 border border-rose-700/50 flex items-center justify-center text-sm font-bold font-mono text-rose-200">
                    {userProfile.avatarText}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{userProfile.name}</h4>
                    <p className="text-slate-400 font-mono text-[11px]">{userProfile.email}</p>
                    <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/60 border border-rose-700/40 text-rose-300">
                      {userProfile.plan}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Display Name</label>
                    <input
                      type="text"
                      value={userProfile.name}
                      onChange={e => {
                        setUserProfile(prev => ({ ...prev, name: e.target.value }));
                        triggerSaveNotification();
                      }}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-rose-950/60 rounded-xl text-white focus:outline-none focus:border-rose-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                    <input
                      type="email"
                      value={userProfile.email}
                      onChange={e => {
                        setUserProfile(prev => ({ ...prev, email: e.target.value }));
                        triggerSaveNotification();
                      }}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-rose-950/60 rounded-xl text-white focus:outline-none focus:border-rose-500/50"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-rose-950/40 space-y-1">
                  <div className="text-[11px] font-mono text-rose-400 font-semibold">Security & API Secrets</div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    API keys and secrets are securely injected via environment variables and managed in the AI Studio Settings menu.
                  </p>
                </div>
              </div>
            )}

            {/* 2. Appearance */}
            {settingsTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-slate-300 font-semibold mb-2">Interface Theme</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { id: 'crimson', label: 'Dark Crimson (Default)', color: 'border-rose-600/50 bg-[#0c0307]' },
                      { id: 'obsidian', label: 'Obsidian Void', color: 'border-rose-900/40 bg-[#08090d]' },
                      { id: 'cyber', label: 'Cyber Rose', color: 'border-pink-600/40 bg-[#0c0914]' },
                      { id: 'carbon', label: 'Deep Carbon', color: 'border-slate-700/40 bg-[#121316]' }
                    ].map(th => (
                      <button
                        key={th.id}
                        onClick={() => {
                          updateSettings({ appearance: { ...settings.appearance, theme: th.id as any } });
                          triggerSaveNotification();
                        }}
                        className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                          settings.appearance.theme === th.id
                            ? `${th.color} ring-1 ring-rose-500/40 text-white font-semibold shadow-sm`
                            : 'border-rose-950/40 bg-white/[0.02] text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>{th.label}</span>
                        {settings.appearance.theme === th.id && <Check className="w-3.5 h-3.5 text-rose-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-2">Display Density</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['compact', 'standard', 'expanded'].map(size => (
                      <button
                        key={size}
                        onClick={() => {
                          updateSettings({ appearance: { ...settings.appearance, fontSize: size as any } });
                          triggerSaveNotification();
                        }}
                        className={`py-2 px-3 rounded-xl border capitalize text-center transition-all ${
                          settings.appearance.fontSize === size
                            ? 'bg-rose-950/60 border-rose-700/50 text-rose-200 font-semibold'
                            : 'border-rose-950/40 bg-white/[0.02] text-slate-400 hover:text-white'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Font Ligatures in Code Blocks</div>
                      <div className="text-slate-400 text-[11px]">Render programming ligatures in JetBrains Mono</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.appearance.enableLigatures}
                      onChange={e => {
                        updateSettings({ appearance: { ...settings.appearance, enableLigatures: e.target.checked } });
                        triggerSaveNotification();
                      }}
                      className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Reduced Motion</div>
                      <div className="text-slate-400 text-[11px]">Minimize UI transitions and ambient lighting pulses</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.appearance.reducedMotion}
                      onChange={e => {
                        updateSettings({ appearance: { ...settings.appearance, reducedMotion: e.target.checked } });
                        triggerSaveNotification();
                      }}
                      className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. Chat */}
            {settingsTab === 'chat' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Global System Directive</label>
                  <textarea
                    rows={3}
                    value={settings.chat.systemPrompt}
                    onChange={e => {
                      updateSettings({ chat: { ...settings.chat, systemPrompt: e.target.value } });
                      triggerSaveNotification();
                    }}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-rose-950/60 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-rose-500/50 resize-none leading-relaxed"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-300">Temperature: {settings.chat.temperature}</span>
                    <span className="text-slate-400 font-mono">0.0 (Deterministic) - 1.0 (Creative)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.chat.temperature}
                    onChange={e => {
                      updateSettings({ chat: { ...settings.chat, temperature: parseFloat(e.target.value) } });
                      triggerSaveNotification();
                    }}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-300">Top-P Nucleus: {settings.chat.topP}</span>
                    <span className="text-slate-400 font-mono">Token probability mass threshold</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={settings.chat.topP}
                    onChange={e => {
                      updateSettings({ chat: { ...settings.chat, topP: parseFloat(e.target.value) } });
                      triggerSaveNotification();
                    }}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Send on Enter Key</div>
                      <div className="text-slate-400 text-[11px]">Press Return to transmit message (Shift+Return for newline)</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.chat.sendOnEnter}
                      onChange={e => {
                        updateSettings({ chat: { ...settings.chat, sendOnEnter: e.target.checked } });
                        triggerSaveNotification();
                      }}
                      className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Auto-Scroll During Streaming</div>
                      <div className="text-slate-400 text-[11px]">Continuously track new tokens as responses generate</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.chat.autoScroll}
                      onChange={e => {
                        updateSettings({ chat: { ...settings.chat, autoScroll: e.target.checked } });
                        triggerSaveNotification();
                      }}
                      className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. Models */}
            {settingsTab === 'models' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Default Inference Model</label>
                  <select
                    value={settings.models.defaultModelId}
                    onChange={e => {
                      updateSettings({ models: { ...settings.models, defaultModelId: e.target.value } });
                      triggerSaveNotification();
                    }}
                    className="w-full px-3 py-2 bg-[#090205] border border-rose-950/60 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-rose-500/50"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.provider})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Automatic Fallback Model</label>
                  <select
                    value={settings.models.fallbackModelId}
                    onChange={e => {
                      updateSettings({ models: { ...settings.models, fallbackModelId: e.target.value } });
                      triggerSaveNotification();
                    }}
                    className="w-full px-3 py-2 bg-[#090205] border border-rose-950/60 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-rose-500/50"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.provider})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <div className="font-semibold text-slate-200">Auto-Fallback on Rate Limit</div>
                    <div className="text-slate-400 text-[11px]">Reroute prompt gracefully if primary cluster experiences contention</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.models.autoFallback}
                    onChange={e => {
                      updateSettings({ models: { ...settings.models, autoFallback: e.target.checked } });
                      triggerSaveNotification();
                    }}
                    className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 5. Notifications */}
            {settingsTab === 'notifications' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-200">Sound Feedback on Completion</div>
                    <div className="text-slate-400 text-[11px]">Play subtle harmonic chime when long synthesis jobs complete</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.soundEnabled}
                    onChange={e => {
                      updateSettings({ notifications: { ...settings.notifications, soundEnabled: e.target.checked } });
                      triggerSaveNotification();
                    }}
                    className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-200">High Latency Alerts</div>
                    <div className="text-slate-400 text-[11px]">Warn if model cluster P99 latency exceeds 3000ms</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.latencyAlerts}
                    onChange={e => {
                      updateSettings({ notifications: { ...settings.notifications, latencyAlerts: e.target.checked } });
                      triggerSaveNotification();
                    }}
                    className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 6. Privacy */}
            {settingsTab === 'privacy' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong className="text-emerald-300 font-mono">Zero-Log Architecture:</strong> Darkano AI enforces strict isolation. Model inferences are stateless and not utilized for training foundation models.
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-200">Anonymize Telemetry</div>
                    <div className="text-slate-400 text-[11px]">Strip IP and user-agent metadata from request headers</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.privacy.anonymizeTelemetry}
                    onChange={e => {
                      updateSettings({ privacy: { ...settings.privacy, anonymizeTelemetry: e.target.checked } });
                      triggerSaveNotification();
                    }}
                    className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                  />
                </div>

                <div className="pt-4 border-t border-rose-950/40">
                  <h4 className="font-semibold text-rose-300 mb-2">Danger Zone</h4>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to clear all conversation history from local storage?')) {
                        clearAllConversations();
                        triggerSaveNotification();
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-700/40 text-rose-300 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All Local Chat Data</span>
                  </button>
                </div>
              </div>
            )}

            {/* 7. Usage */}
            {settingsTab === 'usage' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-rose-950/40">
                    <div className="text-slate-400 text-[11px] font-mono">Tokens Consumed</div>
                    <div className="text-lg font-bold text-white font-mono mt-1">
                      {userProfile.quota.tokensUsed.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      of {userProfile.quota.tokensLimit.toLocaleString()} monthly
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-rose-950/40">
                    <div className="text-slate-400 text-[11px] font-mono">Staged Vault Storage</div>
                    <div className="text-lg font-bold text-white font-mono mt-1">
                      {(userProfile.quota.storageUsedMb / 1024).toFixed(1)} GB
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      of {(userProfile.quota.storageLimitMb / 1024).toFixed(0)} GB allocated
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleExportAudit}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-rose-950/30 border border-rose-950/50 text-slate-200 rounded-xl transition-colors font-mono text-xs cursor-pointer"
                >
                  <Download className="w-4 h-4 text-rose-400" />
                  <span>Export Complete Workspace Audit Log (.json)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
