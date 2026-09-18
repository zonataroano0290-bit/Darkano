import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { providerRegistry } from './server/providers/registry.js';
import { validateAndPrepareChatRequest } from './server/contextManager.js';
import { SERVER_CONFIG } from './server/config.js';
import { AuthService } from './server/db/authService.js';
import { ConversationService } from './server/db/conversationService.js';
import { requireAuth, extractToken } from './server/middleware/authMiddleware.js';

async function startServer() {
  const app = express();
  const PORT = SERVER_CONFIG.port || 3000;

  // JSON Body Parser with reasonable limit
  app.use(express.json({ limit: '2mb' }));

  // ==========================================
  // 1. System Health & Models Catalog
  // ==========================================
  app.get('/api/health', (req: Request, res: Response) => {
    const health = providerRegistry.getHealth();
    res.status(200).json({
      name: 'Darkano AI API Service',
      version: '1.4.0',
      uptime: process.uptime(),
      authSystem: 'SQLite Scrypt Sessions v2',
      ...health
    });
  });

  app.get('/api/models', (req: Request, res: Response) => {
    try {
      const models = providerRegistry.getAllModels();
      res.status(200).json({
        models,
        defaultModelId: 'darkano-ultra-v2'
      });
    } catch (err: any) {
      console.error('[Darkano API] Failed to retrieve models:', err?.message);
      res.status(500).json({ error: 'Failed to load model catalog' });
    }
  });

  // ==========================================
  // 2. Authentication Endpoints
  // ==========================================
  app.post('/api/auth/register', (req: Request, res: Response): void => {
    try {
      const { email, password, displayName } = req.body || {};
      const result = AuthService.register({ email, password, displayName });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Registration failed', code: 'REGISTRATION_ERROR' });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response): void => {
    try {
      const { email, password } = req.body || {};
      const result = AuthService.login({ email, password });
      res.status(200).json(result);
    } catch (err: any) {
      res.status(401).json({ error: err?.message || 'Invalid email or password', code: 'AUTH_FAILED' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response): void => {
    const token = extractToken(req);
    if (token) {
      AuthService.invalidateSession(token);
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  });

  app.get('/api/auth/me', requireAuth, (req: Request, res: Response): void => {
    const profile = AuthService.getProfile(req.user!.userId);
    if (!profile) {
      res.status(404).json({ error: 'User profile not found', code: 'USER_NOT_FOUND' });
      return;
    }
    res.status(200).json({ user: profile });
  });

  app.post('/api/auth/forgot-password', (req: Request, res: Response): void => {
    try {
      const { email } = req.body || {};
      const result = AuthService.requestPasswordReset(email || '');
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Request failed', code: 'RESET_REQUEST_ERROR' });
    }
  });

  app.post('/api/auth/reset-password', (req: Request, res: Response): void => {
    try {
      const { token, newPassword } = req.body || {};
      const result = AuthService.resetPassword(token, newPassword);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Password reset failed', code: 'RESET_FAILED' });
    }
  });

  // ==========================================
  // 3. User Profile & Account Settings
  // ==========================================
  app.get('/api/user/profile', requireAuth, (req: Request, res: Response): void => {
    const profile = AuthService.getProfile(req.user!.userId);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.status(200).json(profile);
  });

  app.patch('/api/user/profile', requireAuth, (req: Request, res: Response): void => {
    try {
      const { displayName, avatarUrl } = req.body || {};
      const updated = AuthService.updateProfile(req.user!.userId, { displayName, avatarUrl });
      res.status(200).json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to update profile' });
    }
  });

  // ==========================================
  // 4. Persistent Conversations & Chat History
  // ==========================================
  app.get('/api/conversations', requireAuth, (req: Request, res: Response): void => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = (req.query.search as string) || undefined;

      const result = ConversationService.getUserConversations(req.user!.userId, { limit, offset, search });
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Darkano API] Failed to fetch conversations:', err?.message);
      res.status(500).json({ error: 'Failed to retrieve conversation history' });
    }
  });

  app.post('/api/conversations', requireAuth, (req: Request, res: Response): void => {
    try {
      const { id, title, model, mode } = req.body || {};
      const conv = ConversationService.createConversation(req.user!.userId, {
        id,
        title,
        model: model || 'darkano-ultra-v2',
        mode: mode || 'chat'
      });
      res.status(201).json(conv);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to create conversation' });
    }
  });

  app.get('/api/conversations/:id', requireAuth, (req: Request, res: Response): void => {
    const conv = ConversationService.getConversation(req.user!.userId, req.params.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found or access denied', code: 'CONVERSATION_NOT_FOUND' });
      return;
    }
    res.status(200).json(conv);
  });

  app.patch('/api/conversations/:id', requireAuth, (req: Request, res: Response): void => {
    try {
      const { title } = req.body || {};
      const updated = ConversationService.renameConversation(req.user!.userId, req.params.id, title);
      res.status(200).json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to rename conversation' });
    }
  });

  app.delete('/api/conversations/:id', requireAuth, (req: Request, res: Response): void => {
    try {
      ConversationService.deleteConversation(req.user!.userId, req.params.id);
      res.status(200).json({ success: true, message: 'Conversation deleted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete conversation' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req: Request, res: Response): void => {
    try {
      const limit = parseInt(req.query.limit as string) || 200;
      const offset = parseInt(req.query.offset as string) || 0;
      const messages = ConversationService.getConversationMessages(req.user!.userId, req.params.id, { limit, offset });
      res.status(200).json({ messages });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Failed to load conversation messages' });
    }
  });

  // ==========================================
  // 5. Streaming Chat Endpoint (Authenticated)
  // ==========================================
  app.post('/api/chat/stream', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const validation = validateAndPrepareChatRequest(req.body);

    if (!validation.valid || !validation.sanitizedPayload) {
      res.status(400).json({
        error: validation.error || 'Invalid request payload',
        code: validation.code || 'VALIDATION_ERROR'
      });
      return;
    }

    const payload = validation.sanitizedPayload;
    const userId = req.user!.userId;
    const provider = providerRegistry.getProviderForModel(payload.model);

    if (!provider) {
      res.status(404).json({
        error: `No provider registered for model '${payload.model}'.`,
        code: 'PROVIDER_NOT_FOUND'
      });
      return;
    }

    // 1. Ensure conversation exists and belongs to this user
    let conv = ConversationService.getConversation(userId, payload.conversationId);
    if (!conv) {
      const firstMessage = payload.message || 'New Session';
      const title = firstMessage.slice(0, 40) + (firstMessage.length > 40 ? '...' : '');
      conv = ConversationService.createConversation(userId, {
        id: payload.conversationId,
        title,
        model: payload.model,
        mode: payload.mode
      });
    }

    // 2. Save user message to database
    if (payload.message) {
      ConversationService.saveMessage(userId, {
        conversationId: payload.conversationId,
        role: 'user',
        content: payload.message,
        model: payload.model,
        mode: payload.mode,
        status: 'ready'
      });
    }

    // 3. Create placeholder assistant message in DB
    const assistantMessageId = `msg_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    ConversationService.saveMessage(userId, {
      id: assistantMessageId,
      conversationId: payload.conversationId,
      role: 'assistant',
      content: '',
      model: payload.model,
      mode: payload.mode,
      status: 'streaming'
    });

    // Configure Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abortController = new AbortController();
    let accumulatedText = '';
    let totalOutputTokens = 0;
    let totalInputTokens = 0;
    let streamCompleted = false;

    // Client disconnection / abort cleanup
    res.on('close', () => {
      if (!streamCompleted) {
        abortController.abort();
        // Save partial response with 'stopped' status
        ConversationService.updateMessage(userId, assistantMessageId, {
          content: accumulatedText,
          status: 'stopped'
        });
        if (accumulatedText.length > 0) {
          ConversationService.recordUsage(userId, {
            conversationId: payload.conversationId,
            model: payload.model,
            provider: provider.id,
            inputTokens: totalInputTokens,
            outputTokens: Math.ceil(accumulatedText.length / 4),
            totalTokens: totalInputTokens + Math.ceil(accumulatedText.length / 4)
          });
        }
      }
    });

    const sendEvent = (event: string, data: any) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    try {
      sendEvent('start', {
        conversationId: payload.conversationId,
        messageId: assistantMessageId,
        model: payload.model,
        mode: payload.mode,
        timestamp: new Date().toISOString()
      });

      const stream = provider.streamChat(payload, abortController.signal);

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }

        if (chunk.type === 'chunk' && chunk.text) {
          accumulatedText += chunk.text;
          sendEvent('chunk', { text: chunk.text });
        } else if (chunk.type === 'usage' && chunk.usage) {
          totalInputTokens = chunk.usage.promptTokens || 0;
          totalOutputTokens = chunk.usage.completionTokens || 0;
          sendEvent('usage', chunk.usage);
        } else if (chunk.type === 'error') {
          sendEvent('error', { error: chunk.error, code: chunk.code });
        } else if (chunk.type === 'done') {
          streamCompleted = true;
          sendEvent('done', { status: 'completed' });
        }
      }

      if (!abortController.signal.aborted) {
        streamCompleted = true;
        // Save completed response in DB
        ConversationService.updateMessage(userId, assistantMessageId, {
          content: accumulatedText,
          status: 'ready'
        });

        // Record usage in DB
        ConversationService.recordUsage(userId, {
          conversationId: payload.conversationId,
          model: payload.model,
          provider: provider.id,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens || Math.ceil(accumulatedText.length / 4),
          totalTokens: (totalInputTokens + (totalOutputTokens || Math.ceil(accumulatedText.length / 4)))
        });

        sendEvent('done', { status: 'completed' });
      }
    } catch (streamError: any) {
      if (!abortController.signal.aborted) {
        console.error('[Darkano API Stream Error]:', streamError?.message);
        ConversationService.updateMessage(userId, assistantMessageId, {
          content: accumulatedText,
          status: 'error'
        });
        sendEvent('error', {
          error: 'Generation stream was interrupted. Please retry.',
          code: 'STREAM_EXCEPTION'
        });
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // 6. Non-streaming chat endpoint (Fallback)
  app.post('/api/chat', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const validation = validateAndPrepareChatRequest(req.body);

    if (!validation.valid || !validation.sanitizedPayload) {
      res.status(400).json({
        error: validation.error || 'Invalid request payload',
        code: validation.code || 'VALIDATION_ERROR'
      });
      return;
    }

    const payload = validation.sanitizedPayload;
    const userId = req.user!.userId;
    const provider = providerRegistry.getProviderForModel(payload.model);

    if (!provider) {
      res.status(404).json({
        error: `No provider registered for model '${payload.model}'.`,
        code: 'PROVIDER_NOT_FOUND'
      });
      return;
    }

    try {
      const chatResponse = await provider.chat(payload);

      // Save user & assistant messages to DB
      if (payload.message) {
        ConversationService.saveMessage(userId, {
          conversationId: payload.conversationId,
          role: 'user',
          content: payload.message,
          model: payload.model,
          mode: payload.mode,
          status: 'ready'
        });
      }

      ConversationService.saveMessage(userId, {
        conversationId: payload.conversationId,
        role: 'assistant',
        content: chatResponse.content,
        model: payload.model,
        mode: payload.mode,
        status: 'ready'
      });

      if (chatResponse.usage) {
        ConversationService.recordUsage(userId, {
          conversationId: payload.conversationId,
          model: payload.model,
          provider: provider.id,
          inputTokens: chatResponse.usage.promptTokens || 0,
          outputTokens: chatResponse.usage.completionTokens || 0,
          totalTokens: chatResponse.usage.totalTokens || 0
        });
      }

      res.status(200).json(chatResponse);
    } catch (err: any) {
      console.error('[Darkano API Non-Stream Error]:', err?.message);
      res.status(500).json({
        error: 'Failed to process chat response',
        code: 'INTERNAL_ERROR'
      });
    }
  });

  // ==========================================
  // Vite Integration & Static Assets
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Darkano AI Server] Operational on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Darkano AI Server] Fatal startup error:', err);
  process.exit(1);
});
