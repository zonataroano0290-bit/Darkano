import React, { useState } from 'react';
import {
  Workflow,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Square,
  ShieldAlert,
  Search,
  Globe,
  FileText,
  Sparkles,
  Image as ImageIcon,
  Cpu,
  Coins
} from 'lucide-react';
import { AgentTask, AgentTaskStep, PlannedStep } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';

interface AgentTaskCardProps {
  task: AgentTask;
  onApprove?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
}

export const AgentTaskCard: React.FC<AgentTaskCardProps> = ({
  task,
  onApprove,
  onCancel,
  onRetry
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  const getToolIcon = (toolName?: string) => {
    switch (toolName) {
      case 'web_search':
        return <Search className="w-3.5 h-3.5 text-purple-400" />;
      case 'fetch_web_page':
        return <Globe className="w-3.5 h-3.5 text-blue-400" />;
      case 'analyze_document':
      case 'retrieve_document_context':
        return <FileText className="w-3.5 h-3.5 text-amber-400" />;
      case 'generate_image':
        return <ImageIcon className="w-3.5 h-3.5 text-pink-400" />;
      case 'generate_text':
        return <Cpu className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  const getStatusBadge = () => {
    switch (task.status) {
      case 'planning':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            Planning Steps...
          </span>
        );
      case 'running':
      case 'waiting_for_tool':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Executing Step {task.currentStep} of {task.totalSteps || '?'}
          </span>
        );
      case 'waiting_for_approval':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/40 animate-pulse">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            Approval Required
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Task Completed ({task.totalSteps} steps)
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-red-500/10 text-red-300 border border-red-500/30">
            <AlertCircle className="w-3 h-3 text-red-400" />
            Execution Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-slate-500/10 text-slate-400 border border-slate-700/30">
            Cancelled by User
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 bg-white/5">
            Queued
          </span>
        );
    }
  };

  const stepsToRender: AgentTaskStep[] = task.steps && task.steps.length > 0
    ? task.steps
    : (task.plan || []).map((p, idx) => ({
        id: `step_placeholder_${idx}`,
        taskId: task.id,
        sequence: p.sequence,
        action: p.action,
        tool: p.tool,
        input: p.input,
        output: undefined,
        error: undefined,
        status: (idx < task.currentStep - 1
          ? 'completed'
          : idx === task.currentStep - 1
          ? 'running'
          : 'pending') as any
      }));

  return (
    <div className="my-3 rounded-xl border border-cyan-950/60 bg-[#070b10] overflow-hidden shadow-2xl transition-all">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-[#0a1017] border-b border-cyan-950/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-950/40 border border-cyan-700/40 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">Darkano Autonomous Agent</span>
              <span className="text-[10px] font-mono text-cyan-400/80">
                {task.id.slice(0, 14)}...
              </span>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-1 max-w-md font-mono">
              {task.originalPrompt}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {getStatusBadge()}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse plan' : 'Expand plan'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Human Approval Banner */}
      {task.status === 'waiting_for_approval' && (
        <div className="p-4 bg-rose-950/30 border-b border-rose-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Consequential Action Requires Your Approval</span>
            </div>
            <p className="text-xs text-rose-200/90 font-mono">
              {task.pendingApprovalAction?.action || 'The agent is requesting authorization to proceed with a tool execution.'}
            </p>
            {task.pendingApprovalAction?.tool && (
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/40 text-rose-200 border border-rose-700/40">
                Tool: {task.pendingApprovalAction.tool}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={() => onApprove && onApprove(task.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approve</span>
            </button>
            <button
              onClick={() => onCancel && onCancel(task.id)}
              className="px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-800/40 border border-rose-700/50 text-rose-200 text-xs font-medium transition-colors cursor-pointer"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Steps Execution Plan */}
      {isExpanded && (
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1 border-b border-cyan-950/30">
            <span>Execution Sequence ({stepsToRender.length} steps planned)</span>
            <div className="flex items-center gap-3">
              {task.creditsUsed > 0 && (
                <span className="flex items-center gap-1 text-cyan-400">
                  <Coins className="w-3 h-3" />
                  <span>{task.creditsUsed} credits used</span>
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {stepsToRender.map((step, idx) => {
              const isCurrent = step.status === 'running' || (task.status === 'running' && idx === task.currentStep - 1);
              const isStepExpanded = expandedStepIndex === idx;

              return (
                <div
                  key={step.id || idx}
                  className={`p-2.5 rounded-lg border text-xs transition-all ${
                    step.status === 'completed'
                      ? 'bg-[#091016]/60 border-cyan-950/40 text-slate-300'
                      : isCurrent
                      ? 'bg-cyan-950/20 border-cyan-600/40 text-cyan-200 ring-1 ring-cyan-500/20 shadow-md'
                      : step.status === 'failed'
                      ? 'bg-red-950/20 border-red-800/40 text-red-200'
                      : step.status === 'waiting_for_approval'
                      ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                      : 'bg-white/[0.02] border-white/5 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] shrink-0 font-bold bg-black/40 border border-white/10">
                        {step.status === 'completed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : step.status === 'failed' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        ) : isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        ) : (
                          <span>{idx + 1}</span>
                        )}
                      </div>

                      <span className="font-medium truncate text-[11px] sm:text-xs text-slate-200">
                        {step.action}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {step.tool && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/40 border border-cyan-950/50 font-mono text-[10px] text-cyan-300">
                          {getToolIcon(step.tool)}
                          <span>{step.tool}</span>
                        </div>
                      )}

                      {(step.output || step.error) && (
                        <button
                          onClick={() => setExpandedStepIndex(isStepExpanded ? null : idx)}
                          className="text-[10px] font-mono text-slate-400 hover:text-cyan-300 transition-colors p-1"
                        >
                          {isStepExpanded ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Step Output / Error Details */}
                  {isStepExpanded && (
                    <div className="mt-2.5 pt-2 border-t border-cyan-950/30 text-[11px] font-mono">
                      {step.error ? (
                        <div className="text-red-300 bg-red-950/30 p-2 rounded border border-red-800/30">
                          {step.error}
                        </div>
                      ) : step.output ? (
                        <div className="bg-black/60 p-2 rounded border border-cyan-950/40 overflow-x-auto text-slate-300 max-h-40">
                          <pre>{typeof step.output === 'object' ? JSON.stringify(step.output, null, 2) : String(step.output)}</pre>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Footer for Stop or Retry */}
          <div className="pt-2 flex items-center justify-between text-xs font-mono">
            <div>
              {task.status === 'failed' && onRetry && (
                <button
                  onClick={() => onRetry(task.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Task</span>
                </button>
              )}
            </div>

            {(task.status === 'running' || task.status === 'planning') && onCancel && (
              <button
                onClick={() => onCancel(task.id)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 transition-colors cursor-pointer text-[11px]"
              >
                <Square className="w-3 h-3 fill-rose-400" />
                <span>Stop Task</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
