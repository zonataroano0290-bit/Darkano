import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Globe,
  Server,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Activity
} from 'lucide-react';

interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  category: string;
  owaspCategory: string;
  description: string;
  impact: string;
  remediation: string;
}

interface SecurityAuditData {
  targetUrl: string;
  hostname: string;
  timestamp: string;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  dns: {
    aRecords: string[];
    aaaaRecords: string[];
    mxRecords: Array<{ exchange: string; priority: number }>;
    txtRecords: string[];
    hasSpf: boolean;
    hasDmarc: boolean;
    hasCaa: boolean;
    hasIpv6: boolean;
  };
  tls: {
    protocol?: string;
    cipherSuite?: string;
    issuer?: string;
    subject?: string;
    validTo?: string;
    daysRemaining?: number;
    isExpired?: boolean;
    sans?: string[];
  };
  http: {
    finalUrl: string;
    statusCode: number;
    responseTimeMs: number;
    httpsEnforced: boolean;
    serverBanner?: string;
    poweredBy?: string;
    csp?: {
      raw?: string;
      hasDefaultSrc: boolean;
      allowsUnsafeInline: boolean;
    };
    hsts?: {
      raw?: string;
      maxAge?: number;
      includeSubDomains: boolean;
    };
    xFrameOptions?: string;
    xContentTypeOptions?: string;
    cookies: Array<{ name: string; isSecure: boolean; isHttpOnly: boolean }>;
  };
  findings: SecurityFinding[];
  recommendedPlaybook?: string[];
}

interface SecurityAuditCardProps {
  audit: SecurityAuditData;
}

export const SecurityAuditCard: React.FC<SecurityAuditCardProps> = ({ audit }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'tls' | 'headers'>('overview');

  const getGradeTheme = (grade: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return {
          bg: 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]'
        };
      case 'B':
      case 'C':
        return {
          bg: 'bg-amber-950/40 border-amber-500/40 text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]'
        };
      default:
        return {
          bg: 'bg-rose-950/40 border-rose-500/40 text-rose-400',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          glow: 'shadow-[0_0_20px_rgba(244,63,94,0.15)]'
        };
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-600/30 text-rose-300 border-rose-500/50 font-bold';
      case 'high':
        return 'bg-orange-600/30 text-orange-300 border-orange-500/50 font-semibold';
      case 'medium':
        return 'bg-amber-600/30 text-amber-300 border-amber-500/50';
      case 'low':
        return 'bg-blue-600/30 text-blue-300 border-blue-500/50';
      default:
        return 'bg-slate-700/30 text-slate-300 border-slate-600/50';
    }
  };

  const theme = getGradeTheme(audit.grade);

  const handleCopyTelemetry = () => {
    const jsonStr = JSON.stringify(audit, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`my-4 rounded-xl border ${theme.bg} ${theme.glow} overflow-hidden backdrop-blur-md transition-all duration-200`}>
      {/* Header bar */}
      <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 border-b border-rose-950/30 bg-[#0c0307]/70">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-black/60 border border-rose-900/50 flex items-center justify-center shrink-0">
            {audit.score >= 80 ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-rose-300/80 uppercase tracking-widest">Darkano Security Probe</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-900/50">LIVE</span>
            </div>
            <h4 className="font-semibold text-white text-sm sm:text-base truncate flex items-center gap-2">
              <span>{audit.hostname}</span>
              <a
                href={audit.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-white transition-colors"
                title="Open Target in New Tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </h4>
          </div>
        </div>

        {/* Quick metrics & Grade */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-slate-400 font-mono">Security Score</div>
              <div className="font-bold text-white text-sm font-mono">{audit.score}/100</div>
            </div>
            <div className={`w-11 h-11 rounded-lg border flex flex-col items-center justify-center ${theme.badge} font-mono font-black text-lg shadow-inner`}>
              {audit.grade}
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg bg-neutral-900/70 border border-rose-950/50 text-slate-300 hover:text-white transition-colors"
            title={expanded ? 'Collapse Probe Telemetry' : 'Expand Probe Telemetry'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-4 py-2.5 bg-black/40 border-b border-rose-950/20 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-300 font-mono text-[11px] flex-wrap">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>{audit.tls.protocol || 'TLS 1.3'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>{audit.http.serverBanner || 'Banner Hidden'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{audit.findings.length} Vulnerabilities</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>{audit.http.responseTimeMs}ms</span>
          </span>
        </div>

        <button
          onClick={handleCopyTelemetry}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-rose-200 transition-colors font-mono"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Raw JSON'}</span>
        </button>
      </div>

      {/* Expanded detailed analysis tabs */}
      {expanded && (
        <div className="p-4 bg-[#080104]/90 space-y-4 text-xs">
          {/* Tabs header */}
          <div className="flex items-center gap-1 border-b border-rose-950/40 pb-2">
            {[
              { id: 'overview', label: 'Overview & Score' },
              { id: 'findings', label: `Findings (${audit.findings.length})` },
              { id: 'tls', label: 'TLS & Certificate' },
              { id: 'headers', label: 'HTTP Security Headers' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-rose-950/60 text-rose-200 border border-rose-800/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <p className="text-slate-300 leading-relaxed">{audit.summary}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/30">
                  <div className="text-[10px] uppercase font-mono text-slate-400">HTTPS Transport</div>
                  <div className={`font-semibold mt-1 flex items-center gap-1.5 ${audit.http.httpsEnforced ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <Lock className="w-3.5 h-3.5" />
                    <span>{audit.http.httpsEnforced ? 'Strict HTTPS Enforced' : 'Unencrypted HTTP'}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/30">
                  <div className="text-[10px] uppercase font-mono text-slate-400">HSTS Preload</div>
                  <div className={`font-semibold mt-1 ${audit.http.hsts ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {audit.http.hsts ? `Active (${audit.http.hsts.maxAge}s)` : 'Missing (Vulnerable)'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/30">
                  <div className="text-[10px] uppercase font-mono text-slate-400">Content-Security-Policy</div>
                  <div className={`font-semibold mt-1 ${audit.http.csp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {audit.http.csp ? 'Configured' : 'Missing (High Risk)'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/30">
                  <div className="text-[10px] uppercase font-mono text-slate-400">DNS Spoofing Defense</div>
                  <div className="font-semibold mt-1 text-slate-200">
                    SPF: {audit.dns.hasSpf ? '✓' : '✗'} | DMARC: {audit.dns.hasDmarc ? '✓' : '✗'}
                  </div>
                </div>
              </div>

              {audit.recommendedPlaybook && (
                <div className="mt-3 p-3 rounded-lg bg-rose-950/15 border border-rose-900/30">
                  <div className="text-xs font-semibold text-rose-300 mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-rose-400" />
                    <span>Immediate Hardening Playbook</span>
                  </div>
                  <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                    {audit.recommendedPlaybook.slice(0, 4).map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Findings */}
          {activeTab === 'findings' && (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {audit.findings.length === 0 ? (
                <div className="text-slate-400 py-4 text-center">No critical or medium vulnerabilities detected.</div>
              ) : (
                audit.findings.map(finding => (
                  <div
                    key={finding.id}
                    className="p-3 rounded-lg bg-black/50 border border-rose-950/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${getSeverityBadge(finding.severity)}`}>
                          {finding.severity}
                        </span>
                        <span className="font-semibold text-white">{finding.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{finding.owaspCategory}</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{finding.description}</p>
                    <div className="pt-1 text-[11px] border-t border-rose-950/20 text-rose-200/90">
                      <strong>Remediation:</strong> {finding.remediation}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: TLS */}
          {activeTab === 'tls' && (
            <div className="space-y-2 font-mono text-[11px]">
              <div className="p-3 rounded-lg bg-black/40 border border-rose-950/30 space-y-1.5">
                <div><span className="text-slate-400">Protocol:</span> <span className="text-white">{audit.tls.protocol || 'TLSv1.3'}</span></div>
                <div><span className="text-slate-400">Cipher Suite:</span> <span className="text-emerald-300">{audit.tls.cipherSuite || 'Default Safe Cipher'}</span></div>
                <div><span className="text-slate-400">Certificate Authority (Issuer):</span> <span className="text-white">{audit.tls.issuer || 'N/A'}</span></div>
                <div><span className="text-slate-400">Expires:</span> <span className="text-white">{audit.tls.validTo || 'N/A'} ({audit.tls.daysRemaining ?? 'N/A'} days remaining)</span></div>
                {audit.tls.sans && audit.tls.sans.length > 0 && (
                  <div>
                    <span className="text-slate-400">SANs:</span>{' '}
                    <span className="text-slate-300">{audit.tls.sans.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: HTTP Headers */}
          {activeTab === 'headers' && (
            <div className="space-y-2 font-mono text-[11px]">
              <div className="p-3 rounded-lg bg-black/40 border border-rose-950/30 space-y-1.5">
                <div><span className="text-slate-400">Strict-Transport-Security:</span> <span className="text-white">{audit.http.hsts?.raw || 'Missing'}</span></div>
                <div><span className="text-slate-400">Content-Security-Policy:</span> <span className="text-white truncate block">{audit.http.csp?.raw || 'Missing'}</span></div>
                <div><span className="text-slate-400">X-Frame-Options:</span> <span className="text-white">{audit.http.xFrameOptions || 'Missing (Clickjacking vector)'}</span></div>
                <div><span className="text-slate-400">X-Content-Type-Options:</span> <span className="text-white">{audit.http.xContentTypeOptions || 'Missing'}</span></div>
                <div><span className="text-slate-400">Server Banner:</span> <span className="text-amber-300">{audit.http.serverBanner || 'Hidden'}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
