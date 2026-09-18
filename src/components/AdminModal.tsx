import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Users,
  Activity,
  Coins,
  Database,
  Search,
  RefreshCw,
  Edit3,
  AlertCircle,
  CheckCircle2,
  Clock,
  Key,
  Sliders,
  Server,
  FileText,
  ChevronRight,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  AdminDashboardStats,
  AdminUserRecord,
  SystemHealthItem,
  AuditLogRecord
} from '../types';

type AdminTab = 'overview' | 'users' | 'health' | 'audit';

export const AdminModal: React.FC = () => {
  const {
    activeModal,
    closeModal,
    currentUser,
    token
  } = useWorkspace();

  const isOpen = activeModal === 'admin';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [health, setHealth] = useState<SystemHealthItem[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [userSearch, setUserSearch] = useState<string>('');
  const [userPage, setUserPage] = useState<number>(1);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [totalLogsCount, setTotalLogsCount] = useState<number>(0);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Credit Adjustment Modal Sub-state
  const [adjustTargetUser, setAdjustTargetUser] = useState<AdminUserRecord | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);

  // Role Update Sub-state
  const [roleTargetUser, setRoleTargetUser] = useState<AdminUserRecord | null>(null);
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin' | 'owner'>('user');
  const [isUpdatingRole, setIsUpdatingRole] = useState<boolean>(false);

  const fetchStats = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err: any) {
      console.error('[Darkano Admin] Stats error:', err);
    }
  }, [token, isAdmin]);

  const fetchHealth = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await fetch('/api/admin/health', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data.components || []);
      }
    } catch (err: any) {
      console.error('[Darkano Admin] Health check error:', err);
    }
  }, [token, isAdmin]);

  const fetchUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    setIsLoading(true);
    try {
      const searchParam = userSearch.trim() ? `&search=${encodeURIComponent(userSearch.trim())}` : '';
      const res = await fetch(`/api/admin/users?page=${userPage}&limit=10${searchParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalUsersCount(data.total || 0);
      }
    } catch (err: any) {
      console.error('[Darkano Admin] Users error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, isAdmin, userPage, userSearch]);

  const fetchAuditLogs = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await fetch(`/api/admin/audit-logs?page=${auditPage}&limit=15`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
        setTotalLogsCount(data.total || 0);
      }
    } catch (err: any) {
      console.error('[Darkano Admin] Audit error:', err);
    }
  }, [token, isAdmin, auditPage]);

  // Initial Load
  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchStats();
      fetchHealth();
      fetchUsers();
      fetchAuditLogs();
    }
  }, [isOpen, isAdmin, fetchStats, fetchHealth, fetchUsers, fetchAuditLogs]);

  if (!isOpen) return null;

  // Strict RBAC Guard
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="p-6 rounded-2xl bg-[#090306] border border-rose-900/60 text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">Access Restricted</h3>
          <p className="text-xs text-slate-400 mb-4">
            You do not possess the required administrator credentials to access the Darkano Core Console.
          </p>
          <button
            onClick={closeModal}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Handle Manual Credit Adjustment
  const handleExecuteCreditAdjustment = async () => {
    if (!adjustTargetUser) return;
    const amountNum = parseInt(adjustAmount, 10);
    if (isNaN(amountNum) || amountNum === 0) {
      setErrorMsg('Please specify a valid non-zero integer credit adjustment.');
      return;
    }
    if (!adjustReason.trim() || adjustReason.trim().length < 3) {
      setErrorMsg('A detailed audit justification is required.');
      return;
    }

    setIsAdjusting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${adjustTargetUser.id}/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amountNum,
          reason: adjustReason.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Adjustment failed');

      setSuccessMsg(`Successfully adjusted credits for ${adjustTargetUser.email}.`);
      setAdjustTargetUser(null);
      setAdjustAmount('');
      setAdjustReason('');
      fetchUsers();
      fetchStats();
      fetchAuditLogs();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Manual adjustment failed');
    } finally {
      setIsAdjusting(false);
    }
  };

  // Handle Role Update
  const handleExecuteRoleUpdate = async () => {
    if (!roleTargetUser) return;
    setIsUpdatingRole(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${roleTargetUser.id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: selectedRole })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Role update failed');

      setSuccessMsg(`Role updated to ${selectedRole} for ${roleTargetUser.email}.`);
      setRoleTargetUser(null);
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Role update failed');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div
        className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-[#080205] border border-rose-950/70 shadow-[0_0_60px_rgba(225,29,72,0.25)] overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Admin Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-950/50 bg-gradient-to-r from-rose-950/40 via-black to-black shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-950 border border-rose-700/60 flex items-center justify-center text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.3)]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Darkano Core Admin Console</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-900/60 text-rose-200 border border-rose-700/50 uppercase">
                  {currentUser?.role}
                </span>
              </div>
              <p className="text-xs text-slate-400">System orchestration, user governance, and cryptographic audit records</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchStats();
                fetchHealth();
                fetchUsers();
                fetchAuditLogs();
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] transition-all cursor-pointer"
              title="Refresh all admin metrics"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={closeModal}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-rose-950/40 bg-black/40 shrink-0 text-xs">
          {[
            { id: 'overview', label: 'Overview & Metrics', icon: Activity },
            { id: 'users', label: 'User Governance', icon: Users },
            { id: 'health', label: 'System Health', icon: Server },
            { id: 'audit', label: 'Immutable Audit Trail', icon: FileText }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-rose-950/80 text-rose-200 border border-rose-700/50 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-rose-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-rose-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-5">
              {/* Stat Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>Total Registered Users</span>
                    <Users className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div className="text-2xl font-mono font-bold text-white mt-1">
                    {stats.totalUsers.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {stats.activeUsers} active in last 24 hours
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>AI Requests Processed</span>
                    <Activity className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div className="text-2xl font-mono font-bold text-white mt-1">
                    {stats.totalAiRequests.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1">
                    {stats.totalAiRequests > 0
                      ? `${Math.round((stats.successfulRequests / stats.totalAiRequests) * 100)}% execution rate`
                      : 'Zero failures'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>Credits Consumed</span>
                    <Coins className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div className="text-2xl font-mono font-bold text-rose-400 mt-1">
                    {stats.totalCreditsConsumed.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    of {stats.totalCreditsIssued.toLocaleString()} total issued
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>Revenue & Provider</span>
                    <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div className="text-lg font-mono font-bold text-white mt-1 truncate">
                    {stats.paymentProviderConfigured && stats.totalRevenueCents !== null
                      ? `$${(stats.totalRevenueCents / 100).toFixed(2)}`
                      : 'Unavailable'}
                  </div>
                  <div className="text-[10px] text-amber-400/80 font-mono mt-1">
                    {stats.paymentStatus}
                  </div>
                </div>
              </div>

              {/* Health Overview Strip */}
              <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-rose-400" />
                  Infrastructure Matrix Diagnostic
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {health.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">{item.name}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            item.status === 'Connected'
                              ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40'
                              : 'bg-amber-950/70 text-amber-400 border border-amber-800/40'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 truncate">{item.details}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Credit Transactions Stream */}
              {stats.recentTransactions && stats.recentTransactions.length > 0 && (
                <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                  <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                    Live Credit Ledger Activity
                  </div>
                  <div className="divide-y divide-rose-950/30 text-xs">
                    {stats.recentTransactions.map(tx => (
                      <div key={tx.id} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-300">{tx.userEmail}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-slate-400 capitalize">
                            {tx.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount} cr
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: USERS GOVERNANCE */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search users by email or display name..."
                    value={userSearch}
                    onChange={e => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/60 border border-rose-950/50 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-rose-600/60"
                  />
                </div>
                <div className="text-xs font-mono text-slate-400 shrink-0">
                  {totalUsersCount} registered users
                </div>
              </div>

              {/* Users Directory Table */}
              <div className="overflow-x-auto rounded-xl border border-rose-950/40 bg-black/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-950/30 text-[10px] font-mono uppercase text-slate-400 border-b border-rose-950/40">
                    <tr>
                      <th className="px-3 py-2.5">User Profile</th>
                      <th className="px-3 py-2.5">Role</th>
                      <th className="px-3 py-2.5">Plan</th>
                      <th className="px-3 py-2.5">Balance</th>
                      <th className="px-3 py-2.5">Messages / Files</th>
                      <th className="px-3 py-2.5">Registered</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-950/30 text-slate-300">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-white">{u.displayName}</div>
                          <div className="font-mono text-[10px] text-slate-400">{u.email}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                              u.role === 'owner'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                                : u.role === 'admin'
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                                : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-300">{u.plan}</td>
                        <td className="px-3 py-2.5 font-mono font-bold text-rose-300">
                          {u.creditBalance.toLocaleString()} cr
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">
                          {u.messagesCount} msgs · {u.filesCount} files
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setAdjustTargetUser(u);
                                setAdjustAmount('');
                                setAdjustReason('');
                              }}
                              className="px-2 py-1 rounded bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-[11px] font-medium transition-colors cursor-pointer"
                              title="Manually adjust credits"
                            >
                              Adjust Credits
                            </button>
                            {currentUser?.role === 'owner' && (
                              <button
                                onClick={() => {
                                  setRoleTargetUser(u);
                                  setSelectedRole(u.role);
                                }}
                                className="px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 text-[11px] transition-colors cursor-pointer"
                                title="Change user role"
                              >
                                Role
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                <span>
                  Showing {users.length} of {totalUsersCount} users
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={userPage <= 1}
                    onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] disabled:opacity-30 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={users.length < 10}
                    onClick={() => setUserPage(p => p + 1)}
                    className="px-2.5 py-1 rounded bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] disabled:opacity-30 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM HEALTH */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-black/40 border border-rose-950/50">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 mb-3">
                  Service Components Diagnostic
                </h3>
                <div className="space-y-3">
                  {health.map((item, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                          <span>{item.name}</span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                              item.status === 'Connected'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-800/40'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{item.details}</p>
                      </div>

                      <div className="shrink-0 pt-1">
                        {item.status === 'Connected' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>Cryptographic Immutable Audit Log ({totalLogsCount} events recorded)</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-rose-950/40 bg-black/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-950/30 text-[10px] font-mono uppercase text-slate-400 border-b border-rose-950/40">
                    <tr>
                      <th className="px-3 py-2.5">Timestamp</th>
                      <th className="px-3 py-2.5">Actor</th>
                      <th className="px-3 py-2.5">Action</th>
                      <th className="px-3 py-2.5">Target</th>
                      <th className="px-3 py-2.5">Metadata Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-950/30 text-slate-300">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-white">
                          {log.actorEmail || log.actorId}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/60 text-rose-300 border border-rose-800/40">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-slate-400">
                          {log.targetType}: {log.targetId ? log.targetId.slice(0, 10) : 'system'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                          {log.metadata ? JSON.stringify(log.metadata) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Sub-Dialog: Adjust Credits */}
        {adjustTargetUser && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md p-5 rounded-2xl bg-[#0d0408] border border-rose-800/60 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-rose-950/60 pb-3">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-rose-400" />
                  Manual Credit Adjustment
                </div>
                <button
                  onClick={() => setAdjustTargetUser(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300">
                Target User: <span className="font-mono text-white">{adjustTargetUser.email}</span>
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Current Balance: {adjustTargetUser.creditBalance.toLocaleString()} credits
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Credit Amount (+ to grant, - to deduct)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 500 or -200"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-rose-950/60 text-xs text-white font-mono focus:outline-none focus:border-rose-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Immutable Audit Reason (Mandatory)
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain why this adjustment is being executed..."
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-rose-950/60 text-xs text-white focus:outline-none focus:border-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setAdjustTargetUser(null)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 text-xs hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteCreditAdjustment}
                  disabled={isAdjusting}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isAdjusting ? 'Processing...' : 'Apply Ledger Adjustment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Sub-Dialog: Update User Role */}
        {roleTargetUser && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm p-5 rounded-2xl bg-[#0d0408] border border-rose-800/60 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-rose-950/60 pb-3">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-rose-400" />
                  Elevate or Demote Role
                </div>
                <button
                  onClick={() => setRoleTargetUser(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300">
                User: <span className="font-mono text-white">{roleTargetUser.email}</span>
              </div>

              <div className="space-y-2">
                {(['user', 'admin', 'owner'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRole(r)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs capitalize flex items-center justify-between transition-all cursor-pointer ${
                      selectedRole === r
                        ? 'bg-rose-950/70 border-rose-600/70 text-white font-semibold'
                        : 'bg-black/40 border-rose-950/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{r}</span>
                    {selectedRole === r && <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setRoleTargetUser(null)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 text-xs hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteRoleUpdate}
                  disabled={isUpdatingRole}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingRole ? 'Saving...' : 'Update Role'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-rose-950/40 bg-black/60 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
            <span>Cryptographic double-entry verified ledger</span>
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
