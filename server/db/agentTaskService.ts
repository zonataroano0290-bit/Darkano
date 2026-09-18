import crypto from 'node:crypto';
import { db } from './database.js';
import {
  AgentTask,
  AgentTaskStep,
  AgentTaskStatus,
  AgentStepStatus,
  PlannedStep,
  ToolExecutionRecord
} from '../types.js';

export class AgentTaskService {
  /**
   * Create a new database-backed task
   */
  static createTask(params: {
    userId: string;
    conversationId?: string;
    originalPrompt: string;
    modelId?: string;
  }): AgentTask {
    const { userId, conversationId, originalPrompt, modelId = 'darkano-ultra-v2' } = params;
    const id = `task_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (
        id, userId, conversationId, originalPrompt, status, planJson,
        currentStep, totalSteps, result, error, requiresApproval,
        pendingApprovalAction, modelId, creditsUsed, createdAt, updatedAt, completedAt
      ) VALUES (?, ?, ?, ?, 'queued', '[]', 0, 0, NULL, NULL, 0, NULL, ?, 0, ?, ?, NULL)
    `).run(id, userId, conversationId || null, originalPrompt, modelId, now, now);

    return {
      id,
      userId,
      conversationId: conversationId || undefined,
      originalPrompt,
      status: 'queued',
      plan: [],
      currentStep: 0,
      totalSteps: 0,
      modelId,
      creditsUsed: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Retrieve task with user data isolation check
   */
  static getTask(taskId: string, userId?: string): AgentTask | null {
    const query = userId
      ? `SELECT * FROM tasks WHERE id = ? AND userId = ?`
      : `SELECT * FROM tasks WHERE id = ?`;

    const row = (userId ? db.prepare(query).get(taskId, userId) : db.prepare(query).get(taskId)) as any;
    if (!row) return null;

    let plan: PlannedStep[] = [];
    try {
      if (row.planJson) plan = JSON.parse(row.planJson);
    } catch {}

    let pendingApprovalAction = null;
    try {
      if (row.pendingApprovalAction) pendingApprovalAction = JSON.parse(row.pendingApprovalAction);
    } catch {}

    const steps = this.getSteps(taskId);

    return {
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId || undefined,
      originalPrompt: row.originalPrompt,
      status: row.status as AgentTaskStatus,
      plan,
      currentStep: row.currentStep,
      totalSteps: row.totalSteps,
      result: row.result || undefined,
      error: row.error || undefined,
      requiresApproval: Boolean(row.requiresApproval),
      pendingApprovalAction,
      modelId: row.modelId || undefined,
      creditsUsed: row.creditsUsed || 0,
      steps,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt || undefined
    };
  }

  /**
   * Update task state and progress
   */
  static updateTask(
    taskId: string,
    updates: {
      status?: AgentTaskStatus;
      plan?: PlannedStep[];
      currentStep?: number;
      totalSteps?: number;
      result?: string;
      error?: string;
      requiresApproval?: boolean;
      pendingApprovalAction?: any;
      creditsUsedIncrement?: number;
      completedAt?: string;
    }
  ): void {
    const existing = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;
    if (!existing) return;

    const now = new Date().toISOString();
    const newStatus = updates.status !== undefined ? updates.status : existing.status;
    const newPlanJson = updates.plan !== undefined ? JSON.stringify(updates.plan) : existing.planJson;
    const newCurrentStep = updates.currentStep !== undefined ? updates.currentStep : existing.currentStep;
    const newTotalSteps = updates.totalSteps !== undefined ? updates.totalSteps : existing.totalSteps;
    const newResult = updates.result !== undefined ? updates.result : existing.result;
    const newError = updates.error !== undefined ? updates.error : existing.error;
    const newRequiresApproval =
      updates.requiresApproval !== undefined ? (updates.requiresApproval ? 1 : 0) : existing.requiresApproval;
    const newPendingApprovalAction =
      updates.pendingApprovalAction !== undefined
        ? updates.pendingApprovalAction
          ? JSON.stringify(updates.pendingApprovalAction)
          : null
        : existing.pendingApprovalAction;
    const newCredits = (existing.creditsUsed || 0) + (updates.creditsUsedIncrement || 0);
    const newCompletedAt = updates.completedAt !== undefined ? updates.completedAt : existing.completedAt;

    db.prepare(`
      UPDATE tasks SET
        status = ?, planJson = ?, currentStep = ?, totalSteps = ?,
        result = ?, error = ?, requiresApproval = ?, pendingApprovalAction = ?,
        creditsUsed = ?, updatedAt = ?, completedAt = ?
      WHERE id = ?
    `).run(
      newStatus,
      newPlanJson,
      newCurrentStep,
      newTotalSteps,
      newResult,
      newError,
      newRequiresApproval,
      newPendingApprovalAction,
      newCredits,
      now,
      newCompletedAt,
      taskId
    );
  }

  /**
   * Create steps for a task
   */
  static createSteps(
    taskId: string,
    steps: Array<{ sequence: number; action: string; tool?: string; input?: any }>
  ): AgentTaskStep[] {
    const insertStep = db.prepare(`
      INSERT INTO task_steps (
        id, taskId, sequence, action, tool, inputJson, outputJson, status, error, startedAt, completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, NULL)
    `);

    const resultSteps: AgentTaskStep[] = [];

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const step of steps) {
        const id = `step_${crypto.randomUUID().replace(/-/g, '')}`;
        const inputJson = step.input ? JSON.stringify(step.input) : null;
        insertStep.run(id, taskId, step.sequence, step.action, step.tool || null, inputJson);
        resultSteps.push({
          id,
          taskId,
          sequence: step.sequence,
          action: step.action,
          tool: step.tool,
          input: step.input,
          status: 'pending'
        });
      }
      db.exec('COMMIT');
      return resultSteps;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  /**
   * Get all steps for a task
   */
  static getSteps(taskId: string): AgentTaskStep[] {
    const rows = db.prepare(`
      SELECT * FROM task_steps WHERE taskId = ? ORDER BY sequence ASC
    `).all(taskId) as any[];

    return rows.map(r => {
      let input = undefined;
      let output = undefined;
      try {
        if (r.inputJson) input = JSON.parse(r.inputJson);
      } catch {}
      try {
        if (r.outputJson) output = JSON.parse(r.outputJson);
      } catch {}

      return {
        id: r.id,
        taskId: r.taskId,
        sequence: r.sequence,
        action: r.action,
        tool: r.tool || undefined,
        input,
        output,
        status: r.status as AgentStepStatus,
        error: r.error || undefined,
        startedAt: r.startedAt || undefined,
        completedAt: r.completedAt || undefined
      };
    });
  }

  /**
   * Update step status and result
   */
  static updateStep(
    stepId: string,
    updates: {
      status?: AgentStepStatus;
      output?: any;
      error?: string;
      startedAt?: string;
      completedAt?: string;
    }
  ): void {
    const existing = db.prepare(`SELECT * FROM task_steps WHERE id = ?`).get(stepId) as any;
    if (!existing) return;

    const newStatus = updates.status !== undefined ? updates.status : existing.status;
    const newOutputJson = updates.output !== undefined ? JSON.stringify(updates.output) : existing.outputJson;
    const newError = updates.error !== undefined ? updates.error : existing.error;
    const newStartedAt = updates.startedAt !== undefined ? updates.startedAt : existing.startedAt;
    const newCompletedAt = updates.completedAt !== undefined ? updates.completedAt : existing.completedAt;

    db.prepare(`
      UPDATE task_steps SET
        status = ?, outputJson = ?, error = ?, startedAt = ?, completedAt = ?
      WHERE id = ?
    `).run(newStatus, newOutputJson, newError, newStartedAt, newCompletedAt, stepId);
  }

  /**
   * Record real tool execution in ledger
   */
  static recordToolExecution(params: {
    taskId?: string;
    stepId?: string;
    userId: string;
    toolName: string;
    input?: any;
    output?: any;
    status: 'running' | 'succeeded' | 'failed' | 'cancelled';
    error?: string;
    duration: number;
    creditsUsed: number;
  }): ToolExecutionRecord {
    const id = `exec_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    // Sanitize input/output so secrets/tokens are never stored
    const sanitize = (obj: any): any => {
      if (!obj) return obj;
      if (typeof obj !== 'object') return obj;
      const clone = Array.isArray(obj) ? [...obj] : { ...obj };
      for (const key of Object.keys(clone)) {
        const lower = key.toLowerCase();
        if (
          lower.includes('key') ||
          lower.includes('secret') ||
          lower.includes('token') ||
          lower.includes('password') ||
          lower.includes('authorization')
        ) {
          clone[key] = '[REDACTED_SENSITIVE]';
        } else if (typeof clone[key] === 'object') {
          clone[key] = sanitize(clone[key]);
        }
      }
      return clone;
    };

    const safeInput = sanitize(params.input);
    const safeOutput = sanitize(params.output);

    db.prepare(`
      INSERT INTO tool_executions (
        id, taskId, stepId, userId, toolName, inputJson, outputJson,
        status, error, duration, creditsUsed, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.taskId || null,
      params.stepId || null,
      params.userId,
      params.toolName,
      safeInput ? JSON.stringify(safeInput) : null,
      safeOutput ? JSON.stringify(safeOutput) : null,
      params.status,
      params.error || null,
      params.duration,
      params.creditsUsed,
      now
    );

    return {
      id,
      taskId: params.taskId,
      stepId: params.stepId,
      userId: params.userId,
      toolName: params.toolName,
      input: safeInput,
      output: safeOutput,
      status: params.status,
      error: params.error,
      duration: params.duration,
      creditsUsed: params.creditsUsed,
      createdAt: now
    };
  }

  /**
   * Get all tool executions for a task
   */
  static getToolExecutions(taskId: string): ToolExecutionRecord[] {
    const rows = db.prepare(`
      SELECT * FROM tool_executions WHERE taskId = ? ORDER BY createdAt ASC
    `).all(taskId) as any[];

    return rows.map(r => {
      let input = undefined;
      let output = undefined;
      try {
        if (r.inputJson) input = JSON.parse(r.inputJson);
      } catch {}
      try {
        if (r.outputJson) output = JSON.parse(r.outputJson);
      } catch {}

      return {
        id: r.id,
        taskId: r.taskId || undefined,
        stepId: r.stepId || undefined,
        userId: r.userId,
        toolName: r.toolName,
        input,
        output,
        status: r.status,
        error: r.error || undefined,
        duration: r.duration,
        creditsUsed: r.creditsUsed,
        createdAt: r.createdAt
      };
    });
  }

  /**
   * List user tasks with pagination
   */
  static listUserTasks(userId: string, limit = 20, offset = 0): { tasks: AgentTask[]; total: number } {
    const countRow = db.prepare(`SELECT COUNT(id) as count FROM tasks WHERE userId = ?`).get(userId) as {
      count: number;
    };
    const rows = db.prepare(`
      SELECT * FROM tasks WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?
    `).all(userId, limit, offset) as any[];

    const tasks: AgentTask[] = rows.map(r => {
      let plan: PlannedStep[] = [];
      try {
        if (r.planJson) plan = JSON.parse(r.planJson);
      } catch {}

      return {
        id: r.id,
        userId: r.userId,
        conversationId: r.conversationId || undefined,
        originalPrompt: r.originalPrompt,
        status: r.status as AgentTaskStatus,
        plan,
        currentStep: r.currentStep,
        totalSteps: r.totalSteps,
        result: r.result || undefined,
        error: r.error || undefined,
        requiresApproval: Boolean(r.requiresApproval),
        modelId: r.modelId || undefined,
        creditsUsed: r.creditsUsed || 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        completedAt: r.completedAt || undefined
      };
    });

    return {
      tasks,
      total: countRow?.count || 0
    };
  }
}
