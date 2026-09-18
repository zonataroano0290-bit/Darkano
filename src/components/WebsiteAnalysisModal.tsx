import React, { useState } from 'react';
import {
  X,
  Globe,
  ShieldCheck,
  ShieldAlert,
  Search,
  Zap,
  ArrowRight,
  Lock,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

interface WebsiteAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
}

export const WebsiteAnalysisModal: React.FC<WebsiteAnalysisModalProps> = ({
  isOpen,
  onClose,
  initialUrl = ''
}) => {
  const { sendMessage, token } = useWorkspace();
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [analysisType, setAnalysisType] = useState<'standard' | 'deep' | 'compliance'>('standard');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) return;

    setError(null);
    setIsScanning(true);
    setScanResult(null);

    // Simulated progress steps while awaiting real API
    setScanStage('1/4: Resolving DNS records (A, AAAA, MX, TXT, SPF, DMARC)...');

    const t1 = setTimeout(() => {
      setScanStage('2/4: Inspecting TLS 1.3 handshake & Cipher Suite certificates...');
    }, 600);

    const t2 = setTimeout(() => {
      setScanStage('3/4: Auditing HTTP Security Headers (CSP, HSTS, X-Frame-Options)...');
    }, 1200);

    const t3 = setTimeout(() => {
      setScanStage('4/4: Correlating OWASP Top 10 vulnerabilities & CVSS scores...');
    }, 1800);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/security/analyze-url', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: raw, deepInspection: analysisType === 'deep' })
      });

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Scan probe error (Status ${res.status})`);
      }

      const data = await res.json();
      setScanResult(data.analysis);
      setIsScanning(false);
      setScanStage('Audit complete');
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      setIsScanning(false);
      setError(err?.message || 'Failed to analyze website security. Please check target URL.');
    }
  };

  const handleSendToAiChat = () => {
    const raw = urlInput.trim();
    if (!raw) return;

    const depthNote =
      analysisType === 'deep'
        ? 'Perform an exhaustive deep cyber analysis, vulnerability attack surface review, and penetration testing assessment'
        : analysisType === 'compliance'
        ? 'Audit PCI-DSS, HSTS, CSP, and transport compliance hardening'
        : 'Perform a comprehensive cybersecurity audit and OWASP Top 10 vulnerability analysis';

    sendMessage(
      `${depthNote} for website URL: ${raw}. Evaluate the live headers, TLS cipher suites, DNS spoofing resilience, and provide production-ready remediation patches.`,
      [],
      [],
      'website_analysis'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#090205] border border-rose-950/60 shadow-[0_0_50px_rgba(225,29,72,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#120309]/80 border-b border-rose-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-950/40 border border-rose-800/40 flex items-center justify-center text-rose-400 shadow-sm">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-wide flex items-center gap-2">
                <span>Website Security Analysis</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono">
                  PROBE v3.0
                </span>
              </h3>
              <p className="text-xs text-slate-400">Live DNS, TLS 1.3, HTTP Security Headers & OWASP Audit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <form onSubmit={handleStartAnalysis} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-2">
                Target Website URL or Hostname
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="e.g. https://github.com or example.com"
                  className="w-full px-4 py-3 pl-11 rounded-xl bg-black/60 border border-rose-950/60 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30 font-mono"
                  disabled={isScanning}
                  autoFocus
                />
                <Globe className="w-5 h-5 text-rose-400/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Analysis Depth Selector */}
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-2">
                Security Profile & Audit Depth
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'standard',
                    label: 'Standard Audit',
                    desc: 'Headers, TLS, DNS & OWASP'
                  },
                  {
                    id: 'deep',
                    label: 'Deep Cyber Analysis',
                    desc: 'Vulnerabilities & Attack Vectors'
                  },
                  {
                    id: 'compliance',
                    label: 'Compliance Hardening',
                    desc: 'HSTS, CSP & Transport Posture'
                  }
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAnalysisType(item.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      analysisType === item.id
                        ? 'bg-rose-950/40 border-rose-500/60 text-white shadow-sm'
                        : 'bg-black/30 border-rose-950/40 text-slate-400 hover:border-rose-900/40 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium text-xs text-rose-200">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-snug">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isScanning || !urlInput.trim()}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium text-sm transition-all shadow-[0_0_20px_rgba(225,29,72,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Executing Live Cyber Probe...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Run Security Probe</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSendToAiChat}
                disabled={isScanning || !urlInput.trim()}
                className="py-3 px-4 rounded-xl bg-black/60 border border-rose-900/40 hover:border-rose-700 text-rose-200 hover:text-white font-medium text-sm transition-all flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                <span>Ask Cyber AI</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Scanning Progress Banner */}
          {isScanning && (
            <div className="p-4 rounded-xl bg-black/60 border border-rose-500/30 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-300 font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  {scanStage}
                </span>
              </div>
              <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-600 to-amber-500 animate-pulse w-3/4 rounded-full" />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Live Quick Scan Result Preview */}
          {scanResult && (
            <div className="p-4 rounded-xl bg-[#0e0308] border border-rose-950/60 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-semibold text-white text-sm">Security Telemetry Acquired</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Score:</span>
                  <span className="font-bold text-white font-mono">{scanResult.score}/100</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold">
                    Grade {scanResult.grade}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-black/40 border border-rose-950/40">
                  <span className="text-slate-400 text-[10px] block">TLS Protocol</span>
                  <span className="text-white font-medium">{scanResult.tls?.protocol || 'TLS 1.3'}</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-rose-950/40">
                  <span className="text-slate-400 text-[10px] block">HSTS</span>
                  <span className={scanResult.http?.hsts ? 'text-emerald-400' : 'text-amber-400'}>
                    {scanResult.http?.hsts ? 'Enabled' : 'Missing'}
                  </span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-rose-950/40">
                  <span className="text-slate-400 text-[10px] block">CSP</span>
                  <span className={scanResult.http?.csp ? 'text-emerald-400' : 'text-rose-400'}>
                    {scanResult.http?.csp ? 'Configured' : 'Missing'}
                  </span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-rose-950/40">
                  <span className="text-slate-400 text-[10px] block">Findings</span>
                  <span className="text-amber-300">{scanResult.findings?.length || 0} issues</span>
                </div>
              </div>

              <button
                onClick={handleSendToAiChat}
                className="w-full py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>Generate Full Darkano AI Security Report in Chat</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick Target Suggestions */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Example Targets</span>
            <div className="flex flex-wrap gap-2">
              {['https://github.com', 'https://owasp.org', 'https://cloudflare.com', 'https://example.com'].map(
                target => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setUrlInput(target)}
                    className="px-2.5 py-1 rounded-lg bg-black/40 border border-rose-950/50 hover:border-rose-800 text-slate-300 hover:text-white font-mono text-xs transition-colors"
                  >
                    {target}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
