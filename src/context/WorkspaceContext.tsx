import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  WorkspaceMode,
  AIModel,
  ChatMessage,
  Conversation,
  UploadedFile,
  UserProfile,
  WorkspaceSettings,
  ActiveModal,
  SettingsTab,
  ViewSection,
  AuthUser
} from '../types';
import { AI_MODELS, DEFAULT_MODEL_ID } from '../data/models';

interface WorkspaceContextType {
  // Authentication & Session
  isAuthenticated: boolean;
  authLoading: boolean;
  currentUser: AuthUser | null;
  authError: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string, confirm: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string; resetToken?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  updateUserProfile: (displayName: string) => Promise<void>;

  // Navigation & Views
  currentView: ViewSection;
  setCurrentView: (view: ViewSection) => void;
  activeMode: WorkspaceMode;
  setActiveMode: (mode: WorkspaceMode) => void;
  selectedModelId: string;
  setSelectedModelId: (modelId: string) => void;
  selectedModel: AIModel;
  models: AIModel[];
  isBackendConnected: boolean;

  // Conversations & History
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredConversations: Conversation[];
  createNewConversation: (mode?: WorkspaceMode, modelId?: string) => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
  loadConversationMessages: (conversationId: string) => Promise<void>;

  // Active Chat State & Messages
  messages: ChatMessage[];
  sendMessage: (content: string, files?: UploadedFile[]) => void;
  regenerateMessage: (messageId: string) => void;
  deleteMessage: (messageId: string) => void;
  isLoading: boolean;
  isGenerating: boolean;
  stopGeneration: () => void;
  errorState: string | null;
  clearError: () => void;
  streamTick: number;
  simulateLoadingState: (durationMs?: number) => void;
  simulateErrorState: (msg?: string) => void;
  addSampleAssistantMessage: () => void;

  // File Management
  files: UploadedFile[];
  stagedComposerFiles: UploadedFile[];
  stageComposerFile: (file: UploadedFile) => void;
  unstageComposerFile: (fileId: string) => void;
  clearStagedComposerFiles: () => void;
  uploadFiles: (fileList: FileList | File[]) => void;
  removeFile: (fileId: string) => void;
  activePreviewFile: UploadedFile | null;
  setActivePreviewFile: (file: UploadedFile | null) => void;

  // User Profile & Settings
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  settings: WorkspaceSettings;
  updateSettings: (newSettings: Partial<WorkspaceSettings>) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;

  // Modals & Drawers
  activeModal: ActiveModal;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  isMobileSidebarOpen: boolean;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'darkano_auth_token_v4';
const SETTINGS_STORAGE_KEY = 'darkano_ai_settings_v4';

const INITIAL_SETTINGS: WorkspaceSettings = {
  appearance: {
    theme: 'obsidian',
    fontSize: 'standard',
    enableLigatures: true,
    reducedMotion: false
  },
  chat: {
    systemPrompt: 'You are Darkano AI, an advanced high-performance reasoning system built for frontier engineering, deep research, and architectural synthesis.',
    temperature: 0.3,
    topP: 0.95,
    autoScroll: true,
    sendOnEnter: true,
    streamingSimulation: true
  },
  models: {
    defaultModelId: DEFAULT_MODEL_ID,
    fallbackModelId: 'darkano-flash-v2',
    autoFallback: true
  },
  notifications: {
    soundEnabled: false,
    latencyAlerts: true,
    desktopNotifications: false
  },
  privacy: {
    zeroRetention: false,
    anonymizeTelemetry: true,
    localSaveOnly: true
  }
};

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Navigation & UI
  const [currentView, setCurrentView] = useState<ViewSection>('workspace');
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('chat');
  const [models, setModels] = useState<AIModel[]>(AI_MODELS);
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);

  // Modals & UI Drawers
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('chat');
  const [isSidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Generation Control
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [streamTick, setStreamTick] = useState<number>(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Authentication State
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Conversations & Messages (Isolated per User)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<WorkspaceSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_SETTINGS;
  });

  // User Profile
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Darkano User',
    email: '',
    avatarText: 'DU',
    plan: 'Developer',
    quota: {
      tokensUsed: 0,
      tokensLimit: 2000000,
      storageUsedMb: 0,
      storageLimitMb: 10240,
      activeSessions: 1
    }
  });

  // Files
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [stagedComposerFiles, setStagedComposerFiles] = useState<UploadedFile[]>([]);
  const [activePreviewFile, setActivePreviewFile] = useState<UploadedFile | null>(null);

  const clearAuthError = () => setAuthError(null);

  // Helper to attach authorization header
  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // Load user conversations from backend database
  const fetchUserConversations = useCallback(async (authToken: string) => {
    try {
      const res = await fetch('/api/conversations?limit=100', {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.conversations)) {
          const formattedConvs: Conversation[] = data.conversations.map((c: any) => ({
            id: c.id,
            title: c.title,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            mode: c.mode as WorkspaceMode,
            modelId: c.model,
            messages: []
          }));

          setConversations(formattedConvs);
          if (formattedConvs.length > 0) {
            setActiveConversationId(formattedConvs[0].id);
            // Load messages for the active conversation
            loadConversationMessages(formattedConvs[0].id, authToken);
          } else {
            setActiveConversationId(null);
          }
        }
      }
    } catch (err) {
      console.error('[Darkano Client] Failed to fetch user conversations:', err);
    }
  }, []);

  // Load messages for a single conversation
  const loadConversationMessages = async (convId: string, customToken?: string) => {
    const activeTok = customToken || token;
    if (!activeTok) return;

    try {
      const res = await fetch(`/api/conversations/${convId}/messages?limit=200`, {
        headers: {
          Authorization: `Bearer ${activeTok}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          const loadedMsgs: ChatMessage[] = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mode: m.mode as WorkspaceMode,
            modelId: m.model || DEFAULT_MODEL_ID,
            status: m.status as any
          }));

          setConversations(prev =>
            prev.map(c => (c.id === convId ? { ...c, messages: loadedMsgs } : c))
          );
        }
      }
    } catch (err) {
      console.error('[Darkano Client] Failed to load messages:', err);
    }
  };

  // Restore Session on Mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!savedToken) {
        if (isMounted) {
          setAuthLoading(false);
          setCurrentUser(null);
        }
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${savedToken}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.user) {
            setCurrentUser(data.user);
            setToken(savedToken);
            setUserProfile({
              name: data.user.displayName,
              email: data.user.email,
              avatarText: (data.user.displayName || 'DU').slice(0, 2).toUpperCase(),
              plan: data.user.plan || 'Developer',
              quota: data.user.quota || {
                tokensUsed: 0,
                tokensLimit: 2000000,
                storageUsedMb: 0,
                storageLimitMb: 10240,
                activeSessions: 1
              }
            });

            // Fetch conversations for authenticated user
            await fetchUserConversations(savedToken);
          }
        } else {
          // Token expired or invalid
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          if (isMounted) {
            setToken(null);
            setCurrentUser(null);
          }
        }
      } catch (err) {
        console.error('[Darkano Client] Session check error:', err);
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();
  }, [fetchUserConversations]);

  // Sync backend health & models catalog
  useEffect(() => {
    let isMounted = true;

    async function syncBackend() {
      try {
        const healthRes = await fetch('/api/health');
        if (healthRes.ok) {
          if (isMounted) setIsBackendConnected(true);
        } else {
          if (isMounted) setIsBackendConnected(false);
        }

        const modelsRes = await fetch('/api/models');
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          if (isMounted && Array.isArray(data.models) && data.models.length > 0) {
            setModels(data.models);
          }
        }
      } catch (err) {
        if (isMounted) setIsBackendConnected(false);
      }
    }

    syncBackend();
    const interval = setInterval(syncBackend, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Persist settings to local storage
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  // 1. Sign In
  const login = async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setToken(data.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setCurrentUser(data.user);
      setUserProfile({
        name: data.user.displayName,
        email: data.user.email,
        avatarText: (data.user.displayName || 'DU').slice(0, 2).toUpperCase(),
        plan: data.user.plan || 'Developer',
        quota: data.user.quota || {
          tokensUsed: 0,
          tokensLimit: 2000000,
          storageUsedMb: 0,
          storageLimitMb: 10240,
          activeSessions: 1
        }
      });

      await fetchUserConversations(data.token);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign in');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Sign Up
  const register = async (displayName: string, email: string, password: string, confirm: string) => {
    setAuthLoading(true);
    setAuthError(null);

    if (password !== confirm) {
      setAuthLoading(false);
      setAuthError('Passwords do not match');
      throw new Error('Passwords do not match');
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setToken(data.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setCurrentUser(data.user);
      setUserProfile({
        name: data.user.displayName,
        email: data.user.email,
        avatarText: (data.user.displayName || 'DU').slice(0, 2).toUpperCase(),
        plan: data.user.plan || 'Developer',
        quota: {
          tokensUsed: 0,
          tokensLimit: 2000000,
          storageUsedMb: 0,
          storageLimitMb: 10240,
          activeSessions: 1
        }
      });

      setConversations([]);
      setActiveConversationId(null);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to register account');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // 3. Logout
  const logout = async () => {
    if (isGenerating && activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }

    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders()
        });
      }
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setCurrentUser(null);
      setConversations([]);
      setActiveConversationId(null);
      setStagedComposerFiles([]);
      setFiles([]);
      closeModal();
    }
  };

  // 4. Forgot Password
  const forgotPassword = async (email: string) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request reset');
    }
    return data;
  };

  // 5. Reset Password
  const resetPassword = async (token: string, newPassword: string) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }
    return data;
  };

  // 6. Update User Profile
  const updateUserProfile = async (displayName: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ displayName })
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentUser(prev => (prev ? { ...prev, displayName: updated.displayName } : prev));
        setUserProfile(prev => ({
          ...prev,
          name: updated.displayName,
          avatarText: updated.displayName.slice(0, 2).toUpperCase()
        }));
      }
    } catch (err) {
      console.error('[Darkano Client] Failed to update profile:', err);
    }
  };

  // Active Model Lookup
  const selectedModel = models.find(m => m.id === selectedModelId) || models[0] || AI_MODELS[0];

  // Active Conversation Lookup
  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;
  const messages = activeConversation?.messages || [];

  // Filtered Conversations based on Search
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    );
  });

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const toggleMobileSidebar = () => setMobileSidebarOpen(prev => !prev);
  const openModal = (modal: ActiveModal) => setActiveModal(modal);
  const closeModal = () => setActiveModal(null);

  const updateSettings = (newSettings: Partial<WorkspaceSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...newSettings
    }));
  };

  // Create Conversation (Persistent Database backed)
  const createNewConversation = (mode: WorkspaceMode = activeMode, modelId: string = selectedModelId): string => {
    if (isGenerating && activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      setIsGenerating(false);
    }

    const newId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newConv: Conversation = {
      id: newId,
      title: 'New Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode,
      modelId,
      messages: []
    };

    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newId);
    setActiveMode(mode);
    setSelectedModelId(modelId);
    setCurrentView('workspace');
    setErrorState(null);

    // Call backend API to persist
    if (token) {
      fetch('/api/conversations', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: newId,
          title: 'New Session',
          model: modelId,
          mode
        })
      }).catch(err => console.warn('[Darkano Client] Background conv create error:', err));
    }

    return newId;
  };

  // Select Conversation
  const selectConversation = (id: string) => {
    if (isGenerating && activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      setIsGenerating(false);
    }

    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setActiveConversationId(id);
      setActiveMode(conv.mode);
      setSelectedModelId(conv.modelId);
      setCurrentView('workspace');
      setMobileSidebarOpen(false);
      setErrorState(null);

      // Fetch messages if empty
      if (conv.messages.length === 0) {
        loadConversationMessages(id);
      }
    }
  };

  // Rename Conversation (Database backed)
  const renameConversation = (id: string, newTitle: string) => {
    const clean = newTitle.trim();
    if (!clean) return;

    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, title: clean, updatedAt: new Date().toISOString() } : c))
    );

    if (token) {
      fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: clean })
      }).catch(err => console.warn('[Darkano Client] Rename error:', err));
    }
  };

  // Delete Conversation (Database backed)
  const deleteConversation = (id: string) => {
    if (activeConversationId === id && isGenerating && activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      setIsGenerating(false);
    }

    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        setActiveConversationId(remaining[0]?.id || null);
      }
      return remaining;
    });

    if (token) {
      fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).catch(err => console.warn('[Darkano Client] Delete error:', err));
    }
  };

  const clearAllConversations = () => {
    if (isGenerating && activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      setIsGenerating(false);
    }
    // Delete each
    conversations.forEach(c => {
      if (token) {
        fetch(`/api/conversations/${c.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        }).catch(() => {});
      }
    });
    setConversations([]);
    setActiveConversationId(null);
  };

  // Stop Generation
  const stopGeneration = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsGenerating(false);
    setIsLoading(false);

    if (activeConversationId) {
      setConversations(prev =>
        prev.map(c => {
          if (c.id === activeConversationId) {
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.role === 'assistant' && (m.status === 'loading' || m.status === 'streaming')) {
                  return { ...m, status: 'stopped' };
                }
                return m;
              })
            };
          }
          return c;
        })
      );
    }
  };

  // Send Message with Real Backend Streaming & Database Storage
  const sendMessage = async (content: string, filesToAttach: UploadedFile[] = stagedComposerFiles) => {
    const trimmed = content.trim();
    if (!trimmed && filesToAttach.length === 0) return;

    if (trimmed.length > 32000) {
      setErrorState('Message exceeds the maximum limit of 32,000 characters.');
      return;
    }

    if (selectedModel.isAvailable === false) {
      setErrorState(`Model '${selectedModel.name}' (${selectedModel.provider}) is not configured on this server. Please select an available model.`);
      return;
    }

    clearError();

    let targetConvId = activeConversationId;
    if (!targetConvId || !conversations.some(c => c.id === targetConvId)) {
      targetConvId = createNewConversation(activeMode, selectedModelId);
    }

    const currentConv = conversations.find(c => c.id === targetConvId);
    const existingMessages = currentConv?.messages || [];

    const userMessage: ChatMessage = {
      id: `msg_usr_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: activeMode,
      modelId: selectedModelId,
      attachedFiles: filesToAttach.length > 0 ? [...filesToAttach] : undefined,
      status: 'ready'
    };

    const assistantMessageId = `msg_ai_${Date.now() + 1}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: activeMode,
      modelId: selectedModelId,
      status: 'loading'
    };

    const isFirst = existingMessages.length === 0;
    const autoTitle = isFirst
      ? trimmed.slice(0, 40) + (trimmed.length > 40 ? '...' : '')
      : (currentConv?.title || 'New Session');

    setConversations(prev =>
      prev.map(c => {
        if (c.id === targetConvId) {
          return {
            ...c,
            title: autoTitle,
            updatedAt: new Date().toISOString(),
            messages: [...c.messages, userMessage, initialAssistantMessage]
          };
        }
        return c;
      })
    );

    setStagedComposerFiles([]);
    setIsGenerating(true);
    setIsLoading(true);

    const historyPayload = existingMessages
      .filter(m => m.status === 'ready' || m.status === 'stopped')
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          conversationId: targetConvId,
          message: trimmed,
          model: selectedModelId,
          mode: activeMode,
          history: historyPayload,
          options: {
            temperature: settings.chat.temperature,
            topP: settings.chat.topP,
            systemPrompt: settings.chat.systemPrompt
          }
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body stream reader is not available');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';

      setIsLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;

          let eventType = 'chunk';
          let dataStr = '';

          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (eventType === 'chunk' && typeof parsed.text === 'string') {
              accumulatedText += parsed.text;
              setStreamTick(t => t + 1);

              setConversations(prev =>
                prev.map(c => {
                  if (c.id === targetConvId) {
                    return {
                      ...c,
                      messages: c.messages.map(m => {
                        if (m.id === assistantMessageId) {
                          return {
                            ...m,
                            content: accumulatedText,
                            status: 'streaming'
                          };
                        }
                        return m;
                      })
                    };
                  }
                  return c;
                })
              );
            } else if (eventType === 'usage' && (parsed.totalTokens || parsed.completionTokens)) {
              const addedTokens = parsed.totalTokens || ((parsed.promptTokens || 0) + (parsed.completionTokens || 0));
              setUserProfile(prev => ({
                ...prev,
                quota: {
                  ...prev.quota,
                  tokensUsed: prev.quota.tokensUsed + addedTokens
                }
              }));

              setConversations(prev =>
                prev.map(c => {
                  if (c.id === targetConvId) {
                    return {
                      ...c,
                      messages: c.messages.map(m => {
                        if (m.id === assistantMessageId) {
                          return {
                            ...m,
                            metrics: {
                              tokens: addedTokens,
                              latencyMs: parsed.latencyMs || 600,
                              computeNode: parsed.provider || selectedModel.provider
                            }
                          };
                        }
                        return m;
                      })
                    };
                  }
                  return c;
                })
              );
            } else if (eventType === 'error') {
              throw new Error(parsed.error || 'Stream encountered error');
            } else if (eventType === 'done') {
              setConversations(prev =>
                prev.map(c => {
                  if (c.id === targetConvId) {
                    return {
                      ...c,
                      messages: c.messages.map(m => {
                        if (m.id === assistantMessageId) {
                          return {
                            ...m,
                            status: 'ready'
                          };
                        }
                        return m;
                      })
                    };
                  }
                  return c;
                })
              );
            }
          } catch (e: any) {
            if (e.message !== 'Unexpected end of JSON input') {
              // Non-fatal chunk parse
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Handled by stopGeneration
      } else {
        console.error('[Darkano Client Streaming Error]:', err);
        setErrorState(err?.message || 'Streaming communication was interrupted.');
        setConversations(prev =>
          prev.map(c => {
            if (c.id === targetConvId) {
              return {
                ...c,
                messages: c.messages.map(m => {
                  if (m.id === assistantMessageId) {
                    return {
                      ...m,
                      status: 'error',
                      content: m.content || 'An error occurred while streaming response from reasoning node.'
                    };
                  }
                  return m;
                })
              };
            }
            return c;
          })
        );
      }
    } finally {
      setIsGenerating(false);
      setIsLoading(false);
      activeAbortControllerRef.current = null;
    }
  };

  const regenerateMessage = (messageId: string) => {
    if (!activeConversation) return;
    const msgIndex = activeConversation.messages.findIndex(m => m.id === messageId);
    if (msgIndex <= 0) return;

    const previousUserMessage = activeConversation.messages[msgIndex - 1];
    if (previousUserMessage && previousUserMessage.role === 'user') {
      sendMessage(previousUserMessage.content, previousUserMessage.attachedFiles);
    }
  };

  const deleteMessage = (messageId: string) => {
    if (!activeConversationId) return;
    setConversations(prev =>
      prev.map(c => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            messages: c.messages.filter(m => m.id !== messageId)
          };
        }
        return c;
      })
    );
  };

  const clearError = () => setErrorState(null);

  const simulateLoadingState = (durationMs = 2000) => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), durationMs);
  };

  const simulateErrorState = (msg = 'Reasoning engine simulated exception test.') => {
    setErrorState(msg);
  };

  const addSampleAssistantMessage = () => {
    if (!activeConversationId) return;
    const sampleMsg: ChatMessage = {
      id: `msg_sample_${Date.now()}`,
      role: 'assistant',
      content: 'Sample response verified from reasoning pipeline.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: activeMode,
      modelId: selectedModelId,
      status: 'ready'
    };
    setConversations(prev =>
      prev.map(c => {
        if (c.id === activeConversationId) {
          return { ...c, messages: [...c.messages, sampleMsg] };
        }
        return c;
      })
    );
  };

  // Composer File Staging & Uploads
  const stageComposerFile = (file: UploadedFile) => {
    setStagedComposerFiles(prev => [...prev, file]);
  };

  const unstageComposerFile = (fileId: string) => {
    setStagedComposerFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearStagedComposerFiles = () => {
    setStagedComposerFiles([]);
  };

  const uploadFiles = (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    const newFiles: UploadedFile[] = filesArray.map((file, idx) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      return {
        id: `file_${Date.now()}_${idx}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        extension,
        progress: 100,
        status: 'ready',
        uploadTimestamp: Date.now(),
        previewContent: `File ${file.name} ready in memory context.`
      };
    });

    setFiles(prev => [...newFiles, ...prev]);
    newFiles.forEach(f => stageComposerFile(f));
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    unstageComposerFile(fileId);
    if (activePreviewFile?.id === fileId) {
      setActivePreviewFile(null);
    }
  };

  const value: WorkspaceContextType = {
    // Auth & Session
    isAuthenticated: !!currentUser && !!token,
    authLoading,
    currentUser,
    authError,
    clearAuthError,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    updateUserProfile,

    // Navigation
    currentView,
    setCurrentView,
    activeMode,
    setActiveMode,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    models,
    isBackendConnected,

    // Conversations
    conversations,
    activeConversationId,
    activeConversation,
    searchQuery,
    setSearchQuery,
    filteredConversations,
    createNewConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    clearAllConversations,
    loadConversationMessages,

    // Active Chat & Messages
    messages,
    sendMessage,
    regenerateMessage,
    deleteMessage,
    isLoading,
    isGenerating,
    stopGeneration,
    errorState,
    clearError,
    streamTick,
    simulateLoadingState,
    simulateErrorState,
    addSampleAssistantMessage,

    // File Management
    files,
    stagedComposerFiles,
    stageComposerFile,
    unstageComposerFile,
    clearStagedComposerFiles,
    uploadFiles,
    removeFile,
    activePreviewFile,
    setActivePreviewFile,

    // User Profile & Settings
    userProfile,
    setUserProfile,
    settings,
    updateSettings,
    settingsTab,
    setSettingsTab,

    // Modals & Drawers
    activeModal,
    openModal,
    closeModal,
    isSidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    isMobileSidebarOpen,
    toggleMobileSidebar,
    setMobileSidebarOpen
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
