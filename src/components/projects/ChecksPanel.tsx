import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  FileCheck,
  ShieldAlert,
  Code2,
  Terminal,
  Activity
} from 'lucide-react';
import { ProjectQualityChecksResult } from '../../types';

interface ChecksPanelProps {
  checks: ProjectQualityChecksResult | null;
  onRunChecks: () => Promise<void>;
  isLoading: boolean;
}

export const ChecksPanel: React.FC<ChecksPanelProps> = ({
  checks,
  onRunChecks,
  isLoading
}) => {
  const renderStatus = (status: 'passed' | 'failed' | 'not_configured') => {
    if (status === 'passed') {
      return (
        <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
          <CheckCircle2 className="w-4 h-4" />
          <span>Passed</span>
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="flex items-center gap-1 text-rose-400 font-semibold text-xs">
          <XCircle className="w-4 h-4" />
          <span>Failed</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-slate-500 font-medium text-xs">
        <HelpCircle className="w-4 h-4" />
        <span>Not configured</span>
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c1017] p-4 overflow-y-auto space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Code Quality & Diagnostics</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real verification of AST syntax, TypeScript types, lint standards, tests, and production build.
          </p>
        </div>

        <button
          onClick={onRunChecks}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Running...' : 'Run Diagnostics'}</span>
        </button>
      </div>

      {!checks ? (
        <div className="text-center py-10 text-slate-500 font-mono text-xs">
          Click "Run Diagnostics" to perform real syntax, type, and build validation across all project files.
        </div>
      ) : (
        <div className="space-y-3 font-mono text-xs">
          {/* 1. Syntax Validation */}
          <div className="p-3 rounded-lg bg-[#111622] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-slate-200">Syntax AST Validation</span>
              </div>
              {renderStatus(checks.syntax.status)}
            </div>
            {checks.syntax.errors && checks.syntax.errors.length > 0 && (
              <div className="p-2 rounded bg-rose-950/30 border border-rose-900/40 text-rose-300 text-[11px] space-y-1">
                {checks.syntax.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Type Checking */}
          <div className="p-3 rounded-lg bg-[#111622] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-slate-200">TypeScript Type Check</span>
              </div>
              {renderStatus(checks.typeCheck.status)}
            </div>
            {checks.typeCheck.errors && checks.typeCheck.errors.length > 0 && (
              <div className="p-2 rounded bg-rose-950/30 border border-rose-900/40 text-rose-300 text-[11px] space-y-1">
                {checks.typeCheck.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Linting */}
          <div className="p-3 rounded-lg bg-[#111622] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-slate-200">Static Code Lint</span>
              </div>
              {renderStatus(checks.lint.status)}
            </div>
            {checks.lint.warnings && checks.lint.warnings.length > 0 && (
              <div className="p-2 rounded bg-amber-950/20 border border-amber-900/30 text-amber-300 text-[11px] space-y-1">
                {checks.lint.warnings.map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Automated Tests */}
          <div className="p-3 rounded-lg bg-[#111622] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">
                  Automated Tests ({checks.tests.passed}/{checks.tests.total})
                </span>
              </div>
              {renderStatus(checks.tests.status)}
            </div>
            {checks.tests.status === 'not_configured' && (
              <p className="text-slate-500 text-[11px]">
                No test files detected in project. Use AI Assistant to generate tests for your components.
              </p>
            )}
            {checks.tests.results && checks.tests.results.length > 0 && (
              <div className="space-y-1 pt-1">
                {checks.tests.results.map((res, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-slate-900/50">
                    <span className="text-slate-300">{res.name}</span>
                    <span className={res.status === 'passed' ? 'text-emerald-400' : 'text-rose-400'}>
                      {res.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Production Build */}
          <div className="p-3 rounded-lg bg-[#111622] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-400" />
                <span className="font-semibold text-slate-200">Production Build Status</span>
              </div>
              {renderStatus(checks.productionBuild.status)}
            </div>
            {checks.productionBuild.status === 'not_configured' && (
              <p className="text-slate-500 text-[11px]">
                Run Build has not yet been triggered for this project session.
              </p>
            )}
            {checks.productionBuild.errors && (
              <div className="p-2 rounded bg-rose-950/30 border border-rose-900/40 text-rose-300 text-[11px]">
                {checks.productionBuild.errors}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
