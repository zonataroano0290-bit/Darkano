import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  Shield,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { AuthMode } from '../types';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (displayName: string, email: string, password: string, confirm: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<{ success: boolean; message: string; resetToken?: string }>;
  onResetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  authError: string | null;
  clearAuthError: () => void;
  isLoading: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onRegister,
  onForgotPassword,
  onResetPassword,
  authError,
  clearAuthError,
  isLoading
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');

  // Sign In / Sign Up fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot / Reset Password state
  const [resetStep, setResetStep] = useState<'request' | 'submit'>('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    clearAuthError();
    setClientError(null);
    setResetSuccessMessage(null);
    setResetStep('request');
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    clearAuthError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setClientError('Email address is required');
      return;
    }
    if (!password) {
      setClientError('Password is required');
      return;
    }

    try {
      await onLogin(trimmedEmail, password);
    } catch (err: any) {
      // Handled by context
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    clearAuthError();

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setClientError('Display name must be at least 2 characters');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setClientError('Please provide a valid email address');
      return;
    }

    if (!password || password.length < 8) {
      setClientError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setClientError('Passwords do not match');
      return;
    }

    try {
      await onRegister(trimmedName, trimmedEmail, password, confirmPassword);
    } catch (err: any) {
      // Handled by context
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setResetSuccessMessage(null);

    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) {
      setClientError('Please provide your email address');
      return;
    }

    try {
      const res = await onForgotPassword(trimmedEmail);
      if (res.success) {
        setResetSuccessMessage(res.message);
        if (res.resetToken) {
          setResetToken(res.resetToken);
        }
        setResetStep('submit');
      }
    } catch (err: any) {
      setClientError(err?.message || 'Failed to request password reset');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);

    if (!resetToken.trim()) {
      setClientError('Reset token is required');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setClientError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setClientError('Passwords do not match');
      return;
    }

    try {
      const res = await onResetPassword(resetToken.trim(), newPassword);
      if (res.success) {
        setResetSuccessMessage('Password reset successfully. You may now sign in.');
        setTimeout(() => {
          switchMode('signin');
          setEmail(resetEmail);
          setPassword(newPassword);
        }, 1500);
      }
    } catch (err: any) {
      setClientError(err?.message || 'Failed to reset password');
    }
  };

  const activeError = clientError || authError;

  return (
    <div className="min-h-screen w-full bg-[#060204] text-slate-100 flex flex-col justify-between items-center relative overflow-hidden p-4 sm:p-6 select-none font-sans">
      {/* Dark Red Atmospheric Lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-rose-950/20 via-rose-950/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-gradient-to-t from-rose-950/15 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 py-2">
        <BrandLogo size="md" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/30 border border-rose-900/30 text-[11px] font-mono text-rose-300/80">
          <Shield className="w-3 h-3 text-rose-400" />
          <span>Multi-User Isolated Vault</span>
        </div>
      </header>

      {/* Centered Auth Card */}
      <main className="w-full max-w-md my-auto z-10 py-6">
        <div className="bg-[#0c0307]/90 border border-rose-950/60 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(225,29,72,0.06)] backdrop-blur-xl relative space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {mode === 'signin' && 'Welcome to Darkano AI'}
              {mode === 'signup' && 'Create Darkano Workspace'}
              {mode === 'forgot' && 'Reset Account Password'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              {mode === 'signin' && 'Sign in to access your persistent conversations, custom reasoning pipelines, and isolated vault.'}
              {mode === 'signup' && 'Register your verified profile to start persistent multi-session intelligence.'}
              {mode === 'forgot' && 'Recover access to your encrypted Darkano account and persistent session data.'}
            </p>
          </div>

          {/* Mode Switcher Tabs (Sign In vs Sign Up) */}
          {mode !== 'forgot' && (
            <div className="grid grid-cols-2 p-1 rounded-xl bg-black/50 border border-rose-950/50 text-xs font-medium">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`py-2 rounded-lg transition-all text-center cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-rose-950/60 text-white font-semibold border border-rose-700/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                id="auth-tab-signin"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`py-2 rounded-lg transition-all text-center cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-rose-950/60 text-white font-semibold border border-rose-700/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                id="auth-tab-signup"
              >
                Create Account
              </button>
            </div>
          )}

          {/* Error Message Box */}
          {activeError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">{activeError}</div>
            </div>
          )}

          {/* Success Message Box */}
          {resetSuccessMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-xs text-emerald-200 flex items-start gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">{resetSuccessMessage}</div>
            </div>
          )}

          {/* 1. SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="signin-email">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value);
                      if (activeError) clearAuthError();
                    }}
                    placeholder="architect@domain.com"
                    autoComplete="email"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300" htmlFor="signin-password">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signin-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      if (activeError) clearAuthError();
                    }}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full pl-9 pr-10 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-900 via-rose-800 to-rose-700 hover:from-rose-800 hover:to-rose-600 text-white font-semibold text-xs tracking-wide transition-all shadow-[0_0_20px_rgba(225,29,72,0.2)] disabled:opacity-50 cursor-pointer"
                id="auth-submit-signin-btn"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Darkano AI</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* 2. SIGN UP FORM */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="signup-name">
                  Full Display Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-name"
                    type="text"
                    value={displayName}
                    onChange={e => {
                      setDisplayName(e.target.value);
                      if (activeError) clearAuthError();
                    }}
                    placeholder="Chiray Shaw"
                    autoComplete="name"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="signup-email">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value);
                      if (activeError) clearAuthError();
                    }}
                    placeholder="architect@domain.com"
                    autoComplete="email"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="signup-password">
                  Password <span className="text-[10px] text-slate-400 font-normal">(min 8 characters)</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      if (activeError) clearAuthError();
                    }}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    required
                    className="w-full pl-9 pr-10 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="signup-confirm">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => {
                      setConfirmPassword(e.target.value);
                      if (activeError) clearAuthError();
                    }}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 mt-2 rounded-xl bg-gradient-to-r from-rose-900 via-rose-800 to-rose-700 hover:from-rose-800 hover:to-rose-600 text-white font-semibold text-xs tracking-wide transition-all shadow-[0_0_20px_rgba(225,29,72,0.2)] disabled:opacity-50 cursor-pointer"
                id="auth-submit-signup-btn"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Workspace Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account & Enter</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* 3. FORGOT / RESET PASSWORD FORM */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              {resetStep === 'request' ? (
                <form onSubmit={handleForgotRequest} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="forgot-email">
                      Account Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="architect@domain.com"
                        required
                        className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500/60"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-900 to-rose-700 hover:from-rose-800 hover:to-rose-600 text-white font-semibold text-xs transition-all cursor-pointer"
                  >
                    Generate Reset Authorization Code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="reset-token">
                      Reset Authorization Token
                    </label>
                    <input
                      id="reset-token"
                      type="text"
                      value={resetToken}
                      onChange={e => setResetToken(e.target.value)}
                      placeholder="Paste reset token here"
                      required
                      className="w-full px-3.5 py-2 bg-black/40 border border-rose-950/60 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-rose-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="new-password">
                      New Password (min 8 chars)
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full px-3.5 py-2 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="confirm-new-password">
                      Confirm New Password
                    </label>
                    <input
                      id="confirm-new-password"
                      type="password"
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full px-3.5 py-2 bg-black/40 border border-rose-950/60 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500/60"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-900 to-rose-700 hover:from-rose-800 hover:to-rose-600 text-white font-semibold text-xs transition-all cursor-pointer"
                  >
                    Save New Password
                  </button>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  ← Return to Sign In
                </button>
              </div>
            </div>
          )}

          {/* Privacy & Zero-Retention Notice */}
          <div className="pt-4 border-t border-rose-950/40 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-mono">
              <Shield className="w-3 h-3 text-rose-400" />
              Row-Level Encrypted
            </span>
            <span className="font-mono">Darkano Core v1.4.0</span>
          </div>
        </div>
      </main>

      {/* Footer Notice */}
      <footer className="w-full max-w-5xl flex items-center justify-center text-[11px] text-slate-400 font-mono py-2 z-10">
        <span>Darkano AI • Built with Persistent Reasoning Engine</span>
      </footer>
    </div>
  );
};
