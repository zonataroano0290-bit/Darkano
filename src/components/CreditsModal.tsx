import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Zap,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Clock,
  Sparkles,
  Info,
  ShieldCheck,
  ChevronRight,
  Filter,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { CreditTransaction, UsageSummary } from '../types';

export const CreditsModal: React.FC = () => {
  const {
    activeModal,
    closeModal,
    openModal,
    currentUser,
    token,
    refreshCredits
  } = useWorkspace();

  const isOpen = activeModal === 'credits';

  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<number>(currentUser?.creditBalance ?? 500);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [totalTxCount, setTotalTxCount] = useState<number>(0);
  const [filterType, setFilterType] = useState<string>('all');
  const [page, setPage] = useState<number>(0);
  const limit = 10;

  const fetchCreditData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      // 1. Fetch balance & usage summary
      const balanceRes = await fetch('/api/credits/balance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setBalance(data.balance);
        setUsageSummary(data.usage);
      }

      // 2. Fetch transaction history
      const typeParam = filterType !== 'all' ? `&type=${filterType}` : '';
      const txRes = await fetch(`/api/credits/history?limit=${limit}&offset=${page * limit}${typeParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
        setTotalTxCount(txData.total || 0);
      }
    } catch (err) {
      console.error('[Darkano Credits] Error fetching credit data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, filterType, page]);

  useEffect(() => {
    if (isOpen) {
      fetchCreditData();
    }
  }, [isOpen, fetchCreditData]);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    await fetchCreditData();
    await refreshCredits();
  };

  const totalPages = Math.ceil(totalTxCount / limit);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-[#090306] border border-rose-950/60 shadow-[0_0_50px_rgba(225,29,72,0.15)] overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-950/40 bg-gradient-to-r from-rose-950/30 via-transparent to-transparent shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-950/70 border border-rose-700/50 flex items-center justify-center text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.25)]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-white tracking-wide flex items-center gap-2">
                Credits & Usage Vault
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/40">
                  Real-time Ledger
                </span>
              </h2>
              <p className="text-xs text-slate-400">Server-authoritative compute tracking with zero simulation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] transition-all cursor-pointer disabled:opacity-50"
              title="Refresh ledger records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
            </button>
            <button
              onClick={closeModal}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {/* Balance Hero Card */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-950/40 via-black to-neutral-950 border border-rose-800/40 p-5 shadow-lg">
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
              <Coins className="w-32 h-32 text-rose-400" />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div>
                <div className="text-[11px] font-mono tracking-wider uppercase text-rose-400 font-semibold mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                  Verified Ledger Balance
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                    {balance.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono text-rose-300">Credits Available</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  All requests execute against verified cryptographic ledger records. 500 complimentary signup credits allocated upon initialization.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => {
                    closeModal();
                    openModal('plans');
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-[0_0_20px_rgba(225,29,72,0.4)] transition-all cursor-pointer active:scale-95"
                >
                  <Coins className="w-4 h-4" />
                  <span>Get More Credits</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Feature Usage Breakdown Strip */}
            {usageSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-rose-950/60 text-xs">
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/40">
                  <div className="text-[10px] font-mono text-slate-400">Total Granted</div>
                  <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                    +{usageSummary.totalGranted.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/40">
                  <div className="text-[10px] font-mono text-slate-400">Total Consumed</div>
                  <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
                    -{usageSummary.totalConsumed.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/40">
                  <div className="text-[10px] font-mono text-slate-400">Web Research Used</div>
                  <div className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                    {(usageSummary.byFeature['web_search_usage'] || 0).toLocaleString()} cr
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-950/40">
                  <div className="text-[10px] font-mono text-slate-400">File Analysis Used</div>
                  <div className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                    {(usageSummary.byFeature['file_analysis_usage'] || 0).toLocaleString()} cr
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Model Transparency Card */}
          <div className="rounded-xl bg-black/40 border border-rose-950/40 p-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-rose-300">
              <Info className="w-3.5 h-3.5 text-rose-400" />
              <span>Transparent Server Computation Rates</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] text-slate-300">
              <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="font-mono text-white font-medium">Model Base Compute</div>
                <div className="text-slate-400 mt-0.5">2 – 8 credits based on model tier (Flash: 2, Prime: 4, Ultra: 8)</div>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="font-mono text-white font-medium">Token Output Rate</div>
                <div className="text-slate-400 mt-0.5">1 credit per 2,000 processed input & output tokens</div>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="font-mono text-white font-medium">Augmented Modalities</div>
                <div className="text-slate-400 mt-0.5">+4 credits for live web grounding, +2 credits per attached document</div>
              </div>
            </div>
          </div>

          {/* Transaction Ledger Table Section */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-400" />
                Immutable Transaction Ledger ({totalTxCount})
              </h3>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-rose-950/40 text-[11px]">
                {['all', 'ai_usage', 'purchase', 'signup_bonus', 'admin_adjustment'].map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setFilterType(f);
                      setPage(0);
                    }}
                    className={`px-2.5 py-1 rounded-md capitalize transition-all cursor-pointer ${
                      filterType === f
                        ? 'bg-rose-900/60 text-rose-200 font-medium'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Transactions List */}
            {isLoading && transactions.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                <span>Reading cryptographic ledger records...</span>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-black/20 border border-dashed border-rose-950/40 text-slate-400 text-xs">
                No ledger transactions found matching filter.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-rose-950/40 bg-black/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-950/30 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-rose-950/40">
                    <tr>
                      <th className="px-3 py-2.5">Type & Source</th>
                      <th className="px-3 py-2.5">Amount</th>
                      <th className="px-3 py-2.5">Balance After</th>
                      <th className="px-3 py-2.5">Transaction ID</th>
                      <th className="px-3 py-2.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-950/30 text-slate-300">
                    {transactions.map(tx => {
                      const isPositive = tx.amount > 0;
                      return (
                        <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] ${
                                  isPositive
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                    : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                                }`}
                              >
                                {isPositive ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              </div>
                              <div>
                                <span className="font-medium text-white capitalize">
                                  {tx.type.replace(/_/g, ' ')}
                                </span>
                                <span className="block text-[10px] font-mono text-slate-400">
                                  {tx.source || 'system'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold">
                            <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                              {isPositive ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} cr
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-300">
                            {tx.balanceAfter.toLocaleString()} cr
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[10px] text-slate-400 truncate max-w-[120px]" title={tx.transactionId}>
                            {tx.transactionId.slice(0, 16)}...
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] disabled:opacity-30 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] disabled:opacity-30 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-rose-950/40 bg-black/60 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cryptographic double-entry verified</span>
          </div>
          <button
            onClick={closeModal}
            className="px-4 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
