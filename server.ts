import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { providerRegistry } from './server/providers/registry.js';
import { validateAndPrepareChatRequest } from './server/contextManager.js';
import { SERVER_CONFIG } from './server/config.js';
import { AuthService } from './server/db/authService.js';
import { ConversationService } from './server/db/conversationService.js';
import { requireAuth, requireAdmin, extractToken } from './server/middleware/authMiddleware.js';
import { FileService, uploadMiddleware } from './server/services/fileService.js';
import { DocumentContextManager } from './server/services/documentContext.js';
import { webSearchService } from './server/services/searchProvider.js';
import { ToolRegistry } from './server/services/toolRegistry.js';
import { CreditService, CreditTransactionType } from './server/services/creditService.js';
import { BillingService } from './server/services/billingService.js';
import { AdminService } from './server/services/adminService.js';
import fs from 'node:fs';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser with rawBody preservation for webhooks
  app.use(express.json({
    limit: '2mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

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

    // Upfront Server-Side Credit Verification
    const currentBalance = CreditService.getBalance(userId);
    const estimatedCost = CreditService.calculateCost({
      modelId: payload.model,
      mode: payload.mode,
      webSearch: Boolean(req.body.webSearch) || payload.mode === 'research',
      fileCount: payload.fileIds?.length || 0
    });

    if (currentBalance < estimatedCost.totalCredits) {
      res.status(402).json({
        error: `Insufficient credits. This request requires ~${estimatedCost.totalCredits} credits, but your current balance is ${currentBalance}. Please upgrade your plan or top up your credits.`,
        code: 'INSUFFICIENT_CREDITS',
        required: estimatedCost.totalCredits,
        available: currentBalance
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

      // Prepare attached document context & multimodal inspection
      let enhancedMessage = payload.message;
      let multimodalParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];

      if (payload.fileIds && payload.fileIds.length > 0) {
        sendEvent('stage', { stage: 'retrieving_context', count: payload.fileIds.length });
        const docContext = DocumentContextManager.prepareContext(userId, payload.fileIds, payload.message);

        if (docContext.formattedContextText) {
          enhancedMessage = `${payload.message}\n${docContext.formattedContextText}`;
        }
        multimodalParts = docContext.multimodalParts;

        // Record attachment links in DB
        for (const fid of payload.fileIds) {
          ConversationService.recordAttachment({
            conversationId: payload.conversationId,
            messageId: assistantMessageId,
            fileId: fid,
            userId
          });
        }

        sendEvent('stage', {
          stage: 'analyzing_document',
          files: docContext.attachedFilesInfo.map(f => f.name)
        });

        if (docContext.availableCitations.length > 0) {
          sendEvent('citations', docContext.availableCitations.map(c => ({
            sourceName: c.filename,
            page: c.pageCount,
            sheet: c.sheetNames?.[0]
          })));
        }
      }

      if (payload.mode === 'research') {
        sendEvent('stage', { stage: 'searching', query: payload.message });
      }

      const streamPayload = {
        ...payload,
        message: enhancedMessage,
        multimodalParts
      };

      const stream = provider.streamChat(streamPayload, abortController.signal);
      const collectedSources: Array<{ title: string; url: string; domain: string; snippet?: string }> = [];

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }

        if (chunk.type === 'chunk' && chunk.text) {
          accumulatedText += chunk.text;
          sendEvent('chunk', { text: chunk.text });
        } else if (chunk.type === 'stage' && chunk.stage) {
          sendEvent('stage', chunk.stage);
        } else if (chunk.type === 'sources' && chunk.sources) {
          collectedSources.push(...chunk.sources);
          sendEvent('sources', chunk.sources);
        } else if (chunk.type === 'citations' && chunk.citations) {
          sendEvent('citations', chunk.citations);
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

        // Record research record if in research mode with grounded sources
        if (collectedSources.length > 0 && payload.mode === 'research') {
          ConversationService.recordResearch({
            userId,
            conversationId: payload.conversationId,
            messageId: assistantMessageId,
            query: payload.message,
            sources: collectedSources
          });
        }

        // Record usage in DB
        ConversationService.recordUsage(userId, {
          conversationId: payload.conversationId,
          model: payload.model,
          provider: provider.id,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens || Math.ceil(accumulatedText.length / 4),
          totalTokens: (totalInputTokens + (totalOutputTokens || Math.ceil(accumulatedText.length / 4)))
        });

        // Atomically deduct real credits
        try {
          const finalCost = CreditService.calculateCost({
            modelId: payload.model,
            mode: payload.mode,
            webSearch: collectedSources.length > 0 || payload.mode === 'research',
            fileCount: payload.fileIds?.length || 0,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens || Math.ceil(accumulatedText.length / 4)
          });

          let txType: CreditTransactionType = 'ai_usage';
          if (payload.mode === 'research' || collectedSources.length > 0) {
            txType = 'web_search_usage';
          } else if (payload.fileIds && payload.fileIds.length > 0) {
            txType = 'file_analysis_usage';
          }

          const deduction = CreditService.deductCredits({
            userId,
            amount: finalCost.totalCredits,
            type: txType,
            source: 'chat_stream',
            metadata: {
              conversationId: payload.conversationId,
              messageId: assistantMessageId,
              model: payload.model,
              mode: payload.mode,
              tokens: totalInputTokens + (totalOutputTokens || Math.ceil(accumulatedText.length / 4)),
              breakdown: finalCost.breakdown
            },
            idempotencyKey: `usage_${assistantMessageId}`
          });

          sendEvent('credits', {
            consumed: finalCost.totalCredits,
            balanceAfter: deduction.balanceAfter,
            breakdown: finalCost.breakdown
          });
        } catch (creditErr: any) {
          console.warn('[Darkano Credits] Warning during stream credit deduction:', creditErr?.message);
        }

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
  // 7. Phase 5: Real File Vault & Processing
  // ==========================================
  app.post(
    '/api/files/upload',
    requireAuth,
    uploadMiddleware.array('files', 10),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const userId = req.user!.userId;
        const uploadedFiles = req.files as Express.Multer.File[];

        if (!uploadedFiles || uploadedFiles.length === 0) {
          res.status(400).json({ error: 'No files provided for upload.', code: 'NO_FILES' });
          return;
        }

        const processedFiles = [];

        for (const f of uploadedFiles) {
          // 1. Create DB record
          const record = FileService.createFileRecord({
            userId,
            originalName: f.originalname,
            storagePath: f.path,
            mimeType: f.mimetype,
            fileSize: f.size
          });

          // 2. Real file processing (extract text, docx, xlsx, pdf pages, images)
          const processed = await FileService.processFile(record.id);
          processedFiles.push(processed);
        }

        const storage = FileService.getUserStorageUsage(userId);

        res.status(201).json({
          message: `Successfully stored and analyzed ${processedFiles.length} file(s).`,
          files: processedFiles,
          storage
        });
      } catch (uploadErr: any) {
        console.error('[Darkano File Upload Error]:', uploadErr?.message);
        res.status(500).json({
          error: uploadErr?.message || 'File upload or extraction failed.',
          code: 'UPLOAD_FAILED'
        });
      }
    }
  );

  app.get('/api/files', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const files = FileService.getUserFiles(userId);
      const storage = FileService.getUserStorageUsage(userId);
      res.status(200).json({ files, storage });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list files', code: 'FILES_LIST_FAILED' });
    }
  });

  app.get('/api/files/:id', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const file = FileService.getFile(userId, req.params.id);
      if (!file) {
        res.status(404).json({ error: 'File not found or permission denied.', code: 'FILE_NOT_FOUND' });
        return;
      }
      res.status(200).json({ file });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve file', code: 'FILE_GET_FAILED' });
    }
  });

  app.get('/api/files/:id/preview', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const file = FileService.getFile(userId, req.params.id);
      if (!file) {
        res.status(404).json({ error: 'File not found or permission denied.', code: 'FILE_NOT_FOUND' });
        return;
      }

      let metadata = {};
      try {
        if (file.metadataJson) metadata = JSON.parse(file.metadataJson);
      } catch {}

      res.status(200).json({
        id: file.id,
        name: file.originalName,
        mimeType: file.mimeType,
        size: file.fileSize,
        status: file.status,
        metadata,
        previewText: file.extractedText?.slice(0, 10000) || '',
        totalChars: file.extractedText?.length || 0
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to preview file', code: 'PREVIEW_FAILED' });
    }
  });

  app.get('/api/files/:id/download', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const file = FileService.getFile(userId, req.params.id);
      if (!file || !fs.existsSync(file.storagePath)) {
        res.status(404).json({ error: 'File not found or payload unavailable.', code: 'FILE_NOT_FOUND' });
        return;
      }

      res.setHeader('Content-Type', file.mimeType);
      res.download(file.storagePath, file.originalName);
    } catch (err: any) {
      res.status(500).json({ error: 'Download failed', code: 'DOWNLOAD_FAILED' });
    }
  });

  app.delete('/api/files/:id', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      FileService.deleteFile(userId, req.params.id);
      const storage = FileService.getUserStorageUsage(userId);
      res.status(200).json({
        success: true,
        fileId: req.params.id,
        storage
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete file', code: 'DELETE_FAILED' });
    }
  });

  // ==========================================
  // 8. Phase 5: Real Web Search & Tool Execution
  // ==========================================
  app.post('/api/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, limit } = req.body || {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Query parameter is required.', code: 'QUERY_REQUIRED' });
        return;
      }

      if (!webSearchService.isConfigured()) {
        res.status(503).json({
          error: 'Web search grounding is not available. Please verify GEMINI_API_KEY.',
          code: 'SEARCH_NOT_CONFIGURED'
        });
        return;
      }

      const sources = await webSearchService.search(query.trim(), limit ? Number(limit) : 6);
      res.status(200).json({
        query: query.trim(),
        sources,
        count: sources.length
      });
    } catch (err: any) {
      console.error('[Darkano Web Search Error]:', err?.message);
      res.status(500).json({ error: err?.message || 'Search execution failed', code: 'SEARCH_FAILED' });
    }
  });

  app.post('/api/fetch-page', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string' || !url.trim()) {
        res.status(400).json({ error: 'URL parameter is required.', code: 'URL_REQUIRED' });
        return;
      }

      const page = await webSearchService.fetchPage(url.trim(), 8000);
      res.status(200).json(page);
    } catch (err: any) {
      console.error('[Darkano Fetch Page Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Failed to fetch web page', code: 'FETCH_FAILED' });
    }
  });

  app.get('/api/tools', requireAuth, (req: Request, res: Response): void => {
    res.status(200).json({
      tools: ToolRegistry.getAllTools()
    });
  });

  app.post('/api/tools/execute', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { name, args, conversationId } = req.body || {};
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Tool name is required.', code: 'TOOL_REQUIRED' });
        return;
      }

      const result = await ToolRegistry.executeTool(name, args || {}, {
        userId,
        conversationId,
        timeoutMs: 12000
      });

      if (!result.success) {
        res.status(400).json({ error: result.error, code: 'TOOL_EXEC_FAILED' });
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Tool execution error', code: 'TOOL_ERROR' });
    }
  });

  // ==========================================
  // PHASE 6: Credit Ledger & Usage Endpoints
  // ==========================================

  app.get('/api/credits/balance', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const balance = CreditService.getBalance(userId);
      const usage = CreditService.getUsageSummary(userId);
      res.status(200).json({
        balance,
        usage,
        userRole: req.user!.role,
        plan: req.user!.plan
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch credit balance', code: 'CREDIT_ERROR' });
    }
  });

  app.get('/api/credits/history', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const type = req.query.type as string | undefined;

      const history = CreditService.getTransactionHistory({
        userId,
        limit,
        offset,
        type
      });

      res.status(200).json(history);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch credit ledger', code: 'LEDGER_ERROR' });
    }
  });

  app.get('/api/credits/pricing', (req: Request, res: Response): void => {
    res.status(200).json({
      modelBaseCosts: {
        'darkano-ultra-v2': 8,
        'darkano-coder-v2': 6,
        'darkano-prime-v2': 4,
        'darkano-flash-v2': 2,
        'gemini-2.5-pro': 6,
        'gemini-2.5-flash': 2
      },
      tokenComputeRate: '1 credit per 2,000 processed tokens',
      webSearchGroundingCost: 4,
      fileVaultAnalysisCost: '2 credits per attached document'
    });
  });

  // ==========================================
  // PHASE 6: Real Billing & Subscription Endpoints
  // ==========================================

  app.get('/api/billing/plans', (req: Request, res: Response): void => {
    try {
      const plans = BillingService.getPlans();
      const isConfigured = BillingService.isStripeConfigured();
      res.status(200).json({
        plans,
        isConfigured,
        provider: 'Stripe',
        status: isConfigured ? 'Available' : 'Not configured / unavailable'
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retrieve billing plans', code: 'PLANS_ERROR' });
    }
  });

  app.get('/api/billing/subscription', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const subscription = BillingService.getUserSubscription(userId);
      const payments = BillingService.getUserPayments(userId);
      const isConfigured = BillingService.isStripeConfigured();

      res.status(200).json({
        subscription,
        payments,
        isConfigured,
        currentPlan: req.user!.plan
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch subscription', code: 'SUB_ERROR' });
    }
  });

  app.post('/api/billing/checkout', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!BillingService.isStripeConfigured()) {
        res.status(503).json({
          error: 'Payment provider is not configured. Stripe credentials (STRIPE_SECRET_KEY) are required.',
          code: 'PAYMENT_PROVIDER_UNAVAILABLE'
        });
        return;
      }

      const { planId } = req.body || {};
      if (!planId) {
        res.status(400).json({ error: 'Plan ID is required.', code: 'PLAN_REQUIRED' });
        return;
      }

      const origin = `${req.protocol}://${req.get('host')}`;
      const session = await BillingService.createCheckoutSession({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        planId,
        origin
      });

      res.status(200).json(session);
    } catch (err: any) {
      console.error('[Darkano Checkout Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Checkout failed to initialize', code: 'CHECKOUT_FAILED' });
    }
  });

  app.post('/api/billing/cancel', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await BillingService.cancelSubscription(req.user!.userId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to cancel subscription', code: 'CANCEL_FAILED' });
    }
  });

  // Stripe Webhook Endpoint (Strict signature verification)
  app.post('/api/billing/webhook', async (req: Request, res: Response): Promise<void> => {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        res.status(400).json({ error: 'Missing stripe-signature header', code: 'SIG_MISSING' });
        return;
      }

      const rawBody = (req as any).rawBody as Buffer;
      if (!rawBody) {
        res.status(400).json({ error: 'Raw request body buffer unavailable for signature verification', code: 'RAW_BODY_MISSING' });
        return;
      }

      const result = await BillingService.handleWebhookEvent(rawBody, signature);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Darkano Webhook Verification Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Webhook processing failed', code: 'WEBHOOK_FAILED' });
    }
  });

  // ==========================================
  // PHASE 6: Protected Admin Console Endpoints
  // ==========================================

  app.get('/api/admin/stats', requireAdmin, (req: Request, res: Response): void => {
    try {
      const stats = AdminService.getDashboardStats();
      res.status(200).json({ stats });
    } catch (err: any) {
      console.error('[Darkano Admin Stats Error]:', err?.message);
      res.status(500).json({ error: err?.message || 'Failed to generate admin statistics', code: 'ADMIN_STATS_ERROR' });
    }
  });

  app.get('/api/admin/users', requireAdmin, (req: Request, res: Response): void => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string | undefined;

      const result = AdminService.getUsersList({ page, limit, search });
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query users directory', code: 'ADMIN_USERS_ERROR' });
    }
  });

  app.put('/api/admin/users/:userId/role', requireAdmin, (req: Request, res: Response): void => {
    try {
      const { role } = req.body || {};
      if (!role || !['user', 'admin', 'owner'].includes(role)) {
        res.status(400).json({ error: 'Valid role is required (user, admin, owner)', code: 'INVALID_ROLE' });
        return;
      }

      const result = AdminService.updateUserRole(
        { userId: req.user!.userId, email: req.user!.email, role: req.user!.role },
        req.params.userId,
        role
      );

      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to update user role', code: 'ROLE_UPDATE_FAILED' });
    }
  });

  app.post('/api/admin/users/:userId/credits', requireAdmin, (req: Request, res: Response): void => {
    try {
      const { amount, reason } = req.body || {};
      const numAmount = parseInt(amount, 10);

      if (isNaN(numAmount) || numAmount === 0) {
        res.status(400).json({ error: 'A non-zero integer amount is required.', code: 'INVALID_AMOUNT' });
        return;
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        res.status(400).json({ error: 'A specific explanation/reason is required for audit logs.', code: 'REASON_REQUIRED' });
        return;
      }

      const result = CreditService.manualAdjustment({
        adminId: req.user!.userId,
        adminEmail: req.user!.email,
        targetUserId: req.params.userId,
        amount: numAmount,
        reason: reason.trim()
      });

      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Manual adjustment failed', code: 'ADJUSTMENT_FAILED' });
    }
  });

  app.get('/api/admin/health', requireAdmin, (req: Request, res: Response): void => {
    try {
      const health = AdminService.getSystemHealth();
      res.status(200).json({ components: health });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to inspect system health', code: 'HEALTH_CHECK_ERROR' });
    }
  });

  app.get('/api/admin/audit-logs', requireAdmin, (req: Request, res: Response): void => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;

      const logs = AdminService.getAuditLogs({ page, limit });
      res.status(200).json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retrieve audit records', code: 'AUDIT_ERROR' });
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
