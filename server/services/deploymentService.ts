import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.js';
import { ProjectService } from '../db/projectService.js';
import { ProjectBuildService } from './projectBuildService.js';
import { CreditService } from './creditService.js';
import { DeploymentProviderRegistry } from '../providers/deployment/providerRegistry.js';
import {
  DeploymentRecord,
  DeploymentLogRecord,
  DeploymentEnvVarRecord,
  DeploymentEnvironment,
  DeploymentStatus,
  DeploymentHealthStatus
} from '../types.js';

// Secret key for AES encryption of environment variables
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'darkano-prod-vault-key-salt-9821').digest();
const IV_LENGTH = 16;

function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptSecret(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return '';
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

export class DeploymentService {
  /**
   * Log an event to deployment_logs table
   */
  static logEvent(deploymentId: string, level: 'info' | 'warn' | 'error' | 'system', message: string): void {
    try {
      db.prepare(`
        INSERT INTO deployment_logs (id, deploymentId, level, message, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        `dlog_${crypto.randomUUID().replace(/-/g, '')}`,
        deploymentId,
        level,
        message,
        new Date().toISOString()
      );
    } catch (err) {
      console.error('[DeploymentService] Log write error:', err);
    }
  }

  /**
   * Create and trigger a real project deployment
   */
  static async createDeployment(params: {
    userId: string;
    projectId: string;
    snapshotId?: string;
    environment?: DeploymentEnvironment;
    providerName?: string;
  }): Promise<DeploymentRecord> {
    const { userId, projectId, providerName } = params;
    const environment: DeploymentEnvironment = params.environment || 'production';

    // 1. Verify project ownership
    const project = ProjectService.verifyOwnership(userId, projectId);

    // 2. Concurrency check: reject if another deployment is currently active
    const activeDeployment = db.prepare(`
      SELECT id, status FROM deployments
      WHERE projectId = ? AND status IN ('queued', 'building', 'deploying')
      ORDER BY createdAt DESC LIMIT 1
    `).get(projectId) as { id: string; status: string } | undefined;

    if (activeDeployment) {
      throw new Error(
        `A deployment is already active for this project (ID: ${activeDeployment.id}, Status: ${activeDeployment.status}). Please wait for it to finish or stop it.`
      );
    }

    // 3. Provider Check
    const provider = DeploymentProviderRegistry.getActiveProvider(providerName);
    if (!provider.isConfigured()) {
      throw new Error(
        'Deployment provider is not configured. Configure VERCEL_TOKEN, NETLIFY_TOKEN, or CLOUDFLARE_API_TOKEN in server environment variables to enable real cloud deployment.'
      );
    }

    // 4. Resolve snapshot for deterministic deployment
    let snapshotId = params.snapshotId;
    if (!snapshotId) {
      // Auto-create snapshot of current project files for strict rollback integrity
      const snapshot = ProjectService.createSnapshot(
        userId,
        projectId,
        `Auto-snapshot for ${environment} deployment (${new Date().toLocaleString()})`
      );
      snapshotId = snapshot.id;
    } else {
      const snap = db.prepare(`
        SELECT id FROM project_snapshots WHERE id = ? AND projectId = ?
      `).get(snapshotId, projectId);
      if (!snap) {
        throw new Error('Specified snapshot not found for this project.');
      }
    }

    // 5. Check user credits and deduct
    const DEPLOYMENT_CREDIT_COST = environment === 'production' ? 15 : 5;
    const currentBalance = CreditService.getBalance(userId);
    if (currentBalance < DEPLOYMENT_CREDIT_COST) {
      throw new Error(
        `Insufficient credits for ${environment} deployment. Required: ${DEPLOYMENT_CREDIT_COST} credits, Available: ${currentBalance} credits.`
      );
    }

    const deploymentId = `dep_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    // Deduct credits with idempotency key
    CreditService.deductCredits({
      userId,
      amount: DEPLOYMENT_CREDIT_COST,
      type: 'deployment_usage',
      source: `${environment}_deployment`,
      idempotencyKey: `dep_tx_${deploymentId}`
    });

    // 6. Insert initial deployment record in state 'queued'
    db.prepare(`
      INSERT INTO deployments (
        id, projectId, userId, snapshotId, environment, provider,
        status, deploymentUrl, buildId, logsReference, errorMessage,
        healthStatus, creditsDeducted, durationMs, createdAt, startedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deploymentId,
      projectId,
      userId,
      snapshotId,
      environment,
      provider.name,
      'queued',
      null,
      null,
      `ref_${deploymentId}`,
      null,
      'unknown',
      DEPLOYMENT_CREDIT_COST,
      0,
      now,
      now
    );

    this.logEvent(deploymentId, 'system', `Deployment record initialized [ID: ${deploymentId}, Env: ${environment}, Provider: ${provider.displayName}].`);

    // Execute pipeline asynchronously so client can track status immediately
    this.executeDeploymentPipeline(deploymentId, userId, projectId, snapshotId, environment, provider, DEPLOYMENT_CREDIT_COST).catch(err => {
      console.error(`[DeploymentService] Unhandled pipeline error for ${deploymentId}:`, err);
    });

    return this.getDeployment(userId, projectId, deploymentId);
  }

  /**
   * Background deployment pipeline with real build verification and hosting deployment
   */
  private static async executeDeploymentPipeline(
    deploymentId: string,
    userId: string,
    projectId: string,
    snapshotId: string,
    environment: DeploymentEnvironment,
    provider: any,
    creditsDeducted: number
  ): Promise<void> {
    const startTime = Date.now();

    const updateStatus = (
      status: DeploymentStatus,
      extra: {
        buildId?: string | null;
        deploymentUrl?: string | null;
        errorMessage?: string | null;
        healthStatus?: DeploymentHealthStatus;
        completedAt?: string | null;
      } = {}
    ) => {
      const durationMs = Date.now() - startTime;
      db.prepare(`
        UPDATE deployments
        SET status = ?,
            buildId = COALESCE(?, buildId),
            deploymentUrl = COALESCE(?, deploymentUrl),
            errorMessage = ?,
            healthStatus = COALESCE(?, healthStatus),
            completedAt = ?,
            durationMs = ?
        WHERE id = ?
      `).run(
        status,
        extra.buildId ?? null,
        extra.deploymentUrl ?? null,
        extra.errorMessage ?? null,
        extra.healthStatus ?? null,
        extra.completedAt ?? null,
        durationMs,
        deploymentId
      );
    };

    try {
      // Step A: Building
      updateStatus('building');
      this.logEvent(deploymentId, 'system', `Step 1/3: Executing project build in isolated sandbox...`);

      const buildResult = await ProjectBuildService.runBuild(userId, projectId);
      this.logEvent(deploymentId, 'info', `Build completed in ${buildResult.durationMs}ms with status: ${buildResult.status}`);

      if (buildResult.status !== 'success') {
        const errorDetail = buildResult.errors || 'Compilation failed';
        this.logEvent(deploymentId, 'error', `Build failed: ${errorDetail}`);
        updateStatus('failed', {
          buildId: buildResult.id,
          errorMessage: `Build failed: ${errorDetail}`,
          completedAt: new Date().toISOString()
        });

        // Refund credits automatically on build failure
        this.logEvent(deploymentId, 'warn', `Refunding ${creditsDeducted} credits due to build failure...`);
        CreditService.addCredits({
          userId,
          amount: creditsDeducted,
          type: 'refund',
          source: 'deployment_build_failure_refund',
          metadata: { deploymentId, reason: 'Build failed before deployment' }
        });
        return;
      }

      this.logEvent(deploymentId, 'system', `Step 1/3: Build succeeded (Build ID: ${buildResult.id}).`);

      // Step B: Deploying
      updateStatus('deploying', { buildId: buildResult.id });
      this.logEvent(deploymentId, 'system', `Step 2/3: Deploying build artifacts to ${provider.displayName}...`);

      // Load project files
      const files = ProjectService.listFiles(userId, projectId);

      // Load environment variables for this specific environment
      const envVars = this.getDecryptedEnvVars(projectId, environment);

      const project = ProjectService.getProject(userId, projectId);

      // Call Provider
      const result = await provider.deploy({
        deploymentId,
        projectId,
        userId,
        projectName: project.name,
        environment,
        files,
        envVars
      });

      // Write provider logs
      for (const logItem of result.logs || []) {
        this.logEvent(deploymentId, logItem.level, logItem.message);
      }

      if (!result.success || !result.deploymentUrl) {
        const failureReason = result.error || 'Hosting provider failed to deploy application';
        this.logEvent(deploymentId, 'error', `Deployment failed: ${failureReason}`);
        updateStatus('failed', {
          buildId: buildResult.id,
          errorMessage: failureReason,
          completedAt: new Date().toISOString()
        });

        // Refund credits on provider failure
        this.logEvent(deploymentId, 'warn', `Refunding ${creditsDeducted} credits due to provider failure...`);
        CreditService.addCredits({
          userId,
          amount: creditsDeducted,
          type: 'refund',
          source: 'deployment_provider_failure_refund',
          metadata: { deploymentId, reason: failureReason }
        });
        return;
      }

      // Step C: Confirm Running & Perform initial health check
      this.logEvent(deploymentId, 'system', `Step 3/3: Verifying runtime availability at ${result.deploymentUrl}...`);

      let initialHealth: DeploymentHealthStatus = 'unknown';
      if (provider.checkHealth) {
        try {
          const health = await provider.checkHealth(result.deploymentUrl);
          initialHealth = health.status;
          this.logEvent(
            deploymentId,
            initialHealth === 'healthy' ? 'info' : 'warn',
            `Initial health check returned ${initialHealth.toUpperCase()} (latency: ${health.latencyMs ?? 0}ms)`
          );
        } catch {
          initialHealth = 'unknown';
        }
      }

      updateStatus('running', {
        buildId: buildResult.id,
        deploymentUrl: result.deploymentUrl,
        healthStatus: initialHealth,
        completedAt: new Date().toISOString()
      });

      this.logEvent(deploymentId, 'system', `Deployment operational and verified running at: ${result.deploymentUrl}`);
    } catch (err: any) {
      this.logEvent(deploymentId, 'error', `Fatal deployment exception: ${err?.message || 'Unknown error'}`);
      updateStatus('failed', {
        errorMessage: err?.message || 'Deployment execution exception',
        completedAt: new Date().toISOString()
      });

      // Refund credits
      CreditService.addCredits({
        userId,
        amount: creditsDeducted,
        type: 'refund',
        source: 'deployment_fatal_error_refund',
        metadata: { deploymentId, error: err?.message }
      });
    }
  }

  /**
   * Get single deployment record
   */
  static getDeployment(userId: string, projectId: string, deploymentId: string): DeploymentRecord {
    ProjectService.verifyOwnership(userId, projectId);
    const row = db.prepare(`
      SELECT * FROM deployments WHERE id = ? AND projectId = ? AND userId = ?
    `).get(deploymentId, projectId, userId) as any;

    if (!row) {
      throw new Error(`Deployment "${deploymentId}" not found.`);
    }

    return this.mapDeploymentRow(row);
  }

  /**
   * List all deployments for a project
   */
  static listDeployments(userId: string, projectId: string): DeploymentRecord[] {
    ProjectService.verifyOwnership(userId, projectId);
    const rows = db.prepare(`
      SELECT * FROM deployments WHERE projectId = ? AND userId = ? ORDER BY createdAt DESC
    `).all(projectId, userId) as any[];

    return rows.map(this.mapDeploymentRow);
  }

  /**
   * Get chronological logs for a deployment
   */
  static getDeploymentLogs(userId: string, projectId: string, deploymentId: string): DeploymentLogRecord[] {
    ProjectService.verifyOwnership(userId, projectId);

    const dep = db.prepare(`
      SELECT id FROM deployments WHERE id = ? AND projectId = ? AND userId = ?
    `).get(deploymentId, projectId, userId);

    if (!dep) {
      throw new Error('Deployment not found');
    }

    const rows = db.prepare(`
      SELECT * FROM deployment_logs WHERE deploymentId = ? ORDER BY timestamp ASC
    `).all(deploymentId) as any[];

    return rows.map(r => ({
      id: r.id,
      deploymentId: r.deploymentId,
      level: r.level,
      message: r.message,
      timestamp: r.timestamp
    }));
  }

  /**
   * Perform a real HTTP health check against a running deployment
   */
  static async runHealthCheck(
    userId: string,
    projectId: string,
    deploymentId: string
  ): Promise<{ healthStatus: DeploymentHealthStatus; statusCode?: number; latencyMs?: number; error?: string }> {
    const dep = this.getDeployment(userId, projectId, deploymentId);

    if (!dep.deploymentUrl) {
      return { healthStatus: 'unknown', error: 'Deployment has no public URL configured.' };
    }

    const startTime = Date.now();
    try {
      const res = await fetch(dep.deploymentUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Darkano-AI-Health-Checker/1.0'
        }
      });

      const latencyMs = Date.now() - startTime;
      const isHealthy = res.status >= 200 && res.status < 400;
      const healthStatus: DeploymentHealthStatus = isHealthy ? 'healthy' : 'unhealthy';

      db.prepare(`
        UPDATE deployments SET healthStatus = ? WHERE id = ?
      `).run(healthStatus, deploymentId);

      this.logEvent(
        deploymentId,
        isHealthy ? 'info' : 'warn',
        `[HEALTH_CHECK] Result: ${healthStatus.toUpperCase()} (HTTP ${res.status}, latency: ${latencyMs}ms)`
      );

      return {
        healthStatus,
        statusCode: res.status,
        latencyMs,
        error: isHealthy ? undefined : `HTTP ${res.status} ${res.statusText}`
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      db.prepare(`
        UPDATE deployments SET healthStatus = 'unhealthy' WHERE id = ?
      `).run(deploymentId);

      this.logEvent(deploymentId, 'error', `[HEALTH_CHECK] Failed: ${err?.message || 'Timeout'}`);

      return {
        healthStatus: 'unhealthy',
        latencyMs,
        error: err?.message || 'Connection timeout or network error'
      };
    }
  }

  /**
   * Cancel an in-progress deployment
   */
  static async cancelDeployment(userId: string, projectId: string, deploymentId: string): Promise<{ success: boolean; message: string }> {
    const dep = this.getDeployment(userId, projectId, deploymentId);

    if (!['queued', 'building', 'deploying'].includes(dep.status)) {
      throw new Error(`Cannot cancel deployment in status "${dep.status}".`);
    }

    db.prepare(`
      UPDATE deployments SET status = 'cancelled', completedAt = ? WHERE id = ?
    `).run(new Date().toISOString(), deploymentId);

    this.logEvent(deploymentId, 'warn', 'Deployment cancelled by user.');

    // Refund credits
    if (dep.creditsDeducted > 0) {
      CreditService.addCredits({
        userId,
        amount: dep.creditsDeducted,
        type: 'refund',
        source: 'deployment_cancellation_refund',
        metadata: { deploymentId }
      });
    }

    return { success: true, message: 'Deployment cancelled successfully.' };
  }

  /**
   * Stop a running deployment
   */
  static stopDeployment(userId: string, projectId: string, deploymentId: string): { success: boolean; message: string } {
    const dep = this.getDeployment(userId, projectId, deploymentId);

    if (dep.status !== 'running') {
      throw new Error(`Deployment is not currently running (status: ${dep.status}).`);
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE deployments SET status = 'stopped', stoppedAt = ?, completedAt = ? WHERE id = ?
    `).run(now, now, deploymentId);

    this.logEvent(deploymentId, 'warn', 'Deployment stopped.');

    return { success: true, message: 'Deployment stopped.' };
  }

  /**
   * Rollback project files to snapshot associated with target deployment and trigger deploy
   */
  static async rollbackToDeployment(userId: string, projectId: string, targetDeploymentId: string): Promise<DeploymentRecord> {
    const targetDep = this.getDeployment(userId, projectId, targetDeploymentId);

    if (!targetDep.snapshotId) {
      throw new Error('Target deployment does not have an associated snapshot for rollback.');
    }

    // 1. Rollback project files
    ProjectService.rollbackSnapshot(userId, projectId, targetDep.snapshotId);

    // 2. Trigger new deployment of the restored state
    return this.createDeployment({
      userId,
      projectId,
      snapshotId: targetDep.snapshotId,
      environment: targetDep.environment,
      providerName: targetDep.provider
    });
  }

  /**
   * Scoped Environment Variables Management
   */
  static listScopedEnvVars(userId: string, projectId: string, environment: DeploymentEnvironment): DeploymentEnvVarRecord[] {
    ProjectService.verifyOwnership(userId, projectId);

    const rows = db.prepare(`
      SELECT id, projectId, environment, key, createdAt, updatedAt
      FROM deployment_environments
      WHERE projectId = ? AND environment = ?
      ORDER BY key ASC
    `).all(projectId, environment) as any[];

    return rows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      environment: r.environment,
      key: r.key,
      isConfigured: true,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  }

  static setScopedEnvVar(userId: string, projectId: string, environment: DeploymentEnvironment, key: string, value: string): void {
    ProjectService.verifyOwnership(userId, projectId);

    if (!key || typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key.trim())) {
      throw new Error('Invalid environment variable name. Must start with letter or underscore and contain only alphanumeric characters.');
    }

    const cleanKey = key.trim();
    const encrypted = encryptSecret(value);
    const now = new Date().toISOString();
    const id = `denv_${crypto.randomUUID().replace(/-/g, '')}`;

    db.prepare(`
      INSERT INTO deployment_environments (id, projectId, environment, key, valueEncrypted, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(projectId, environment, key) DO UPDATE SET
        valueEncrypted = excluded.valueEncrypted,
        updatedAt = excluded.updatedAt
    `).run(id, projectId, environment, cleanKey, encrypted, now, now);
  }

  static deleteScopedEnvVar(userId: string, projectId: string, environment: DeploymentEnvironment, key: string): void {
    ProjectService.verifyOwnership(userId, projectId);
    db.prepare(`
      DELETE FROM deployment_environments
      WHERE projectId = ? AND environment = ? AND key = ?
    `).run(projectId, environment, key);
  }

  private static getDecryptedEnvVars(projectId: string, environment: DeploymentEnvironment): Record<string, string> {
    const rows = db.prepare(`
      SELECT key, valueEncrypted FROM deployment_environments
      WHERE projectId = ? AND environment = ?
    `).all(projectId, environment) as Array<{ key: string; valueEncrypted: string }>;

    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = decryptSecret(r.valueEncrypted);
    }
    return result;
  }

  /**
   * Preview Sandbox Lifecycle Management
   */
  static getPreviewStatus(userId: string, projectId: string): {
    status: 'Running' | 'Stopped' | 'Unavailable';
    previewUrl: string;
    hasBuildArtifacts: boolean;
  } {
    ProjectService.verifyOwnership(userId, projectId);
    const sandboxDir = path.join(process.cwd(), 'data', 'sandboxes', projectId);
    const hasDist = fs.existsSync(path.join(sandboxDir, 'dist', 'index.html'));
    const hasHtml = fs.existsSync(path.join(sandboxDir, 'index.html'));

    const previewUrl = `/api/projects/${projectId}/preview/index.html`;

    if (hasDist || hasHtml) {
      return {
        status: 'Running',
        previewUrl,
        hasBuildArtifacts: true
      };
    }

    return {
      status: 'Unavailable',
      previewUrl,
      hasBuildArtifacts: false
    };
  }

  static stopPreview(userId: string, projectId: string): { status: 'Stopped'; message: string } {
    ProjectService.verifyOwnership(userId, projectId);
    const sandboxDir = path.join(process.cwd(), 'data', 'sandboxes', projectId);
    const distPath = path.join(sandboxDir, 'dist');
    if (fs.existsSync(distPath)) {
      try {
        fs.rmSync(distPath, { recursive: true, force: true });
      } catch (err) {
        console.error('[DeploymentService] Failed to clean sandbox dist:', err);
      }
    }
    return {
      status: 'Stopped',
      message: 'Preview runtime stopped and sandbox build artifacts cleaned.'
    };
  }

  private static mapDeploymentRow(row: any): DeploymentRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      userId: row.userId,
      snapshotId: row.snapshotId,
      environment: row.environment,
      provider: row.provider,
      status: row.status,
      deploymentUrl: row.deploymentUrl,
      buildId: row.buildId,
      logsReference: row.logsReference,
      errorMessage: row.errorMessage,
      healthStatus: row.healthStatus,
      creditsDeducted: row.creditsDeducted || 0,
      durationMs: row.durationMs || 0,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      stoppedAt: row.stoppedAt
    };
  }
}
