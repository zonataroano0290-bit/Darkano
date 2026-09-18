import { GoogleGenAI } from '@google/genai';
import { EventEmitter } from 'node:events';
import { AgentTaskService } from '../db/agentTaskService.js';
import { ToolRegistry } from './toolRegistry.js';
import { ConversationService } from '../db/conversationService.js';
import {
  AgentTask,
  AgentTaskStep,
  AgentTaskEvent,
  CitationItem,
  PlannedStep
} from '../types.js';

interface ActiveTaskHandle {
  taskId: string;
  userId: string;
  abortController: AbortController;
  resumePromiseResolve?: () => void;
}

export class AgentEngine {
  private static taskEvents = new EventEmitter();
  private static activeTasks = new Map<string, ActiveTaskHandle>();

  // Safety loop thresholds
  public static readonly MAX_STEPS = 8;
  public static readonly MAX_EXECUTION_TIME_MS = 90000; // 90 seconds
  public static readonly MAX_TASK_CREDITS = 50;

  /**
   * Subscribe to real-time events for a specific task
   */
  static subscribeToEvents(taskId: string, listener: (event: AgentTaskEvent) => void): () => void {
    const channel = `task_${taskId}`;
    this.taskEvents.on(channel, listener);
    return () => {
      this.taskEvents.off(channel, listener);
    };
  }

  /**
   * Emit an event for a task
   */
  private static emitEvent(taskId: string, event: AgentTaskEvent) {
    this.taskEvents.emit(`task_${taskId}`, event);
  }

  /**
   * Create and launch a real multi-step task
   */
  static async startTask(params: {
    userId: string;
    conversationId?: string;
    prompt: string;
    modelId?: string;
    fileIds?: string[];
  }): Promise<AgentTask> {
    const { userId, conversationId, prompt, modelId = 'darkano-ultra-v2', fileIds } = params;

    // 1. Create task record in database
    const task = AgentTaskService.createTask({
      userId,
      conversationId,
      originalPrompt: prompt,
      modelId
    });

    const abortController = new AbortController();
    this.activeTasks.set(task.id, {
      taskId: task.id,
      userId,
      abortController
    });

    this.emitEvent(task.id, {
      event: 'task_created',
      taskId: task.id,
      task,
      timestamp: new Date().toISOString()
    });

    // Run execution loop asynchronously
    this.runTaskLifecycle(task.id, userId, conversationId, prompt, modelId, fileIds, abortController).catch(err => {
      console.error(`[Darkano AgentEngine] Error running task ${task.id}:`, err);
    });

    return task;
  }

  /**
   * Complete Task Execution Lifecycle
   */
  private static async runTaskLifecycle(
    taskId: string,
    userId: string,
    conversationId: string | undefined,
    prompt: string,
    modelId: string,
    fileIds: string[] | undefined,
    abortController: AbortController
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Planning Phase
      AgentTaskService.updateTask(taskId, { status: 'planning' });
      this.emitEvent(taskId, {
        event: 'planning_started',
        taskId,
        task: { status: 'planning' },
        timestamp: new Date().toISOString()
      });

      if (abortController.signal.aborted) {
        throw new Error('Task was cancelled before planning.');
      }

      const plan = await this.generatePlan(prompt, fileIds, abortController.signal);

      if (abortController.signal.aborted) {
        throw new Error('Task was cancelled after planning.');
      }

      // Save plan & create step records in database
      const createdSteps = AgentTaskService.createSteps(
        taskId,
        plan.map(p => ({
          sequence: p.sequence,
          action: p.action,
          tool: p.tool,
          input: (p as any).input
        }))
      );

      AgentTaskService.updateTask(taskId, {
        status: 'running',
        plan,
        totalSteps: plan.length,
        currentStep: 0
      });

      this.emitEvent(taskId, {
        event: 'plan_created',
        taskId,
        task: { status: 'running', plan, totalSteps: plan.length, currentStep: 0, steps: createdSteps },
        timestamp: new Date().toISOString()
      });

      // 2. Execution Loop
      const citations: CitationItem[] = [];
      const collectedStepOutputs: Array<{ action: string; tool?: string; output: any }> = [];
      let currentStepIndex = 0;
      let totalCreditsUsed = 0;

      while (currentStepIndex < createdSteps.length) {
        // Check cancellation
        if (abortController.signal.aborted) {
          throw new Error('Task execution was aborted by user.');
        }

        // Loop Protection Thresholds
        if (currentStepIndex >= this.MAX_STEPS) {
          throw new Error(`Task stopped: exceeded maximum allowable step limit (${this.MAX_STEPS}).`);
        }

        if (Date.now() - startTime >= this.MAX_EXECUTION_TIME_MS) {
          throw new Error(`Task stopped: execution duration exceeded limit (${this.MAX_EXECUTION_TIME_MS / 1000}s).`);
        }

        if (totalCreditsUsed >= this.MAX_TASK_CREDITS) {
          throw new Error(`Task stopped: credit consumption reached limit (${this.MAX_TASK_CREDITS} credits).`);
        }

        const step = createdSteps[currentStepIndex];
        const stepNum = currentStepIndex + 1;

        AgentTaskService.updateTask(taskId, { currentStep: stepNum });
        AgentTaskService.updateStep(step.id, {
          status: 'running',
          startedAt: new Date().toISOString()
        });

        this.emitEvent(taskId, {
          event: 'step_started',
          taskId,
          task: { currentStep: stepNum },
          step: { ...step, status: 'running' },
          timestamp: new Date().toISOString()
        });

        // 3. Human Approval Gate
        const toolDef = step.tool ? ToolRegistry.getTool(step.tool) : undefined;
        if (toolDef?.requiresApproval || (plan[currentStepIndex] && plan[currentStepIndex].requiresApproval)) {
          const approvalAction = {
            stepId: step.id,
            tool: step.tool || 'custom_action',
            action: step.action,
            input: step.input || {}
          };

          AgentTaskService.updateTask(taskId, {
            status: 'waiting_for_approval',
            requiresApproval: true,
            pendingApprovalAction: approvalAction
          });
          AgentTaskService.updateStep(step.id, { status: 'waiting_for_approval' });

          this.emitEvent(taskId, {
            event: 'approval_required',
            taskId,
            task: {
              status: 'waiting_for_approval',
              requiresApproval: true,
              pendingApprovalAction: approvalAction
            },
            step: { ...step, status: 'waiting_for_approval' },
            timestamp: new Date().toISOString()
          });

          // Pause execution until approved or cancelled
          await new Promise<void>((resolve, reject) => {
            const handle = this.activeTasks.get(taskId);
            if (handle) {
              handle.resumePromiseResolve = resolve;
            }
            abortController.signal.addEventListener('abort', () => {
              reject(new Error('Task was cancelled while waiting for approval.'));
            });
          });

          // Clear approval status
          AgentTaskService.updateTask(taskId, {
            status: 'running',
            requiresApproval: false,
            pendingApprovalAction: null
          });
        }

        // 4. Execute Real Tool if defined
        if (step.tool) {
          this.emitEvent(taskId, {
            event: 'tool_started',
            taskId,
            tool: { name: step.tool, status: 'running' },
            timestamp: new Date().toISOString()
          });

          // Resolve dynamic inputs using prior step outputs if needed
          const resolvedInput = this.resolveStepInput(step.input, collectedStepOutputs, prompt);

          const toolRes = await ToolRegistry.executeTool(step.tool, resolvedInput, {
            userId,
            taskId,
            stepId: step.id,
            conversationId,
            abortSignal: abortController.signal
          });

          totalCreditsUsed += toolRes.creditsCharged;
          AgentTaskService.updateTask(taskId, { creditsUsedIncrement: toolRes.creditsCharged });

          if (!toolRes.success) {
            // Real tool error encountered
            AgentTaskService.updateStep(step.id, {
              status: 'failed',
              error: toolRes.error,
              completedAt: new Date().toISOString()
            });

            this.emitEvent(taskId, {
              event: 'tool_completed',
              taskId,
              tool: {
                name: step.tool,
                status: 'failed',
                duration: toolRes.durationMs,
                creditsUsed: 0,
                error: toolRes.error
              },
              timestamp: new Date().toISOString()
            });

            // If a research tool failed because of lack of external configuration, record gracefully
            collectedStepOutputs.push({
              action: step.action,
              tool: step.tool,
              output: { error: toolRes.error }
            });
          } else {
            // Tool succeeded
            AgentTaskService.updateStep(step.id, {
              status: 'completed',
              output: toolRes.result,
              completedAt: new Date().toISOString()
            });

            // Harvest verified citations
            if (step.tool === 'web_search' && toolRes.result?.results) {
              for (const r of toolRes.result.results) {
                if (r.url && !citations.some(c => c.url === r.url)) {
                  citations.push({
                    title: r.title,
                    url: r.url,
                    domain: r.domain,
                    snippet: r.snippet
                  });
                }
              }
            } else if (step.tool === 'fetch_web_page' && toolRes.result?.url) {
              if (!citations.some(c => c.url === toolRes.result.url)) {
                citations.push({
                  title: toolRes.result.title || toolRes.result.domain,
                  url: toolRes.result.url,
                  domain: toolRes.result.domain
                });
              }
            }

            collectedStepOutputs.push({
              action: step.action,
              tool: step.tool,
              output: toolRes.result
            });

            this.emitEvent(taskId, {
              event: 'tool_completed',
              taskId,
              tool: {
                name: step.tool,
                status: 'succeeded',
                duration: toolRes.durationMs,
                creditsUsed: toolRes.creditsCharged
              },
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // Analytical non-tool step
          AgentTaskService.updateStep(step.id, {
            status: 'completed',
            output: { status: 'completed' },
            completedAt: new Date().toISOString()
          });
        }

        this.emitEvent(taskId, {
          event: 'step_completed',
          taskId,
          step: { ...step, status: 'completed', completedAt: new Date().toISOString() },
          timestamp: new Date().toISOString()
        });

        currentStepIndex++;
      }

      // 5. Synthesize Final Grounded Response
      const finalResult = await this.synthesizeFinalAnswer(
        prompt,
        collectedStepOutputs,
        citations,
        abortController.signal
      );

      const completedAt = new Date().toISOString();
      AgentTaskService.updateTask(taskId, {
        status: 'completed',
        result: finalResult,
        completedAt
      });

      // If tied to an active conversation, append the assistant response message
      if (conversationId) {
        try {
          ConversationService.saveMessage(userId, {
            conversationId,
            role: 'assistant',
            content: finalResult,
            mode: 'agent',
            model: modelId,
            status: 'ready'
          });
        } catch (err) {
          console.warn('[Darkano AgentEngine] Note: Failed to append message to conversation:', err);
        }
      }

      this.emitEvent(taskId, {
        event: 'task_completed',
        taskId,
        task: {
          status: 'completed',
          result: finalResult,
          completedAt,
          creditsUsed: totalCreditsUsed
        },
        result: finalResult,
        citations,
        timestamp: completedAt
      });
    } catch (err: any) {
      const isCancelled = abortController.signal.aborted || err?.message?.includes('cancelled') || err?.message?.includes('aborted');
      const finalStatus = isCancelled ? 'cancelled' : 'failed';
      const errorMsg = err?.message || 'Agent task failed unexpectedly.';

      AgentTaskService.updateTask(taskId, {
        status: finalStatus,
        error: errorMsg,
        completedAt: new Date().toISOString()
      });

      this.emitEvent(taskId, {
        event: isCancelled ? 'task_cancelled' : 'task_failed',
        taskId,
        task: { status: finalStatus, error: errorMsg },
        error: errorMsg,
        timestamp: new Date().toISOString()
      });
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Real LLM-driven multi-step planner
   */
  private static async generatePlan(
    prompt: string,
    fileIds: string[] | undefined,
    signal: AbortSignal
  ): Promise<PlannedStep[]> {
    const availableTools = ToolRegistry.getAllTools().filter(t => t.enabled);

    const toolsDescription = availableTools
      .map(t => `- ${t.name}: ${t.description} (Requires: ${t.permissionRequirement || 'none'})`)
      .join('\n');

    const planningPrompt = `You are Darkano Agent Planner, an autonomous multi-step task engine.
A user has requested:
"${prompt}"

Available server-side tools:
${toolsDescription}
${fileIds && fileIds.length > 0 ? `Uploaded files available: ${fileIds.join(', ')}` : ''}

CRITICAL RULES:
1. Deconstruct the user's request into 2 to 5 logical sequential steps.
2. For each step, identify if an available tool should be executed.
3. NEVER invent fake tools. Only use tools from the list above or set tool to null for analysis/synthesis.
4. If web information or current facts are needed, use 'web_search'.
5. If reading a specific website URL is required, use 'fetch_web_page'.
6. If analyzing an uploaded user file, use 'analyze_document' or 'retrieve_document_context'.
7. If image generation is requested, use 'generate_image'.
8. If deep synthetic reasoning is needed, use 'generate_text'.
9. Output JSON ONLY with this exact schema:
[
  {
    "sequence": 1,
    "action": "Brief human-readable description of what this step achieves",
    "tool": "tool_name_or_null",
    "input": { "argumentKey": "argumentValue" },
    "requiresApproval": false
  }
]`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback deterministic plan when no API key is configured
      return this.createDeterministicPlan(prompt, fileIds);
    }

    try {
      const client = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: planningPrompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 6).map((item, index) => ({
          sequence: index + 1,
          action: String(item.action || `Execute step ${index + 1}`),
          tool: item.tool && availableTools.some(t => t.name === item.tool) ? item.tool : undefined,
          input: item.input || {},
          requiresApproval: Boolean(item.requiresApproval)
        }));
      }
    } catch (planErr) {
      console.warn('[Darkano AgentEngine] LLM planning fallback triggered:', planErr);
    }

    return this.createDeterministicPlan(prompt, fileIds);
  }

  /**
   * Deterministic plan fallback for offline / immediate task initialization
   */
  private static createDeterministicPlan(prompt: string, fileIds?: string[]): PlannedStep[] {
    const lower = prompt.toLowerCase();
    const steps: PlannedStep[] = [];

    if (fileIds && fileIds.length > 0) {
      steps.push({
        sequence: 1,
        action: 'Inspect and extract context from uploaded user vault documents',
        tool: 'retrieve_document_context',
        input: { fileIds, query: prompt }
      });
      steps.push({
        sequence: 2,
        action: 'Perform cross-document analytical synthesis',
        tool: 'generate_text',
        input: { prompt: `Analyze the user documents in relation to: ${prompt}` }
      });
      steps.push({
        sequence: 3,
        action: 'Assemble verified findings and finalize answer'
      });
      return steps;
    }

    if (lower.includes('image') || lower.includes('draw') || lower.includes('picture') || lower.includes('render')) {
      steps.push({
        sequence: 1,
        action: 'Generate requested visual asset via generative imaging',
        tool: 'generate_image',
        input: { prompt, aspectRatio: '1:1' },
        requiresApproval: true
      });
      steps.push({
        sequence: 2,
        action: 'Compose final delivery description and metadata'
      });
      return steps;
    }

    if (
      lower.includes('search') ||
      lower.includes('latest') ||
      lower.includes('news') ||
      lower.includes('who is') ||
      lower.includes('what is') ||
      lower.includes('price') ||
      lower.includes('release date')
    ) {
      steps.push({
        sequence: 1,
        action: `Execute grounded live web search for: "${prompt.slice(0, 60)}"`,
        tool: 'web_search',
        input: { query: prompt, limit: 5 }
      });
      steps.push({
        sequence: 2,
        action: 'Synthesize verified search findings and cross-check facts',
        tool: 'generate_text',
        input: { prompt: `Synthesize the findings for: ${prompt}` }
      });
      steps.push({
        sequence: 3,
        action: 'Compose final authoritative response with grounded citations'
      });
      return steps;
    }

    // General multi-step reasoning task
    steps.push({
      sequence: 1,
      action: 'Deconstruct requirements and assess constraints',
      tool: 'generate_text',
      input: { prompt: `Plan and outline solution for: ${prompt}`, taskType: 'extraction' }
    });
    steps.push({
      sequence: 2,
      action: 'Conduct deep synthesis and implementation modeling',
      tool: 'generate_text',
      input: { prompt, taskType: 'synthesis' }
    });
    steps.push({
      sequence: 3,
      action: 'Finalize output and format structured response'
    });

    return steps;
  }

  /**
   * Helper to resolve dynamic inputs from prior step outputs
   */
  private static resolveStepInput(
    rawInput: any,
    priorOutputs: Array<{ action: string; tool?: string; output: any }>,
    originalPrompt: string
  ): any {
    if (!rawInput || typeof rawInput !== 'object') return rawInput;
    const resolved = { ...rawInput };

    // If context is empty but prior tool output exists, inject prior output
    if (resolved.context === undefined && priorOutputs.length > 0) {
      const lastOutput = priorOutputs[priorOutputs.length - 1];
      if (lastOutput?.output) {
        resolved.context =
          typeof lastOutput.output === 'string'
            ? lastOutput.output
            : JSON.stringify(lastOutput.output, null, 2);
      }
    }

    return resolved;
  }

  /**
   * Real LLM-driven final answer synthesis grounded in actual tool outputs
   */
  private static async synthesizeFinalAnswer(
    originalPrompt: string,
    collectedOutputs: Array<{ action: string; tool?: string; output: any }>,
    citations: CitationItem[],
    signal: AbortSignal
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;

    // Build untrusted data block
    const outputsFormatted = collectedOutputs
      .map((item, idx) => {
        const outStr =
          typeof item.output === 'string'
            ? item.output
            : JSON.stringify(item.output, null, 2);
        return `### Step ${idx + 1}: ${item.action} (${item.tool || 'Analysis'})\n<untrusted_external_content>\n${outStr.slice(0, 4000)}\n</untrusted_external_content>`;
      })
      .join('\n\n');

    const synthesisPrompt = `You are Darkano AI Multi-Step Agent.
The user asked:
"${originalPrompt}"

The following real steps were executed by the server-side agent engine:
${outputsFormatted}

CRITICAL DIRECTIVES:
1. Provide an authoritative, comprehensive, well-structured final answer to the user's request.
2. Ground your answer strictly in the evidence collected from the steps above.
3. If any step failed or tool reported missing configuration, be completely honest and transparent about what could not be gathered.
4. DO NOT invent citations or pretend external information was accessed if it was not.
5. Format with clear Markdown headings, bullet points, and code blocks where applicable.
6. ${citations.length > 0 ? `Include verified source references to the real grounded sources.` : ''}`;

    if (apiKey) {
      try {
        const client = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: synthesisPrompt,
          config: {
            temperature: 0.2,
            maxOutputTokens: 3000
          }
        });

        const text = response.text?.trim();
        if (text) return text;
      } catch (synthErr) {
        console.warn('[Darkano AgentEngine] Synthesis fallback triggered:', synthErr);
      }
    }

    // Fallback compilation if inference unavailable
    let fallback = `### Darkano Agent Task Execution Summary\n\n**Objective**: ${originalPrompt}\n\n`;
    for (let i = 0; i < collectedOutputs.length; i++) {
      const item = collectedOutputs[i];
      fallback += `#### Step ${i + 1}: ${item.action}\n`;
      if (item.output?.error) {
        fallback += `⚠️ *Note*: ${item.output.error}\n\n`;
      } else if (typeof item.output === 'object') {
        fallback += `\`\`\`json\n${JSON.stringify(item.output, null, 2).slice(0, 1000)}\n\`\`\`\n\n`;
      } else {
        fallback += `${item.output}\n\n`;
      }
    }

    if (citations.length > 0) {
      fallback += `\n### Verified Grounded Sources\n`;
      for (const c of citations) {
        fallback += `- [${c.title || c.domain}](${c.url})\n`;
      }
    }

    return fallback;
  }

  /**
   * Cancel an active task
   */
  static cancelTask(taskId: string, userId: string): boolean {
    const handle = this.activeTasks.get(taskId);
    const task = AgentTaskService.getTask(taskId, userId);
    if (!task) return false;

    if (handle) {
      handle.abortController.abort();
      this.activeTasks.delete(taskId);
    }

    AgentTaskService.updateTask(taskId, {
      status: 'cancelled',
      completedAt: new Date().toISOString()
    });

    this.emitEvent(taskId, {
      event: 'task_cancelled',
      taskId,
      task: { status: 'cancelled' },
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Approve a paused step in waiting_for_approval
   */
  static approveStep(taskId: string, userId: string): boolean {
    const task = AgentTaskService.getTask(taskId, userId);
    if (!task || task.status !== 'waiting_for_approval') return false;

    const handle = this.activeTasks.get(taskId);
    if (handle?.resumePromiseResolve) {
      handle.resumePromiseResolve();
      handle.resumePromiseResolve = undefined;
    }

    AgentTaskService.updateTask(taskId, {
      status: 'running',
      requiresApproval: false,
      pendingApprovalAction: null
    });

    this.emitEvent(taskId, {
      event: 'task_resumed',
      taskId,
      task: { status: 'running', requiresApproval: false, pendingApprovalAction: null },
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Retry a failed task
   */
  static async retryTask(taskId: string, userId: string): Promise<AgentTask | null> {
    const existing = AgentTaskService.getTask(taskId, userId);
    if (!existing || (existing.status !== 'failed' && existing.status !== 'cancelled')) {
      return null;
    }

    return this.startTask({
      userId,
      conversationId: existing.conversationId,
      prompt: existing.originalPrompt,
      modelId: existing.modelId
    });
  }
}
