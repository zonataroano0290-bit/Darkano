import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  CreditCard,
  Check,
  AlertTriangle,
  ExternalLink,
  Shield,
  Zap,
  Sparkles,
  RefreshCw,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BillingPlan, UserSubscription, PaymentItem } from '../types';

export const PlansModal: React.FC = () => {
  const {
    activeModal,
    closeModal,
    openModal,
    token,
    refreshCredits,
    currentUser
  } = useWorkspace();

  const isOpen = activeModal === 'plans';

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [isStripeConfigured, setIsStripeConfigured] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPlansAndSubscription = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setActionError(null);
    try {
      // 1. Fetch public plan definitions & provider status
      const plansRes = await fetch('/api/billing/plans');
      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData.plans || []);
        setIsStripeConfigured(plansData.isConfigured === true);
      }

      // 2. Fetch user's current subscription & past payments
      const subRes = await fetch('/api/billing/subscription', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscription(subData.subscription || null);
        setPayments(subData.payments || []);
      }
    } catch (err: any) {
      console.error('[Darkano Plans] Failed to load billing info:', err);
      setActionError('Failed to synchronize billing state with server.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      fetchPlansAndSubscription();
    }
  }, [isOpen, fetchPlansAndSubscription]);

  if (!isOpen) return null;

  const handleCheckout = async (planId: string) => {
    if (!isStripeConfigured) return;
    setCheckoutLoading(planId);
    setActionError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ planId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Checkout initialization failed');
      }

      if (data.url) {
        // Real redirection to official Stripe Checkout session
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received from payment provider');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to initialize payment session.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    setCancelLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      setActionSuccess('Subscription cancelled. Access remains active until period ends.');
      await fetchPlansAndSubscription();
      await refreshCredits();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div
        className="relative w-full max-w-4xl max-h-[94vh] flex flex-col rounded-2xl bg-[#090306] border border-rose-950/60 shadow-[0_0_50px_rgba(225,29,72,0.2)] overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-950/40 bg-gradient-to-r from-rose-950/30 via-transparent to-transparent shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-950/70 border border-rose-700/50 flex items-center justify-center text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.25)]">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-white tracking-wide flex items-center gap-2">
                Subscription & Credit Plans
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/40">
                  Production Gate
                </span>
              </h2>
              <p className="text-xs text-slate-400">Official computing tiers for frontier reasoning and neural matrix access</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchPlansAndSubscription}
              disabled={isLoading}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-rose-950/40 border border-white/[0.06] transition-all cursor-pointer disabled:opacity-50"
              title="Refresh plans and subscription status"
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {/* Action Notification Banners */}
          {actionError && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-700/60 text-rose-200 text-xs flex items-center justify-between">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {actionSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-emerald-200 text-xs flex items-center justify-between">
              <span>{actionSuccess}</span>
              <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Provider Status Indicator */}
          {!isStripeConfigured ? (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-2">
                  <span>Payment Provider Status:</span>
                  <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/40 text-[11px] font-mono text-amber-300">
                    Not configured / unavailable
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Stripe live credentials (<code className="text-amber-300 font-mono">STRIPE_SECRET_KEY</code>) are not configured in the backend environment. In strict compliance with Darkano system requirements, checkout simulation is disabled. When Stripe keys are set, live checkout links automatically activate.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-emerald-200 text-xs flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Stripe payment gateway verified and connected. Real checkout sessions enabled.</span>
            </div>
          )}

          {/* Active Subscription Banner (if user is subscribed) */}
          {subscription && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-black border border-rose-800/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400">Current Subscription</div>
                <div className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  <span>{subscription.planName || subscription.planId}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                    {subscription.status.toUpperCase()}
                  </span>
                </div>
                {subscription.currentPeriodEnd && (
                  <div className="text-slate-400 text-[11px] mt-1">
                    Period ends: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    {subscription.cancelAtPeriodEnd && ' (Will not renew)'}
                  </div>
                )}
              </div>

              {!subscription.cancelAtPeriodEnd && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={cancelLoading}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
                </button>
              )}
            </div>
          )}

          {/* Plan Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(plan => {
              const isFree = plan.id.includes('free') || plan.priceCents === 0;
              const isPro = plan.id.includes('pro');
              const isEnterprise = plan.id.includes('business') || plan.id.includes('enterprise');
              const isCurrent = currentUser?.plan?.toLowerCase().includes(plan.name.toLowerCase()) ||
                (isFree && (currentUser?.plan === 'Developer' || currentUser?.plan === 'Free'));

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-xl p-5 transition-all ${
                    isPro
                      ? 'bg-gradient-to-b from-rose-950/60 to-black border-2 border-rose-600/70 shadow-[0_0_30px_rgba(225,29,72,0.2)]'
                      : 'bg-black/40 border border-rose-950/40 hover:border-rose-900/50'
                  }`}
                >
                  {isPro && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-rose-600 text-[10px] font-bold tracking-wider uppercase text-white shadow-md">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-base font-bold text-white">{plan.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
                        ${(plan.priceCents / 100).toFixed(0)}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">/{plan.billingInterval}</span>
                    </div>
                    <div className="text-xs font-mono text-rose-400 mt-1 font-semibold">
                      +{plan.creditsIncluded.toLocaleString()} Monthly Credits
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <div className="flex-1 space-y-2 text-xs text-slate-300 my-4 border-t border-rose-950/40 pt-4">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Button Action */}
                  <div className="pt-2">
                    {isFree ? (
                      <div className="w-full py-2 px-3 rounded-lg text-center text-xs font-medium text-slate-400 bg-white/[0.02] border border-white/[0.04]">
                        {isCurrent ? 'Current Tier' : 'Default Starter'}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCheckout(plan.id)}
                        disabled={!isStripeConfigured || checkoutLoading === plan.id}
                        className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          !isStripeConfigured
                            ? 'bg-white/[0.03] text-slate-500 border border-white/[0.05] cursor-not-allowed'
                            : isPro
                            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)] active:scale-98'
                            : 'bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-700/50 active:scale-98'
                        }`}
                      >
                        {checkoutLoading === plan.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : !isStripeConfigured ? (
                          <span>Not configured / unavailable</span>
                        ) : (
                          <>
                            <span>Subscribe with Stripe</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Past Payments / Invoices History */}
          {payments.length > 0 && (
            <div className="mt-6 pt-4 border-t border-rose-950/40">
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-400" />
                Payment & Invoice History
              </h4>
              <div className="overflow-x-auto rounded-xl border border-rose-950/40 bg-black/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-950/30 text-[10px] font-mono uppercase text-slate-400 border-b border-rose-950/40">
                    <tr>
                      <th className="px-3 py-2">Invoice / ID</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Credits Granted</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-950/30 text-slate-300">
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{p.id.slice(0, 14)}...</td>
                        <td className="px-3 py-2 font-mono font-bold text-white">${(p.amountCents / 100).toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-400">+{p.creditsGranted.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-rose-950/40 bg-black/60 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            <span>256-bit TLS encrypted transaction authorization</span>
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
