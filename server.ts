import express, { Request, Response } from 'express';
import dns from 'node:dns';
import path from 'path';

// Prioritize IPv4 DNS resolution in container environments to prevent IPv6 timeout stalls
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (err) {
  console.warn('[Network Init] setDefaultResultOrder error:', err);
}

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
import { AgentTaskService } from './server/db/agentTaskService.js';
import { AgentEngine } from './server/services/agentEngine.js';
import { MediaService } from './server/services/mediaService.js';
import { MultimodalService } from './server/services/multimodalService.js';
import { ProjectService } from './server/db/projectService.js';
import { ProjectBuildService } from './server/services/projectBuildService.js';
import { ProjectAiService } from './server/services/projectAiService.js';
import { DeploymentService } from './server/services/deploymentService.js';
import { DeploymentProviderRegistry } from './server/providers/deployment/providerRegistry.js';
import { CollaborationService, CollaborationAccessError, VersionConflictError } from './server/services/collaborationService.js';
import { GitService } from './server/services/gitService.js';
import { securityHeaders } from './server/middleware/securityHeaders.js';
import { requestLogger } from './server/middleware/requestLogger.js';
import {
  generalApiRateLimiter,
  authRateLimiter,
  chatRateLimiter,
  expensiveAiRateLimiter,
  searchRateLimiter,
  buildRateLimiter,
  uploadRateLimiter
} from './server/middleware/rateLimiter.js';
import { SystemMaintenanceService } from './server/services/systemMaintenanceService.js';
import { db } from './server/db/database.js';
import fs from 'node:fs';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security Headers & Request Correlation
  app.use(securityHeaders);
  app.use(requestLogger);

  // Global API Rate Limiter
  app.use('/api', generalApiRateLimiter);

  // JSON Body Parser with rawBody preservation for webhooks
  app.use(express.json({
    limit: '35mb',
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
  app.post('/api/auth/register', authRateLimiter, (req: Request, res: Response): void => {
    try {
      const { email, password, displayName } = req.body || {};
      const result = AuthService.register({ email, password, displayName });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Registration failed', code: 'REGISTRATION_ERROR' });
    }
  });

  app.post('/api/auth/login', authRateLimiter, (req: Request, res: Response): void => {
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

  app.post('/api/auth/forgot-password', authRateLimiter, (req: Request, res: Response): void => {
    try {
      const { email } = req.body || {};
      const result = AuthService.requestPasswordReset(email || '');
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Request failed', code: 'RESET_REQUEST_ERROR' });
    }
  });

  app.post('/api/auth/reset-password', authRateLimiter, (req: Request, res: Response): void => {
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
  app.post('/api/chat/stream', requireAuth, chatRateLimiter, async (req: Request, res: Response): Promise<void> => {
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
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

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

      const hasFileAttachments = payload.fileIds && payload.fileIds.length > 0;
      const hasMediaAttachments = (payload as any).mediaIds && (payload as any).mediaIds.length > 0;

      if (hasFileAttachments || hasMediaAttachments) {
        const fileIds = payload.fileIds || [];
        const mediaIds = (payload as any).mediaIds || [];
        sendEvent('stage', { stage: 'retrieving_context', count: fileIds.length + mediaIds.length });
        const docContext = DocumentContextManager.prepareContext(userId, fileIds, payload.message, 32000, mediaIds);

        if (docContext.formattedContextText) {
          enhancedMessage = `${payload.message}\n${docContext.formattedContextText}`;
        }
        multimodalParts = docContext.multimodalParts;

        // Record attachment links in DB
        for (const fid of fileIds) {
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

      // Check model capability matrix for multimodal inputs
      if (multimodalParts.length > 0) {
        const hasImage = multimodalParts.some(p => p.inlineData?.mimeType.startsWith('image/'));
        const hasAudio = multimodalParts.some(p => p.inlineData?.mimeType.startsWith('audio/'));

        const targetModel = provider.getModels().find(m => m.id === payload.model);
        if (targetModel) {
          if (hasImage && !targetModel.capabilityMatrix.vision) {
            sendEvent('error', {
              error: `Selected model '${targetModel.name}' does not support vision or image analysis. Please switch to a vision-capable model (e.g. Gemini 3.8 Flash, Gemini 2.5 Pro, or Darkano Ultra).`,
              code: 'UNSUPPORTED_CAPABILITY'
            });
            sendEvent('done', { status: 'failed' });
            res.end();
            return;
          }
          if (hasAudio && !targetModel.capabilityMatrix.audio_input) {
            sendEvent('error', {
              error: `Selected model '${targetModel.name}' does not support audio ingestion. Please switch to an audio-capable model.`,
              code: 'UNSUPPORTED_CAPABILITY'
            });
            sendEvent('done', { status: 'failed' });
            res.end();
            return;
          }
        }
      }

      if (payload.mode === 'research') {
        sendEvent('stage', { stage: 'searching', query: payload.message });
      }

      if (payload.mode === 'agent') {
        sendEvent('stage', { stage: 'planning', prompt: payload.message });
        const agentTask = await AgentEngine.startTask({
          userId,
          conversationId: payload.conversationId,
          prompt: payload.message,
          modelId: payload.model,
          fileIds: payload.fileIds
        });

        await new Promise<void>((resolve) => {
          const unsubscribe = AgentEngine.subscribeToEvents(agentTask.id, event => {
            if (event.event === 'plan_created') {
              sendEvent('stage', {
                stage: 'plan_created',
                taskId: agentTask.id,
                plan: event.task?.plan,
                totalSteps: event.task?.totalSteps
              });
            } else if (event.event === 'step_started') {
              sendEvent('stage', {
                stage: 'step_started',
                taskId: agentTask.id,
                currentStep: event.task?.currentStep,
                step: event.step
              });
            } else if (event.event === 'tool_started') {
              sendEvent('stage', {
                stage: 'tool_started',
                taskId: agentTask.id,
                tool: event.tool?.name
              });
            } else if (event.event === 'tool_completed') {
              sendEvent('stage', {
                stage: 'tool_completed',
                taskId: agentTask.id,
                tool: event.tool
              });
            } else if (event.event === 'step_completed') {
              sendEvent('stage', {
                stage: 'step_completed',
                taskId: agentTask.id,
                step: event.step
              });
            } else if (event.event === 'approval_required') {
              sendEvent('stage', {
                stage: 'approval_required',
                taskId: agentTask.id,
                action: event.task?.pendingApprovalAction
              });
            } else if (event.event === 'task_completed') {
              if (event.citations && event.citations.length > 0) {
                sendEvent('citations', event.citations);
                sendEvent('sources', event.citations.map(c => ({
                  title: c.title || c.domain || 'Source',
                  url: c.url || '',
                  domain: c.domain || '',
                  snippet: c.snippet
                })));
              }
              if (event.result) {
                sendEvent('chunk', { text: event.result });
              }
              sendEvent('stage', {
                stage: 'task_completed',
                taskId: agentTask.id,
                creditsUsed: event.task?.creditsUsed
              });
              sendEvent('done', { status: 'completed' });
              unsubscribe();
              resolve();
            } else if (event.event === 'task_failed' || event.event === 'task_cancelled') {
              sendEvent('error', { error: event.error || 'Agent task ended' });
              unsubscribe();
              resolve();
            }
          });

          abortController.signal.addEventListener('abort', () => {
            AgentEngine.cancelTask(agentTask.id, userId);
            unsubscribe();
            resolve();
          });
        });

        return;
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
  app.post('/api/chat', requireAuth, chatRateLimiter, async (req: Request, res: Response): Promise<void> => {
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
    uploadRateLimiter,
    uploadMiddleware.array('files', 10) as any,
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
  app.post('/api/search', requireAuth, searchRateLimiter, async (req: Request, res: Response): Promise<void> => {
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

  app.post('/api/fetch-page', requireAuth, searchRateLimiter, async (req: Request, res: Response): Promise<void> => {
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

  // System Maintenance & Data Retention Endpoints
  app.post('/api/admin/maintenance/cleanup', requireAdmin, (req: Request, res: Response): void => {
    try {
      const report = SystemMaintenanceService.runAllMaintenance();
      AdminService.logAction({
        adminId: req.user!.userId,
        adminEmail: req.user!.email,
        action: 'system_maintenance_cleanup',
        targetType: 'system',
        targetId: 'db',
        details: { sessionsCleaned: report.sessionsCleaned, orphanedSandboxesCleaned: report.orphanedSandboxesCleaned }
      });
      res.status(200).json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Maintenance cleanup failed', code: 'MAINTENANCE_ERROR' });
    }
  });

  app.post('/api/admin/maintenance/backup', requireAdmin, (req: Request, res: Response): void => {
    try {
      const backup = SystemMaintenanceService.createDatabaseBackup();
      AdminService.logAction({
        adminId: req.user!.userId,
        adminEmail: req.user!.email,
        action: 'database_backup_created',
        targetType: 'system',
        targetId: backup.backupFileName,
        details: { sizeBytes: backup.sizeBytes, retained: backup.retainedBackupsCount }
      });
      res.status(200).json({ success: true, backup });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Database backup failed', code: 'BACKUP_ERROR' });
    }
  });

  app.get('/api/admin/maintenance/integrity', requireAdmin, (req: Request, res: Response): void => {
    try {
      const integrity = SystemMaintenanceService.verifyDatabaseIntegrity();
      res.status(200).json(integrity);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Integrity check failed', code: 'INTEGRITY_ERROR' });
    }
  });

  app.get('/api/admin/maintenance/ledger-audit', requireAdmin, (req: Request, res: Response): void => {
    try {
      const ledgerAudit = SystemMaintenanceService.auditCreditLedger();
      res.status(200).json(ledgerAudit);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Credit ledger audit failed', code: 'LEDGER_AUDIT_ERROR' });
    }
  });

  // ==========================================
  // 10. Phase 7: Real AI Agent / Multi-Step Engine
  // ==========================================

  // List all registered tools with schemas and requirements
  app.get('/api/agent/tools', requireAuth, (req: Request, res: Response): void => {
    try {
      const tools = ToolRegistry.getAllTools();
      res.status(200).json({ tools });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list agent tools' });
    }
  });

  // Create and launch real task
  app.post('/api/agent/tasks', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { prompt, conversationId, modelId, fileIds } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Prompt is required for agent task execution.', code: 'INVALID_PROMPT' });
        return;
      }

      if (prompt.trim().length > 32000) {
        res.status(400).json({ error: 'Prompt exceeds maximum character limit (32,000).', code: 'PROMPT_TOO_LONG' });
        return;
      }

      const task = await AgentEngine.startTask({
        userId,
        conversationId,
        prompt: prompt.trim(),
        modelId,
        fileIds: Array.isArray(fileIds) ? fileIds : undefined
      });

      res.status(201).json({ task });
    } catch (err: any) {
      console.error('[Darkano Agent API] Task creation error:', err?.message);
      res.status(500).json({ error: err?.message || 'Failed to initialize agent task', code: 'TASK_INIT_FAILED' });
    }
  });

  // List user's tasks with pagination
  app.get('/api/agent/tasks', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const data = AgentTaskService.listUserTasks(userId, limit, offset);
      res.status(200).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list agent tasks' });
    }
  });

  // Get specific task by ID (Enforces strict user isolation)
  app.get('/api/agent/tasks/:taskId', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const task = AgentTaskService.getTask(req.params.taskId, userId);
      if (!task) {
        res.status(404).json({ error: 'Task not found or access denied.', code: 'TASK_NOT_FOUND' });
        return;
      }
      res.status(200).json({ task });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get task' });
    }
  });

  // Get task steps
  app.get('/api/agent/tasks/:taskId/steps', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const task = AgentTaskService.getTask(req.params.taskId, userId);
      if (!task) {
        res.status(404).json({ error: 'Task not found or access denied.', code: 'TASK_NOT_FOUND' });
        return;
      }
      const steps = AgentTaskService.getSteps(req.params.taskId);
      res.status(200).json({ steps });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get steps' });
    }
  });

  // Get tool execution records for task
  app.get('/api/agent/tasks/:taskId/executions', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const task = AgentTaskService.getTask(req.params.taskId, userId);
      if (!task) {
        res.status(404).json({ error: 'Task not found or access denied.', code: 'TASK_NOT_FOUND' });
        return;
      }
      const executions = AgentTaskService.getToolExecutions(req.params.taskId);
      res.status(200).json({ executions });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get tool executions' });
    }
  });

  // Cancel task
  app.post('/api/agent/tasks/:taskId/cancel', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const success = AgentEngine.cancelTask(req.params.taskId, userId);
      if (!success) {
        res.status(404).json({ error: 'Task not found or could not be cancelled.', code: 'CANCEL_FAILED' });
        return;
      }
      res.status(200).json({ success: true, message: 'Task cancelled successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to cancel task' });
    }
  });

  // Approve pending step (Human approval gate)
  app.post('/api/agent/tasks/:taskId/approve', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const success = AgentEngine.approveStep(req.params.taskId, userId);
      if (!success) {
        res.status(400).json({ error: 'Task is not waiting for approval or access denied.', code: 'APPROVAL_FAILED' });
        return;
      }
      res.status(200).json({ success: true, message: 'Step approved. Resuming agent execution.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to approve step' });
    }
  });

  // Retry failed task
  app.post('/api/agent/tasks/:taskId/retry', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const task = await AgentEngine.retryTask(req.params.taskId, userId);
      if (!task) {
        res.status(400).json({ error: 'Only failed or cancelled tasks can be retried.', code: 'RETRY_FAILED' });
        return;
      }
      res.status(200).json({ task });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retry task' });
    }
  });

  // Server-Sent Events (SSE) stream for real-time task progress
  app.get('/api/agent/tasks/:taskId/events', requireAuth, (req: Request, res: Response): void => {
    const userId = req.user!.userId;
    const taskId = req.params.taskId;

    const task = AgentTaskService.getTask(taskId, userId);
    if (!task) {
      res.status(404).json({ error: 'Task not found or access denied.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial snapshot
    res.write(`data: ${JSON.stringify({ event: 'initial_state', taskId, task })}\n\n`);

    const unsubscribe = AgentEngine.subscribeToEvents(taskId, event => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.event === 'task_completed' || event.event === 'task_failed' || event.event === 'task_cancelled') {
          setTimeout(() => {
            try {
              res.end();
            } catch {}
          }, 1500);
        }
      } catch (err) {
        console.warn('[Darkano Agent SSE] Stream send error:', err);
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  // ==========================================
  // 11. Phase 8: Real Multimodal AI System
  // ==========================================

  // Query multimodal engine status and capabilities
  app.get('/api/multimodal/capabilities', (req: Request, res: Response): void => {
    try {
      const isGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);
      res.status(200).json({
        configured: isGeminiConfigured,
        capabilities: {
          vision: isGeminiConfigured,
          image_generation: isGeminiConfigured,
          audio_transcription: isGeminiConfigured,
          speech_synthesis: isGeminiConfigured,
          voice_chat: isGeminiConfigured
        },
        models: {
          vision: 'gemini-3.8-flash',
          imageGeneration: 'gemini-3.1-flash-lite-image',
          audioInput: 'gemini-3.8-flash',
          speechSynthesis: 'gemini-3.1-flash-tts-preview'
        },
        creditCosts: {
          imageGeneration: 10,
          imageEdit: 10,
          audioTranscription: 5,
          textToSpeech: 3
        },
        supportedVoices: ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve multimodal capabilities' });
    }
  });

  // Upload image or audio file directly to user media vault
  app.post('/api/multimodal/upload', requireAuth, uploadRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { data, mimeType, type, conversationId } = req.body || {};

      if (!data || typeof data !== 'string') {
        res.status(400).json({ error: 'Base64 data string is required for media upload.', code: 'INVALID_PAYLOAD' });
        return;
      }

      const cleanBase64 = data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      const mediaRecord = MediaService.saveMedia({
        userId,
        conversationId,
        buffer,
        declaredMime: mimeType,
        type: type || (mimeType?.startsWith('audio/') ? 'audio' : 'image')
      });

      res.status(201).json({ media: mediaRecord });
    } catch (err: any) {
      console.error('[Darkano Media Upload Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Failed to upload media', code: 'UPLOAD_FAILED' });
    }
  });

  // Generate image using real image generation model
  app.post('/api/multimodal/generate-image', requireAuth, expensiveAiRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { prompt, aspectRatio, conversationId } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Image prompt is required.', code: 'PROMPT_REQUIRED' });
        return;
      }

      const result = await MultimodalService.generateImage(userId, {
        prompt: prompt.trim(),
        aspectRatio: aspectRatio || '1:1',
        conversationId
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Darkano Image Gen Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Failed to generate image', code: 'GENERATION_FAILED' });
    }
  });

  // Edit an existing image with text instructions
  app.post('/api/multimodal/edit-image', requireAuth, expensiveAiRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { sourceMediaId, prompt, conversationId } = req.body || {};

      if (!sourceMediaId || !prompt) {
        res.status(400).json({ error: 'Source media ID and editing prompt are required.', code: 'INVALID_PARAMS' });
        return;
      }

      const result = await MultimodalService.editImage(userId, {
        sourceMediaId,
        prompt: prompt.trim(),
        conversationId
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Darkano Image Edit Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Failed to edit image', code: 'EDIT_FAILED' });
    }
  });

  // Transcribe audio (STT) from user recording or file
  app.post('/api/multimodal/transcribe', requireAuth, expensiveAiRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { audioBase64, mimeType, prompt, conversationId } = req.body || {};

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'audioBase64 parameter is required.', code: 'AUDIO_REQUIRED' });
        return;
      }

      const cleanB64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
      const audioBuffer = Buffer.from(cleanB64, 'base64');

      const result = await MultimodalService.transcribeAudio(userId, {
        audioBuffer,
        mimeType: mimeType || 'audio/webm',
        prompt,
        conversationId
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Darkano Transcribe Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Failed to transcribe audio', code: 'TRANSCRIBE_FAILED' });
    }
  });

  // Synthesize text-to-speech (TTS)
  app.post('/api/multimodal/tts', requireAuth, expensiveAiRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { text, voiceName, conversationId, messageId } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Text parameter is required for TTS synthesis.', code: 'TEXT_REQUIRED' });
        return;
      }

      const result = await MultimodalService.textToSpeech(userId, {
        text: text.trim(),
        voiceName: voiceName || 'Kore',
        conversationId,
        messageId
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Darkano TTS Error]:', err?.message);
      res.status(400).json({ error: err?.message || 'Failed to synthesize speech', code: 'TTS_FAILED' });
    }
  });

  // List user media items
  app.get('/api/media', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const conversationId = req.query.conversationId as string | undefined;
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = MediaService.getUserMedia(userId, {
        conversationId,
        type,
        limit,
        offset
      });

      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list media', code: 'MEDIA_LIST_ERROR' });
    }
  });

  // Stream media file with authentication
  app.get('/api/media/:mediaId', (req: Request, res: Response): void => {
    try {
      // Support Authorization header or query token for standard <img> and <audio> tags
      let token = extractToken(req);
      if (!token && req.query.token && typeof req.query.token === 'string') {
        token = req.query.token;
      }

      if (!token) {
        res.status(401).json({ error: 'Authentication required to view media.', code: 'AUTH_REQUIRED' });
        return;
      }

      const session = AuthService.validateSession(token);
      if (!session) {
        res.status(401).json({ error: 'Invalid or expired session.', code: 'INVALID_SESSION' });
        return;
      }

      const userId = session.userId;
      const mediaId = req.params.mediaId;

      const mediaData = MediaService.getMediaBuffer(userId, mediaId);
      if (!mediaData) {
        res.status(404).json({ error: 'Media file not found or access denied.', code: 'MEDIA_NOT_FOUND' });
        return;
      }

      res.setHeader('Content-Type', mediaData.mimeType);
      res.setHeader('Content-Length', mediaData.buffer.length);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.end(mediaData.buffer);
    } catch (err: any) {
      console.error('[Darkano Media Stream Error]:', err?.message);
      res.status(500).json({ error: 'Failed to stream media file.' });
    }
  });

  // Delete media item
  app.delete('/api/media/:mediaId', requireAuth, (req: Request, res: Response): void => {
    try {
      const userId = req.user!.userId;
      const mediaId = req.params.mediaId;

      MediaService.deleteMedia(userId, mediaId);
      res.status(200).json({ success: true, message: 'Media removed successfully.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete media', code: 'DELETE_FAILED' });
    }
  });

  // ==========================================
  // PHASE 9: Real AI Coding Workspace + Project Builder API
  // ==========================================

  // Projects CRUD
  app.get('/api/projects', requireAuth, (req: Request, res: Response): void => {
    try {
      const projects = ProjectService.listProjects(req.user!.userId);
      res.status(200).json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list projects' });
    }
  });

  app.post('/api/projects', requireAuth, (req: Request, res: Response): void => {
    try {
      const { name, description, framework, language } = req.body || {};
      const result = ProjectService.createProject({
        userId: req.user!.userId,
        name: name || 'New Project',
        description,
        framework,
        language
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to create project' });
    }
  });

  app.get('/api/projects/:projectId', requireAuth, (req: Request, res: Response): void => {
    try {
      const project = ProjectService.getProject(req.user!.userId, req.params.projectId);
      res.status(200).json({ project });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Project not found' });
    }
  });

  app.patch('/api/projects/:projectId', requireAuth, (req: Request, res: Response): void => {
    try {
      const { name, description, status } = req.body || {};
      const project = ProjectService.updateProject(req.user!.userId, req.params.projectId, { name, description, status });
      res.status(200).json({ project });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to update project' });
    }
  });

  app.delete('/api/projects/:projectId', requireAuth, (req: Request, res: Response): void => {
    try {
      ProjectService.deleteProject(req.user!.userId, req.params.projectId);
      res.status(200).json({ success: true, message: 'Project removed successfully.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete project' });
    }
  });

  // Project Files
  app.get('/api/projects/:projectId/files', requireAuth, (req: Request, res: Response): void => {
    try {
      const files = ProjectService.listFiles(req.user!.userId, req.params.projectId);
      res.status(200).json({ files });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to retrieve project files' });
    }
  });

  app.get('/api/projects/:projectId/files/content', requireAuth, (req: Request, res: Response): void => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: 'Query parameter "path" is required' });
        return;
      }
      const file = ProjectService.getFile(req.user!.userId, req.params.projectId, filePath);
      res.status(200).json({ file });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'File not found' });
    }
  });

  app.post('/api/projects/:projectId/files', requireAuth, (req: Request, res: Response): void => {
    try {
      const { path: rawPath, content, fileType } = req.body || {};
      const file = ProjectService.createFile(req.user!.userId, req.params.projectId, rawPath, content || '', fileType || 'file');
      res.status(201).json({ file });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to create file' });
    }
  });

  app.put('/api/projects/:projectId/files', requireAuth, (req: Request, res: Response): void => {
    try {
      const { path: rawPath, content, expectedVersion, force } = req.body || {};
      const file = ProjectService.updateFile(
        req.user!.userId,
        req.params.projectId,
        rawPath,
        content || '',
        expectedVersion !== undefined ? Number(expectedVersion) : undefined,
        Boolean(force)
      );
      res.status(200).json({ file });
    } catch (err: any) {
      if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
        res.status(409).json({
          error: 'File version conflict. Another collaborator modified this file.',
          code: 'VERSION_CONFLICT',
          currentFile: err.currentFile
        });
        return;
      }
      res.status(400).json({ error: err?.message || 'Failed to update file' });
    }
  });

  app.patch('/api/projects/:projectId/files/rename', requireAuth, (req: Request, res: Response): void => {
    try {
      const { oldPath, newPath } = req.body || {};
      const file = ProjectService.renameFile(req.user!.userId, req.params.projectId, oldPath, newPath);
      res.status(200).json({ file });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to rename file' });
    }
  });

  app.delete('/api/projects/:projectId/files', requireAuth, (req: Request, res: Response): void => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: 'Query parameter "path" is required' });
        return;
      }
      ProjectService.deleteFile(req.user!.userId, req.params.projectId, filePath);
      res.status(200).json({ success: true, message: 'File deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete file' });
    }
  });

  // Folders
  app.post('/api/projects/:projectId/folders', requireAuth, (req: Request, res: Response): void => {
    try {
      const { path: rawPath } = req.body || {};
      const folder = ProjectService.createFolder(req.user!.userId, req.params.projectId, rawPath);
      res.status(201).json({ folder });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to create folder' });
    }
  });

  app.patch('/api/projects/:projectId/folders/rename', requireAuth, (req: Request, res: Response): void => {
    try {
      const { oldFolder, newFolder } = req.body || {};
      const result = ProjectService.renameFolder(req.user!.userId, req.params.projectId, oldFolder, newFolder);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to rename folder' });
    }
  });

  app.delete('/api/projects/:projectId/folders', requireAuth, (req: Request, res: Response): void => {
    try {
      const folderPath = req.query.path as string;
      if (!folderPath) {
        res.status(400).json({ error: 'Query parameter "path" is required' });
        return;
      }
      const result = ProjectService.deleteFolder(req.user!.userId, req.params.projectId, folderPath);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete folder' });
    }
  });

  // Snapshots
  app.get('/api/projects/:projectId/snapshots', requireAuth, (req: Request, res: Response): void => {
    try {
      const snapshots = ProjectService.listSnapshots(req.user!.userId, req.params.projectId);
      res.status(200).json({ snapshots });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to list snapshots' });
    }
  });

  app.post('/api/projects/:projectId/snapshots', requireAuth, (req: Request, res: Response): void => {
    try {
      const { description } = req.body || {};
      const snapshot = ProjectService.createSnapshot(req.user!.userId, req.params.projectId, description || 'Manual snapshot');
      res.status(201).json({ snapshot });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to create snapshot' });
    }
  });

  app.post('/api/projects/:projectId/snapshots/:snapshotId/rollback', requireAuth, (req: Request, res: Response): void => {
    try {
      const result = ProjectService.rollbackSnapshot(req.user!.userId, req.params.projectId, req.params.snapshotId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to rollback snapshot' });
    }
  });

  // Builds & Quality Checks
  app.post('/api/projects/:projectId/builds', requireAuth, buildRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const command = req.body?.command || 'npm run build';
      const build = await ProjectBuildService.runBuild(req.user!.userId, req.params.projectId, command);
      res.status(200).json({ build });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Build execution failed' });
    }
  });

  app.get('/api/projects/:projectId/builds', requireAuth, (req: Request, res: Response): void => {
    try {
      const builds = ProjectService.listBuilds(req.user!.userId, req.params.projectId);
      res.status(200).json({ builds });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to list builds' });
    }
  });

  app.get('/api/projects/:projectId/checks', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const checks = await ProjectBuildService.runQualityChecks(req.user!.userId, req.params.projectId);
      res.status(200).json({ checks });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to run quality checks' });
    }
  });

  // Safe Patches
  app.get('/api/projects/:projectId/patches', requireAuth, (req: Request, res: Response): void => {
    try {
      const patches = ProjectService.listPendingPatches(req.user!.userId, req.params.projectId);
      res.status(200).json({ patches });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to list patches' });
    }
  });

  app.post('/api/projects/:projectId/patches/:patchId/apply', requireAuth, (req: Request, res: Response): void => {
    try {
      const result = ProjectService.applyPatch(req.user!.userId, req.params.projectId, req.params.patchId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to apply patch' });
    }
  });

  app.post('/api/projects/:projectId/patches/:patchId/reject', requireAuth, (req: Request, res: Response): void => {
    try {
      const success = ProjectService.rejectPatch(req.user!.userId, req.params.projectId, req.params.patchId);
      res.status(200).json({ success });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to reject patch' });
    }
  });

  // AI Coding Operations
  app.post('/api/projects/:projectId/ai/edit', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, selectedCode, instruction, actionType, mediaBase64, mediaMimeType } = req.body || {};
      if (!filePath || !instruction) {
        res.status(400).json({ error: 'filePath and instruction are required' });
        return;
      }
      const result = await ProjectAiService.editCodeWithAi({
        userId: req.user!.userId,
        projectId: req.params.projectId,
        filePath,
        selectedCode,
        instruction,
        actionType: actionType || 'fix',
        mediaBase64,
        mediaMimeType
      });
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI code editing failed' });
    }
  });

  app.post('/api/projects/:projectId/ai/fix-error', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await ProjectAiService.fixBuildErrorWithAi(req.user!.userId, req.params.projectId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI build error fix failed' });
    }
  });

  app.post('/api/projects/:projectId/ai/generate', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { prompt, framework, language, mediaBase64, mediaMimeType } = req.body || {};
      if (!prompt) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }
      const result = await ProjectAiService.generateProjectWithAi({
        userId: req.user!.userId,
        prompt,
        framework,
        language,
        mediaBase64,
        mediaMimeType
      });
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI project generation failed' });
    }
  });

  app.post('/api/projects/:projectId/ai/generate-tests', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body || {};
      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }
      const result = await ProjectAiService.generateTestsForFile(req.user!.userId, req.params.projectId, filePath);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI test generation failed' });
    }
  });

  // Environment Variables (Masked Secret Storage)
  app.get('/api/projects/:projectId/env', requireAuth, (req: Request, res: Response): void => {
    try {
      const envVars = ProjectService.listEnvVars(req.user!.userId, req.params.projectId);
      res.status(200).json({ envVars });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to list env vars' });
    }
  });

  app.post('/api/projects/:projectId/env', requireAuth, (req: Request, res: Response): void => {
    try {
      const { key, value } = req.body || {};
      if (!key || typeof value !== 'string') {
        res.status(400).json({ error: 'key and value are required' });
        return;
      }
      ProjectService.setEnvVar(req.user!.userId, req.params.projectId, key, value);
      res.status(200).json({ success: true, message: `Environment variable "${key}" saved.` });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to set env var' });
    }
  });

  app.delete('/api/projects/:projectId/env/:key', requireAuth, (req: Request, res: Response): void => {
    try {
      ProjectService.deleteEnvVar(req.user!.userId, req.params.projectId, req.params.key);
      res.status(200).json({ success: true, message: 'Environment variable removed.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete env var' });
    }
  });

  // Real Project Search
  app.get('/api/projects/:projectId/search', requireAuth, (req: Request, res: Response): void => {
    try {
      const query = (req.query.q as string) || '';
      const results = ProjectService.searchProject(req.user!.userId, req.params.projectId, query);
      res.status(200).json({ results });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Search failed' });
    }
  });

  // Real Project Zip Export
  app.get('/api/projects/:projectId/export', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const project = ProjectService.getProject(req.user!.userId, req.params.projectId);
      const safeFilename = `${project.name.toLowerCase().replace(/[^a-z0-9-]/g, '_') || 'project'}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

      await ProjectBuildService.exportProjectZip(req.user!.userId, req.params.projectId, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Export failed' });
      }
    }
  });

  // Git status endpoint
  app.get('/api/projects/:projectId/git/status', requireAuth, (req: Request, res: Response): void => {
    res.status(200).json({
      configured: false,
      message: 'Git integration not configured.'
    });
  });

  // Real Live Preview Route
  app.get('/api/projects/:projectId/preview*', requireAuth, (req: Request, res: Response): void => {
    try {
      const fullPath = req.path;
      const previewPrefix = `/api/projects/${req.params.projectId}/preview`;
      let subPath = fullPath.slice(previewPrefix.length) || 'index.html';
      if (!subPath || subPath === '/') {
        subPath = 'index.html';
      }

      const fileInfo = ProjectBuildService.getPreviewFile(req.user!.userId, req.params.projectId, subPath);

      if (!fileInfo.exists) {
        if (subPath === 'index.html') {
          res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Preview Unavailable</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #94a3b8; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .box { background: #111827; border: 1px solid #1f2937; padding: 2.5rem; border-radius: 12px; max-width: 460px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h3 { color: #f3f4f6; margin-top: 0; font-size: 1.25rem; }
    p { font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
    .badge { display: inline-block; background: #374151; color: #e5e7eb; font-size: 0.8rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="badge">Live Sandbox</div>
    <h3>Preview unavailable</h3>
    <p>This project has not produced a valid build yet. Click <strong>Run Build</strong> in the project workspace to compile the code and generate the live preview.</p>
  </div>
</body>
</html>`);
          return;
        }
        res.status(404).send('Preview asset not found.');
        return;
      }

      res.setHeader('Content-Type', fileInfo.mimeType);
      fs.createReadStream(fileInfo.filePath).pipe(res);
    } catch (err: any) {
      res.status(500).send(`Preview error: ${err?.message || 'Server error'}`);
    }
  });

  // ==========================================
  // PHASE 10: Real Deployment & Cloud Workspace API Routes
  // ==========================================

  // 1. Providers status check
  app.get('/api/deployments/providers', requireAuth, (req: Request, res: Response): void => {
    try {
      const statuses = DeploymentProviderRegistry.getProviderStatuses();
      res.status(200).json(statuses);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retrieve deployment providers' });
    }
  });

  // 2. List project deployments
  app.get('/api/projects/:projectId/deployments', requireAuth, (req: Request, res: Response): void => {
    try {
      const deployments = DeploymentService.listDeployments(req.user!.userId, req.params.projectId);
      res.status(200).json({ deployments });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to list deployments' });
    }
  });

  // 3. Create real deployment (Production / Preview)
  app.post('/api/projects/:projectId/deployments', requireAuth, buildRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const { snapshotId, environment, providerName } = req.body || {};
      const deployment = await DeploymentService.createDeployment({
        userId: req.user!.userId,
        projectId: req.params.projectId,
        snapshotId,
        environment,
        providerName
      });
      res.status(201).json({ deployment });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Deployment creation failed' });
    }
  });

  // 4. Get deployment detail
  app.get('/api/projects/:projectId/deployments/:deploymentId', requireAuth, (req: Request, res: Response): void => {
    try {
      const deployment = DeploymentService.getDeployment(req.user!.userId, req.params.projectId, req.params.deploymentId);
      res.status(200).json({ deployment });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Deployment not found' });
    }
  });

  // 5. Get deployment logs
  app.get('/api/projects/:projectId/deployments/:deploymentId/logs', requireAuth, (req: Request, res: Response): void => {
    try {
      const logs = DeploymentService.getDeploymentLogs(req.user!.userId, req.params.projectId, req.params.deploymentId);
      res.status(200).json({ logs });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to fetch deployment logs' });
    }
  });

  // 6. Run live health check on deployment
  app.post('/api/projects/:projectId/deployments/:deploymentId/health', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await DeploymentService.runHealthCheck(req.user!.userId, req.params.projectId, req.params.deploymentId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Health check execution failed' });
    }
  });

  // 7. Cancel in-progress deployment
  app.post('/api/projects/:projectId/deployments/:deploymentId/cancel', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await DeploymentService.cancelDeployment(req.user!.userId, req.params.projectId, req.params.deploymentId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to cancel deployment' });
    }
  });

  // 8. Stop running deployment
  app.post('/api/projects/:projectId/deployments/:deploymentId/stop', requireAuth, (req: Request, res: Response): void => {
    try {
      const result = DeploymentService.stopDeployment(req.user!.userId, req.params.projectId, req.params.deploymentId);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to stop deployment' });
    }
  });

  // 9. Rollback to previous deployment snapshot
  app.post('/api/projects/:projectId/deployments/:deploymentId/rollback', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const deployment = await DeploymentService.rollbackToDeployment(req.user!.userId, req.params.projectId, req.params.deploymentId);
      res.status(200).json({ deployment, message: 'Rollback initiated and deployment queued.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Rollback failed' });
    }
  });

  // 10. Scoped Environment Variables
  app.get('/api/projects/:projectId/scoped-env', requireAuth, (req: Request, res: Response): void => {
    try {
      const env = (req.query.env as any) || 'production';
      const envVars = DeploymentService.listScopedEnvVars(req.user!.userId, req.params.projectId, env);
      res.status(200).json({ envVars });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to list scoped env vars' });
    }
  });

  app.post('/api/projects/:projectId/scoped-env', requireAuth, (req: Request, res: Response): void => {
    try {
      const { environment = 'production', key, value } = req.body || {};
      if (!key || typeof value !== 'string') {
        res.status(400).json({ error: 'key and string value are required' });
        return;
      }
      DeploymentService.setScopedEnvVar(req.user!.userId, req.params.projectId, environment, key, value);
      res.status(200).json({ success: true, message: `Variable "${key}" configured for ${environment}.` });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to save environment variable' });
    }
  });

  app.delete('/api/projects/:projectId/scoped-env/:key', requireAuth, (req: Request, res: Response): void => {
    try {
      const env = (req.query.env as any) || 'production';
      DeploymentService.deleteScopedEnvVar(req.user!.userId, req.params.projectId, env, req.params.key);
      res.status(200).json({ success: true, message: 'Variable removed.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to delete variable' });
    }
  });

  // 11. Preview Sandbox Status & Action
  app.get('/api/projects/:projectId/preview-status', requireAuth, (req: Request, res: Response): void => {
    try {
      const status = DeploymentService.getPreviewStatus(req.user!.userId, req.params.projectId);
      res.status(200).json(status);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to get preview status' });
    }
  });

  app.post('/api/projects/:projectId/preview-action', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { action } = req.body || {};
      if (action === 'stop') {
        const result = DeploymentService.stopPreview(req.user!.userId, req.params.projectId);
        res.status(200).json(result);
        return;
      }

      if (action === 'start' || action === 'refresh') {
        await ProjectBuildService.runBuild(req.user!.userId, req.params.projectId);
        const status = DeploymentService.getPreviewStatus(req.user!.userId, req.params.projectId);
        res.status(200).json({ ...status, message: 'Preview build updated successfully.' });
        return;
      }

      res.status(400).json({ error: 'Invalid preview action. Expected "start", "stop", or "refresh".' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Preview action failed' });
    }
  });

  // 12. AI Deployment Diagnostics
  app.get('/api/projects/:projectId/ai/deployment-readiness', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const readiness = await ProjectAiService.analyzeDeploymentReadiness(req.user!.userId, req.params.projectId);
      res.status(200).json(readiness);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to analyze deployment readiness' });
    }
  });

  app.post('/api/projects/:projectId/ai/deployment-error', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { deploymentId, errorMessage, errorLogs } = req.body || {};
      if (!deploymentId) {
        res.status(400).json({ error: 'deploymentId is required' });
        return;
      }
      const diagnosis = await ProjectAiService.analyzeDeploymentError(
        req.user!.userId,
        req.params.projectId,
        deploymentId,
        errorMessage,
        errorLogs
      );
      res.status(200).json(diagnosis);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI diagnosis failed' });
    }
  });

  // ==========================================
  // PHASE 11: Real Collaboration, Sharing & Git API
  // ==========================================

  // --- Members ---
  app.get('/api/projects/:projectId/members', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.verifyAccess(req.user!.userId, req.params.projectId, 'viewer');
      const members = CollaborationService.listMembers(req.params.projectId);
      res.status(200).json({ members });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to list members' });
    }
  });

  app.patch('/api/projects/:projectId/members/:memberUserId/role', requireAuth, (req: Request, res: Response): void => {
    try {
      const { role } = req.body || {};
      if (!role) {
        res.status(400).json({ error: 'Role is required' });
        return;
      }
      CollaborationService.updateMemberRole(req.user!.userId, req.params.projectId, req.params.memberUserId, role);
      res.status(200).json({ success: true, message: `Member role updated to ${role}.` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to update member role' });
    }
  });

  app.delete('/api/projects/:projectId/members/:memberUserId', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.removeMember(req.user!.userId, req.params.projectId, req.params.memberUserId);
      res.status(200).json({ success: true, message: 'Member removed from project.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to remove member' });
    }
  });

  // --- Invitations ---
  app.get('/api/projects/:projectId/invitations', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.verifyAccess(req.user!.userId, req.params.projectId, 'owner');
      const invitations = CollaborationService.listProjectInvitations(req.params.projectId);
      res.status(200).json({ invitations });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to list invitations' });
    }
  });

  app.post('/api/projects/:projectId/invitations', requireAuth, (req: Request, res: Response): void => {
    try {
      const { inviteeEmail, role = 'editor' } = req.body || {};
      if (!inviteeEmail) {
        res.status(400).json({ error: 'inviteeEmail is required' });
        return;
      }
      const invitation = CollaborationService.createInvitation({
        actorId: req.user!.userId,
        projectId: req.params.projectId,
        inviteeEmail,
        role
      });
      res.status(201).json({ invitation });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to send invitation' });
    }
  });

  app.delete('/api/projects/:projectId/invitations/:invitationId', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.revokeInvitation(req.user!.userId, req.params.projectId, req.params.invitationId);
      res.status(200).json({ success: true, message: 'Invitation revoked.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to revoke invitation' });
    }
  });

  // Current user's incoming invitations
  app.get('/api/user/invitations', requireAuth, (req: Request, res: Response): void => {
    try {
      const invitations = CollaborationService.listUserInvitations(req.user!.email, req.user!.userId);
      res.status(200).json({ invitations });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list user invitations' });
    }
  });

  app.post('/api/invitations/accept', requireAuth, (req: Request, res: Response): void => {
    try {
      const { token } = req.body || {};
      if (!token) {
        res.status(400).json({ error: 'Invitation token is required' });
        return;
      }
      const result = CollaborationService.acceptInvitation(req.user!.userId, req.user!.email, token);
      res.status(200).json({ success: true, ...result, message: 'Invitation accepted successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to accept invitation' });
    }
  });

  app.post('/api/invitations/decline', requireAuth, (req: Request, res: Response): void => {
    try {
      const { token } = req.body || {};
      if (!token) {
        res.status(400).json({ error: 'Invitation token is required' });
        return;
      }
      CollaborationService.declineInvitation(req.user!.userId, req.user!.email, token);
      res.status(200).json({ success: true, message: 'Invitation declined.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to decline invitation' });
    }
  });

  // --- Share Links ---
  app.get('/api/projects/:projectId/share-links', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.verifyAccess(req.user!.userId, req.params.projectId, 'owner');
      const shareLinks = CollaborationService.listShareLinks(req.params.projectId);
      res.status(200).json({ shareLinks });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to list share links' });
    }
  });

  app.post('/api/projects/:projectId/share-links', requireAuth, (req: Request, res: Response): void => {
    try {
      const { permission = 'view', expiresInDays = 30 } = req.body || {};
      const link = CollaborationService.createShareLink({
        actorId: req.user!.userId,
        projectId: req.params.projectId,
        permission,
        expiresInDays: Number(expiresInDays)
      });
      res.status(201).json({ link });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to generate share link' });
    }
  });

  app.delete('/api/projects/:projectId/share-links/:linkId', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.revokeShareLink(req.user!.userId, req.params.projectId, req.params.linkId);
      res.status(200).json({ success: true, message: 'Share link revoked.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to revoke share link' });
    }
  });

  app.post('/api/share-links/join', requireAuth, (req: Request, res: Response): void => {
    try {
      const { token } = req.body || {};
      if (!token) {
        res.status(400).json({ error: 'Share link token is required' });
        return;
      }
      const result = CollaborationService.joinViaShareLink(req.user!.userId, token);
      res.status(200).json({ success: true, ...result, message: 'Joined project successfully via share link.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to join project via share link' });
    }
  });

  // --- Comments ---
  app.get('/api/projects/:projectId/comments', requireAuth, (req: Request, res: Response): void => {
    try {
      const filePath = req.query.filePath as string | undefined;
      const comments = CollaborationService.listComments(req.params.projectId, filePath);
      res.status(200).json({ comments });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to list comments' });
    }
  });

  app.post('/api/projects/:projectId/comments', requireAuth, (req: Request, res: Response): void => {
    try {
      const { filePath, content, lineStart, lineEnd, parentId } = req.body || {};
      const comment = CollaborationService.addComment({
        userId: req.user!.userId,
        projectId: req.params.projectId,
        filePath,
        content,
        lineStart: lineStart !== undefined ? Number(lineStart) : null,
        lineEnd: lineEnd !== undefined ? Number(lineEnd) : null,
        parentId
      });
      res.status(201).json({ comment });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to post comment' });
    }
  });

  app.patch('/api/projects/:projectId/comments/:commentId/resolve', requireAuth, (req: Request, res: Response): void => {
    try {
      const { resolved = true } = req.body || {};
      CollaborationService.toggleCommentResolved(req.user!.userId, req.params.projectId, req.params.commentId, Boolean(resolved));
      res.status(200).json({ success: true, resolved: Boolean(resolved) });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to update comment status' });
    }
  });

  app.delete('/api/projects/:projectId/comments/:commentId', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.deleteComment(req.user!.userId, req.params.projectId, req.params.commentId);
      res.status(200).json({ success: true, message: 'Comment deleted.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete comment' });
    }
  });

  // --- Activity Stream / Audit Log ---
  app.get('/api/projects/:projectId/activity', requireAuth, (req: Request, res: Response): void => {
    try {
      CollaborationService.verifyAccess(req.user!.userId, req.params.projectId, 'viewer');
      const limit = parseInt(req.query.limit as string) || 50;
      const activity = CollaborationService.listActivity(req.params.projectId, limit);
      res.status(200).json({ activity });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to retrieve project activity' });
    }
  });

  // --- Real Git Integration ---
  app.get('/api/projects/:projectId/git/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const status = await GitService.getStatus(req.user!.userId, req.params.projectId);
      res.status(200).json(status);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch Git status' });
    }
  });

  app.post('/api/projects/:projectId/git/connect', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { repoUrl, token, defaultBranch } = req.body || {};
      if (!repoUrl) {
        res.status(400).json({ error: 'Repository URL or slug (owner/repo) is required' });
        return;
      }
      const connection = await GitService.connectRepository({
        userId: req.user!.userId,
        projectId: req.params.projectId,
        repoUrl,
        token,
        defaultBranch
      });
      res.status(200).json({ connection, message: 'Repository connected successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to connect repository' });
    }
  });

  app.post('/api/projects/:projectId/git/disconnect', requireAuth, (req: Request, res: Response): void => {
    try {
      GitService.disconnectRepository(req.user!.userId, req.params.projectId);
      res.status(200).json({ success: true, message: 'Git repository disconnected.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to disconnect repository' });
    }
  });

  app.post('/api/projects/:projectId/git/commit', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { message, branch } = req.body || {};
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Commit message is required' });
        return;
      }
      const commit = await GitService.createCommit({
        userId: req.user!.userId,
        projectId: req.params.projectId,
        message,
        branch
      });
      res.status(201).json({ commit, message: 'Commit published to remote repository successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to create Git commit' });
    }
  });

  app.post('/api/projects/:projectId/git/pull', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { branch } = req.body || {};
      const result = await GitService.pullRepository(req.user!.userId, req.params.projectId, branch);
      res.status(200).json({
        success: true,
        ...result,
        message: `Pulled ${result.filesUpdated} files from branch.`
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to pull repository' });
    }
  });

  // ==========================================
  // Centralized Error Handling Middleware
  // ==========================================
  app.use((err: any, req: Request, res: Response, next: any) => {
    const requestId = (req as any).id || 'unknown';
    console.error(`[Unhandled Error] [${requestId}] ${req.method} ${req.url}:`, err?.message || err);

    if (res.headersSent) {
      return next(err);
    }

    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal server error. Please try again later.' : (err.message || 'An unexpected error occurred'),
      code: err.code || 'SERVER_ERROR',
      requestId
    });
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Darkano AI Server] Operational on http://0.0.0.0:${PORT}`);

    // Schedule automated routine maintenance every 30 minutes
    const maintenanceInterval = setInterval(() => {
      try {
        const cleanedSessions = SystemMaintenanceService.cleanupExpiredSessions();
        const cleanedResets = SystemMaintenanceService.cleanupExpiredPasswordResets();
        const expiredInvitations = SystemMaintenanceService.cleanupExpiredInvitations();
        const expiredShareLinks = SystemMaintenanceService.cleanupExpiredShareLinks();
        if (cleanedSessions > 0 || cleanedResets > 0 || expiredInvitations > 0 || expiredShareLinks > 0) {
          console.log(`[Maintenance Routine] Expired items purged: sessions=${cleanedSessions}, resets=${cleanedResets}, invites=${expiredInvitations}, shareLinks=${expiredShareLinks}`);
        }
      } catch (err: any) {
        console.warn('[Maintenance Routine] Error executing scheduled cleanup:', err?.message);
      }
    }, 30 * 60 * 1000);

    if (maintenanceInterval.unref) {
      maintenanceInterval.unref();
    }
  });

  // Process Graceful Shutdown Handlers
  const gracefulShutdown = (signal: string) => {
    console.log(`[Darkano AI Server] Received ${signal}. Initiating graceful shutdown...`);
    server.close(() => {
      console.log('[Darkano AI Server] HTTP server closed cleanly.');
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (err) {
        console.warn('[Darkano AI Server] Checkpoint warning:', err);
      }
      process.exit(0);
    });

    // Forced termination fallback if connections remain open
    setTimeout(() => {
      console.error('[Darkano AI Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Global process error safety guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

startServer().catch(err => {
  console.error('[Darkano AI Server] Fatal startup error:', err);
  process.exit(1);
});
