import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Activity,
  LogOut,
  Sparkles,
  CheckCircle,
  Shield,
  Edit2,
  Check,
  Zap,
  Coins
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export const AccountModal: React.FC = () => {
  const { activeModal, closeModal, userProfile, openModal, logout, updateUserProfile, currentUser } = useWorkspace();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(userProfile.name);
  const [isSavingName, setIsSavingName] = useState(false);

  if (activeModal !== 'account') return null;

  const tokenPercent = Math.min(
    100,
    Math.round((userProfile.quota.tokensUsed / userProfile.quota.tokensLimit) * 100)
  );

  const storagePercent = Math.min(
    100,
    Math.round((userProfile.quota.storageUsedMb / userProfile.quota.storageLimitMb) * 100)
  );

  const handleLogout = async () => {
    await logout();
  };

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName.trim().length < 2) return;
    setIsSavingName(true);
    try {
      await updateUserProfile(editedName.trim());
      setIsEditingName(false);
    } catch {
      // ignore
    } finally {
      setIsSavingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none font-sans">
      <div className="w-full max-w-lg bg-[#0c0307]/95 rounded-2xl border border-rose-950/60 p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-150 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-950/40 pb-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-bold text-white tracking-tight">Account & Workspace Identity</h2>
          </div>
          <button
            onClick={closeModal}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
            id="account-modal-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-rose-950/40">
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-950 to-neutral-900 border border-rose-700/50 flex items-center justify-center text-base font-bold font-mono text-rose-200 shadow-inner overflow-hidden">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={userProfile.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              userProfile.avatarText
            )}
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-black" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              {isEditingName ? (
                <div className="flex items-center gap-1.5 flex-1 mr-2">
                  <input
                    type="text"
                    value={editedName}
                    onChange={e => setEditedName(e.target.value)}
                    className="w-full bg-black/60 border border-rose-600 px-2 py-0.5 rounded text-xs text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="p-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 cursor-pointer"
                    title="Save name"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingName(false);
                      setEditedName(userProfile.name);
                    }}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate">{userProfile.name}</h3>
                  <button
                    onClick={() => {
                      setIsEditingName(true);
                      setEditedName(userProfile.name);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-300 rounded cursor-pointer"
                    title="Edit display name"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-700/40 text-rose-300">
                Verified
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3 h-3" />
              <span>{userProfile.email}</span>
            </p>
            <div className="text-[11px] font-mono text-rose-400 mt-1 flex items-center justify-between">
              <span>Active Tier: {userProfile.plan}</span>
              {currentUser?.createdAt && (
                <span className="text-slate-400 text-[10px]">
                  Member since {new Date(currentUser.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Verified Credit Balance Card */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-black border border-rose-800/40 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 flex items-center gap-1.5 font-semibold">
              <Zap className="w-3.5 h-3.5" />
              <span>Cryptographic Credit Ledger</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold font-mono text-white">
                {(currentUser?.creditBalance ?? 500).toLocaleString()}
              </span>
              <span className="text-xs text-rose-300 font-mono">Credits Available</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                closeModal();
                openModal('credits');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-700/50 text-rose-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Ledger Vault
            </button>
            <button
              onClick={() => {
                closeModal();
                openModal('plans');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              Upgrade Plan
            </button>
          </div>
        </div>

        {/* Plan Features */}
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-200">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-400" />
              {userProfile.plan} Workspace Vault
            </span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Row-Level Isolated
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-rose-400" />
              <span>Persistent SQLite Database</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-rose-400" />
              <span>Dedicated Reasoning Nodes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-rose-400" />
              <span>Encrypted Session Vault</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-rose-400" />
              <span>Multi-Session Chat History</span>
            </div>
          </div>
        </div>

        {/* Real-time Usage Gauges */}
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            Active Quotas & Usage (Live DB)
          </div>

          <div className="space-y-3">
            {/* Tokens */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-rose-950/40 space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Reasoning Tokens Consumed</span>
                <span className="text-rose-300 font-semibold">
                  {userProfile.quota.tokensUsed.toLocaleString()} / {userProfile.quota.tokensLimit.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden border border-rose-950/40">
                <div
                  className="h-full bg-gradient-to-r from-rose-900 to-rose-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(1, tokenPercent)}%` }}
                />
              </div>
            </div>

            {/* Storage */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-rose-950/40 space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Persistent Chat Storage</span>
                <span className="text-slate-400">
                  {userProfile.quota.storageUsedMb} MB / {userProfile.quota.storageLimitMb / 1024} GB
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden border border-rose-950/40">
                <div
                  className="h-full bg-rose-700/60 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(1, storagePercent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-rose-950/40 flex items-center justify-between">
          <button
            onClick={() => {
              closeModal();
              openModal('settings');
            }}
            className="text-xs text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
          >
            Preferences & Settings →
          </button>

          {showLogoutConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-300 font-mono">Confirm sign out?</span>
              <button
                onClick={handleLogout}
                className="px-2.5 py-1 text-xs font-medium text-rose-200 bg-rose-900/50 hover:bg-rose-900/80 border border-rose-500/40 rounded-lg transition-colors cursor-pointer"
                id="confirm-logout-btn"
              >
                Sign Out
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              id="account-logout-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
