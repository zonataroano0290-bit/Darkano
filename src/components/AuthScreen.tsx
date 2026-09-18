import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  EyeOff,
  ExternalLink
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { AuthMode } from '../types';
import {
  loadGoogleSdk,
  isGoogleSdkLoaded,
  initializeGoogleIdClient,
  initOAuth2TokenClient,
  requestGoogleAccessToken,
  renderGoogleSignInButton,
  promptGoogleOneTap
} from '../services/googleAuthLoader';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (displayName: string, email: string, password: string, confirm: string) => Promise<void>;
  onGoogleLogin: (credential: string) => Promise<any>;
  getGoogleAuthConfig: () => Promise<{ configured: boolean; clientId: string }>;
  onForgotPassword: (email: string) => Promise<{ success: boolean; message: string; resetToken?: string }>;
  onResetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  authError: string | null;
  clearAuthError: () => void;
  isLoading: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onRegister,
  onGoogleLogin,
  getGoogleAuthConfig,
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

  // Google Authentication state
  const [googleConfig, setGoogleConfig] = useState<{ configured: boolean; clientId: string }>({
    configured: false,
    clientId: ''
  });
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleRendered, setIsGoogleRendered] = useState(false);
  const isMountedRef = useRef(true);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  // Initialize and load the Google Identity Services SDK safely
  const initGoogleAuth = useCallback(async (forceReload = false) => {
    try {
      setSdkStatus('loading');

      // 1. Fetch server config for Google OAuth
      const config = await getGoogleAuthConfig();
      if (!isMountedRef.current) return;
      setGoogleConfig(config);

      // 2. Load GIS SDK from official endpoint https://accounts.google.com/gsi/client
      await loadGoogleSdk(forceReload);
      if (!isMountedRef.current) return;

      setSdkStatus('ready');

      // 3. Initialize Google Identity Client & pre-initialize OAuth2 Token Client
      if (config.configured && config.clientId && isGoogleSdkLoaded()) {
        initializeGoogleIdClient(
          config.clientId,
          async (credential) => {
            if (!isMountedRef.current) return;
            setIsGoogleLoading(true);
            setClientError(null);
            clearAuthError();
            try {
              await onGoogleLogin(credential);
            } catch (err: any) {
              if (isMountedRef.current) {
                setClientError(err?.message || 'Google authentication failed');
              }
            } finally {
              if (isMountedRef.current) {
                setIsGoogleLoading(false);
              }
            }
          },
          (err) => {
            console.warn('[Darkano Auth] Google ID Client warning:', err);
          }
        );

        initOAuth2TokenClient(
          config.clientId,
          async (accessToken) => {
            if (!isMountedRef.current) return;
            setIsGoogleLoading(true);
            setClientError(null);
            clearAuthError();
            try {
              await onGoogleLogin(accessToken);
            } catch (err: any) {
              if (isMountedRef.current) {
                setClientError(err?.message || 'Google authentication failed');
              }
            } finally {
              if (isMountedRef.current) {
                setIsGoogleLoading(false);
              }
            }
          },
          (err: any) => {
            if (isMountedRef.current) {
              setIsGoogleLoading(false);
              setClientError(err?.message || 'Google authentication failed');
            }
          },
          () => {
            if (isMountedRef.current) {
              setIsGoogleLoading(false);
            }
          }
        );

        // Render official button into container ref if present
        if (googleBtnContainerRef.current) {
          const rendered = renderGoogleSignInButton(googleBtnContainerRef.current, {
            theme: 'filled_black',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 340
          });
          setIsGoogleRendered(rendered);
        }
      }
    } catch (err: any) {
      console.error('[Darkano Auth] Failed to initialize Google Auth:', err);
      if (isMountedRef.current) {
        setSdkStatus('error');
      }
    }
  }, [getGoogleAuthConfig, onGoogleLogin, clearAuthError]);

  useEffect(() => {
    isMountedRef.current = true;
    initGoogleAuth();

    return () => {
      isMountedRef.current = false;
    };
  }, [initGoogleAuth]);

  // Attempt rendering official button whenever SDK becomes ready and container is mounted
  useEffect(() => {
    if (
      sdkStatus === 'ready' &&
      googleConfig.configured &&
      googleConfig.clientId &&
      googleBtnContainerRef.current &&
      !isGoogleRendered
    ) {
      const rendered = renderGoogleSignInButton(googleBtnContainerRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 340
      });
      setIsGoogleRendered(rendered);
    }
  }, [sdkStatus, googleConfig, isGoogleRendered]);

  // Handler for retry button when SDK fails to load
  const handleRetryLoadSdk = async () => {
    setClientError(null);
    clearAuthError();
    await initGoogleAuth(true);
  };

  const handleGoogleSignInClick = () => {
    setClientError(null);
    clearAuthError();

    if (!googleConfig.configured || !googleConfig.clientId) {
      setClientError(
        'Google authentication is not configured yet. Please configure GOOGLE_CLIENT_ID in your environment variables (.env file or project settings).'
      );
      return;
    }

    // If SDK is still loading, wait and trigger prompt
    if (sdkStatus === 'loading') {
      setIsGoogleLoading(true);
      loadGoogleSdk()
        .then(() => {
          if (isMountedRef.current) {
            setSdkStatus('ready');
            setIsGoogleLoading(false);
            promptGoogleOneTap();
          }
        })
        .catch(() => {
          if (isMountedRef.current) {
            setIsGoogleLoading(false);
            setSdkStatus('error');
            setClientError(
              'Google Identity Services SDK could not be loaded. Please check your internet connection or ad blocker and try again.'
            );
          }
        });
      return;
    }

    // If SDK previously failed, retry loading
    if (sdkStatus === 'error' || !isGoogleSdkLoaded()) {
      setIsGoogleLoading(true);
      loadGoogleSdk(true)
        .then(() => {
          if (isMountedRef.current) {
            setSdkStatus('ready');
            setIsGoogleLoading(false);
            promptGoogleOneTap();
          }
        })
        .catch(() => {
          if (isMountedRef.current) {
            setIsGoogleLoading(false);
            setSdkStatus('error');
            setClientError(
              'Google Identity Services SDK could not be loaded. Please verify your internet connection or ad blocker and try again.'
            );
          }
        });
      return;
    }

    // SDK is confirmed ready; trigger OAuth2 Token Client immediately and synchronously
    setIsGoogleLoading(true);

    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      requestGoogleAccessToken(
        googleConfig.clientId,
        async (accessToken) => {
          try {
            await onGoogleLogin(accessToken);
          } catch (err: any) {
            if (isMountedRef.current) {
              setClientError(err?.message || 'Google authentication failed');
            }
          } finally {
            if (isMountedRef.current) {
              setIsGoogleLoading(false);
            }
          }
        },
        (err) => {
          if (isMountedRef.current) {
            setIsGoogleLoading(false);
            setClientError(err.message || 'Google authentication failed');
          }
        },
        () => {
          if (isMountedRef.current) {
            setIsGoogleLoading(false);
          }
        }
      );
      return;
    }

    // Fallback: Prompt One-Tap
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      try {
        promptGoogleOneTap((notification: any) => {
          if (notification?.isNotDisplayed?.()) {
            if (isMountedRef.current) {
              setIsGoogleLoading(false);
              setClientError(
                'Google Sign-In prompt was blocked by browser security settings. Please allow popups or open in a new tab.'
              );
            }
          } else if (notification?.isSkippedMoment?.() || notification?.isDismissedMoment?.()) {
            if (isMountedRef.current) {
              setIsGoogleLoading(false);
            }
          }
        });
      } catch (promptErr: any) {
        if (isMountedRef.current) {
          setIsGoogleLoading(false);
          setClientError(promptErr?.message || 'Failed to trigger Google sign-in');
        }
      }
      return;
    }

    setIsGoogleLoading(false);
    setClientError('Google Identity Services SDK is not ready yet. Please retry.');
  };

  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    }
  };

  const handleTryOneTap = () => {
    setClientError(null);
    clearAuthError();
    promptGoogleOneTap();
  };

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

          {/* Social Authentication: CONTINUE WITH GOOGLE */}
          {mode !== 'forgot' && (
            <div className="space-y-3.5 pt-0.5">
              <div className="w-full flex flex-col items-center justify-center">
                {/* Official Google Button (FedCM & native click support without popup blocking) */}
                <div
                  ref={googleBtnContainerRef}
                  id="google-official-btn-container"
                  className={`w-full flex items-center justify-center min-h-[44px] transition-all ${
                    sdkStatus === 'ready' && isGoogleRendered ? 'block' : 'hidden'
                  }`}
                />

                {/* Cyber Button (shown during loading, fallback, or when official button isn't mounted) */}
                {(!isGoogleRendered || sdkStatus !== 'ready') && (
                  <button
                    type="button"
                    onClick={handleGoogleSignInClick}
                    disabled={isLoading || isGoogleLoading}
                    className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-[#14060c] hover:bg-[#1f0a14] border border-rose-950/80 hover:border-rose-700/60 text-white font-semibold text-xs tracking-wider transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)] disabled:opacity-50 cursor-pointer"
                    id="continue-with-google-btn"
                  >
                    {isGoogleLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-rose-400 animate-spin" />
                        <span>Connecting to Google...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                          />
                        </svg>
                        <span>CONTINUE WITH GOOGLE</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="relative flex items-center justify-center py-0.5">
                <div className="border-t border-rose-950/60 w-full" />
                <span className="bg-[#0c0307] px-3 text-[10px] uppercase font-mono tracking-wider text-slate-400 shrink-0">
                  Or continue with email
                </span>
                <div className="border-t border-rose-950/60 w-full" />
              </div>
            </div>
          )}

          {/* Error Message Box */}
          {activeError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug space-y-2">
                <div>{activeError}</div>
                {(activeError.toLowerCase().includes('popup') || activeError.toLowerCase().includes('blocked')) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleOpenInNewTab}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/70 hover:bg-rose-800/90 border border-rose-700/60 text-white text-[11px] font-medium transition-colors cursor-pointer shadow-sm"
                      id="open-in-new-tab-btn"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-rose-200" />
                      <span>Open in New Tab to Sign In</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTryOneTap}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-black/80 border border-rose-900/50 text-rose-300 text-[11px] font-medium transition-colors cursor-pointer"
                      id="try-one-tap-btn"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
                      <span>Try One-Tap Prompt</span>
                    </button>
                  </div>
                )}
                {(sdkStatus === 'error' || activeError.includes('Google Identity Services')) && (
                  <button
                    type="button"
                    onClick={handleRetryLoadSdk}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-rose-300 hover:text-rose-100 underline decoration-rose-500/50 underline-offset-2 transition-colors cursor-pointer"
                    id="retry-load-google-sdk-btn"
                  >
                    <RefreshCw className="w-3 h-3 text-rose-400" />
                    <span>Retry loading Google Sign-In</span>
                  </button>
                )}
              </div>
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
