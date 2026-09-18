import React from 'react';
import {
  Globe,
  Compass,
  Activity,
  AlertTriangle,
  Cpu,
  Shield,
  Search,
  Terminal,
  Bug,
  Lock
} from 'lucide-react';
import { CyberAction } from '../types';

interface CyberOptionsBarProps {
  onSelectAction: (action: CyberAction, templatePrompt?: string) => void;
  onOpenWebsiteAnalysis: () => void;
  className?: string;
}

export const CyberOptionsBar: React.FC<CyberOptionsBarProps> = ({
  onSelectAction,
  onOpenWebsiteAnalysis,
  className = ''
}) => {
  const options = [
    {
      id: 'website_analysis' as CyberAction,
      label: 'Website Analysis',
      icon: Globe,
      color: 'hover:border-rose-500/60 text-rose-300 hover:bg-rose-950/40 hover:text-rose-100',
      badge: 'LIVE PROBE',
      action: () => onOpenWebsiteAnalysis()
    },
    {
      id: 'security_research' as CyberAction,
      label: 'Security Research',
      icon: Compass,
      color: 'hover:border-purple-500/60 text-purple-300 hover:bg-purple-950/40 hover:text-purple-100',
      badge: 'THREAT INTEL',
      action: () =>
        onSelectAction(
          'security_research',
          'Conduct comprehensive threat intelligence and vulnerability research on: '
        )
    },
    {
      id: 'network_intelligence' as CyberAction,
      label: 'Network Intelligence',
      icon: Activity,
      color: 'hover:border-cyan-500/60 text-cyan-300 hover:bg-cyan-950/40 hover:text-cyan-100',
      badge: 'PCAP / TCP',
      action: () =>
        onSelectAction(
          'network_intelligence',
          'Analyze network packet flow, TCP handshake anomalies, and firewall detection rules for: '
        )
    },
    {
      id: 'vulnerability_analysis' as CyberAction,
      label: 'Vulnerability Analysis',
      icon: AlertTriangle,
      color: 'hover:border-amber-500/60 text-amber-300 hover:bg-amber-950/40 hover:text-amber-100',
      badge: 'OWASP / CVSS',
      action: () =>
        onSelectAction(
          'vulnerability_analysis',
          'Perform an in-depth vulnerability audit and CWE/CVSS scoring analysis on the following code or system: '
        )
    },
    {
      id: 'deep_cyber_analysis' as CyberAction,
      label: 'Deep Cyber Analysis',
      icon: Cpu,
      color: 'hover:border-emerald-500/60 text-emerald-300 hover:bg-emerald-950/40 hover:text-emerald-100',
      badge: 'REVERSE / DFIR',
      action: () =>
        onSelectAction(
          'deep_cyber_analysis',
          'Perform a deep cybersecurity technical analysis (disassembly, binary protections, memory safety, or digital forensics) on: '
        )
    }
  ];

  return (
    <div className={`w-full overflow-x-auto scrollbar-none py-1 ${className}`}>
      <div className="flex items-center gap-2 min-w-max">
        <span className="text-[11px] font-mono text-rose-400/80 uppercase tracking-wider flex items-center gap-1 shrink-0 px-1 font-semibold">
          <Shield className="w-3.5 h-3.5 text-rose-400" />
          <span>Cyber Intelligence:</span>
        </span>

        {options.map(opt => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={opt.action}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-rose-950/40 text-xs font-medium transition-all shadow-sm ${opt.color} shrink-0`}
            >
              <Icon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
              <span>{opt.label}</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/60 border border-rose-950/60 opacity-80 group-hover:opacity-100">
                {opt.badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
