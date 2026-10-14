import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Check, Loader2, ShieldCheck, Clock, Receipt, ExternalLink, RefreshCw, Coins } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel } from "@/components/common";

const PLAN_FEATURES = {
  monthly: ["feat_signals", "feat_autotrade", "feat_scanner", "feat_alerts"],
  annual: ["feat_signals", "feat_autotrade", "feat_scanner", "feat_alerts", "feat_priority", "feat_save"],
  test: ["feat_test_quick", "feat_signals", "feat_autotrade"],
};

function planTitleKey(id) {
  return id === "annual" ? "plan_annual" : id === "test" ? "plan_test" : "plan_monthly";
}

function Price({ value }) {
  return (
    <span className="mono" dir="ltr">
      ${Number(value).toFixed(2)}
    </span>
  );
}

export default function Subscription() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [checking, setChecking] = useState(null);
  const [payCurrency, setPayCurrency] = useState("usdcsol");

  const PENDING = ["created", "waiting", "confirming", "confirmed", "sending", "partially_paid"];

  const checkStatus = async (orderId, silent = false) => {
    if (!silent) setChecking(orderId);
    try {
      const { data } = await api.post(`/payments/poll/${orderId}`);
      qc.invalidateQueries({ queryKey: ["billing-history"] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
      if (data.status === "paid") {
        qc.invalidateQueries({ queryKey: ["me"] });
        if (!silent) toast.success(t("payment_success"));
      } else if (!silent) {
        toast.message(t("payment_still_pending"));
      }
    } catch {
      if (!silent) toast.error(t("payment_error"));
    } finally {
      if (!silent) setChecking(null);
    }
  };

  const { data: sub } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get("/payments/subscription").then((r) => r.data),
    refetchInterval: params.get("paid") ? 5000 : false,
  });
  const { data: plansData } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get("/payments/plans").then((r) => r.data),
  });
  const { data: historyData } = useQuery({
    queryKey: ["billing-history"],
    queryFn: () => api.get("/payments/history").then((r) => r.data),
    refetchInterval: params.get("paid") ? 5000 : false,
  });

  useEffect(() => {
    if (params.get("paid")) {
      toast.success(t("payment_processing"));
    } else if (params.get("cancelled")) {
      toast.error(t("payment_cancelled"));
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.get("paid") && sub?.active) {
      toast.success(t("payment_success"));
      qc.invalidateQueries({ queryKey: ["me"] });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.active]);

  const plans = plansData?.plans || [];
  const ready = plansData?.gateway_ready;

  // Auto-poll pending orders directly against NOWPayments (fallback to the IPN
  // webhook) so the account upgrades even if a callback was missed.
  useEffect(() => {
    const pending = (historyData?.orders || []).filter((o) => PENDING.includes(o.status));
    if (pending.length === 0) return;
    const id = setInterval(() => {
      pending.forEach((o) => checkStatus(o.order_id, true));
    }, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData]);

  const upgrade = async (plan) => {
    setBusy(plan);
    setLastInvoice(null);
    // Open the tab synchronously INSIDE the click gesture: the preview runs in an
    // iframe and NOWPayments forbids framing (X-Frame-Options), so navigating the
    // current window fails. A new top-level tab also avoids popup blockers (which
    // would trigger if we opened it after the await).
    const win = window.open("about:blank", "_blank");
    try {
      const { data } = await api.post("/payments/checkout", { plan, pay_currency: payCurrency });
      if (data.invoice_url) {
        setLastInvoice(data.invoice_url);
        if (win && !win.closed) {
          win.location.href = data.invoice_url;
        } else {
          toast.message(t("popup_blocked"));
        }
      } else {
        if (win) win.close();
        toast.error(t("payment_error"));
      }
    } catch (err) {
      if (win) win.close();
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || t("payment_error"));
    } finally {
      setBusy(null);
    }
  };

  const active = sub?.active;

  return (
    <div>
      <PageTitle title={t("nav_subscription")} subtitle={t("subscription_subtitle")} />

      <div className="mb-6">
        <Panel title={t("current_plan")} testid="current-plan-panel">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${active ? "bg-gold/15 text-gold" : "bg-secondary text-muted-foreground"}`}>
                <Crown size={22} />
              </div>
              <div>
                <div className="text-lg font-bold" data-testid="plan-tier">
                  {active ? t("premium") : t("free_plan")}
                </div>
                {active && sub?.expires_at && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock size={13} />
                    {t("renews_on")}{" "}
                    <span className="mono" dir="ltr">{String(sub.expires_at).slice(0, 10)}</span>
                  </div>
                )}
              </div>
            </div>
            {active && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30" data-testid="plan-active-badge">
                {t("active")}
              </span>
            )}
          </div>
        </Panel>
      </div>

      {!ready && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm" data-testid="gateway-notice">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <span>{t("gateway_not_ready")}</span>
        </div>
      )}

      {lastInvoice && (
        <div className="mb-6 flex items-center justify-between gap-3 p-4 rounded-xl bg-primary/10 border border-primary/30 text-sm" data-testid="invoice-fallback">
          <span>{t("checkout_opened_hint")}</span>
          <a href={lastInvoice} target="_blank" rel="noreferrer"
            data-testid="invoice-fallback-link"
            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline shrink-0">
            {t("open_checkout")} <ExternalLink size={14} />
          </a>
        </div>
      )}

      <div className="mb-6" data-testid="pay-currency-selector">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Coins size={16} className="text-gold" /> {t("pay_currency_label")}
        </div>
        <div className="inline-flex flex-wrap gap-2">
          {(plansData?.pay_currencies || []).map((c) => (
            <button
              key={c.code}
              onClick={() => setPayCurrency(c.code)}
              data-testid={`pay-currency-${c.code}`}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                payCurrency === c.code
                  ? "bg-gold/15 text-gold border-gold/50"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t("pay_currency_hint")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((p) => (
          <div
            key={p.id}
            data-testid={`plan-card-${p.id}`}
            className={`relative rounded-2xl border p-6 transition-colors ${
              p.id === "annual" ? "border-gold/40 bg-gold/5" : "border-border bg-card"
            }`}
          >
            {p.id === "annual" && (
              <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-xs font-bold bg-gold text-black">
                {t("best_value")}
              </span>
            )}
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t(planTitleKey(p.id))}
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-extrabold"><Price value={p.price} /></span>
              <span className="text-sm text-muted-foreground mb-1">
                / <span dir="ltr">{p.days}</span> {t("days")}
              </span>
            </div>
            <ul className="mt-5 space-y-2.5">
              {(PLAN_FEATURES[p.id] || []).map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm">
                  <Check size={16} className="text-green-400 shrink-0" />
                  <span>{t(f)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => upgrade(p.id)}
              disabled={!ready || busy !== null}
              data-testid={`upgrade-btn-${p.id}`}
              className="fire-btn w-full mt-6 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy === p.id ? <Loader2 size={18} className="animate-spin" /> : <Crown size={18} />}
              {busy === p.id ? t("opening_checkout") : t("pay_with_crypto")}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Panel title={t("billing_history")} testid="billing-history-panel">
          {(historyData?.orders || []).length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center" data-testid="no-invoices">
              <Receipt size={16} /> {t("no_invoices")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="billing-history-table">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-start font-medium py-2 px-2">{t("date")}</th>
                    <th className="text-start font-medium py-2 px-2">{t("plan_col")}</th>
                    <th className="text-start font-medium py-2 px-2">{t("amount_col")}</th>
                    <th className="text-start font-medium py-2 px-2">{t("status_col")}</th>
                    <th className="text-end font-medium py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.orders.map((o) => (
                    <tr key={o.order_id} className="border-b border-border/50" data-testid={`invoice-row-${o.order_id}`}>
                      <td className="py-2.5 px-2 mono" dir="ltr">{String(o.created_at || "").slice(0, 10)}</td>
                      <td className="py-2.5 px-2">{t(planTitleKey(o.plan))}</td>
                      <td className="py-2.5 px-2 mono" dir="ltr">${Number(o.amount).toFixed(2)}</td>
                      <td className="py-2.5 px-2">
                        <StatusBadge status={o.status} t={t} />
                      </td>
                      <td className="py-2.5 px-2 text-end">
                        <div className="inline-flex items-center gap-3 justify-end">
                          {PENDING.includes(o.status) && (
                            <button
                              onClick={() => checkStatus(o.order_id)}
                              disabled={checking === o.order_id}
                              data-testid={`check-status-${o.order_id}`}
                              className="inline-flex items-center gap-1 text-xs text-gold hover:underline disabled:opacity-50">
                              <RefreshCw size={12} className={checking === o.order_id ? "animate-spin" : ""} />
                              {checking === o.order_id ? t("checking") : t("check_status")}
                            </button>
                          )}
                          {o.status !== "paid" && o.invoice_url && (
                            <a href={o.invoice_url} target="_blank" rel="noreferrer"
                              data-testid={`invoice-link-${o.order_id}`}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              {t("view_invoice")} <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  paid: "bg-green-500/15 text-green-400 border-green-500/30",
  created: "bg-secondary text-muted-foreground border-border",
  partially_paid: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  expired: "bg-secondary text-muted-foreground border-border",
  failed: "bg-destructive/15 text-danger border-destructive/30",
  refunded: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  cancelled: "bg-secondary text-muted-foreground border-border",
  canceled: "bg-secondary text-muted-foreground border-border",
};

function StatusBadge({ status, t }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.created;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`} data-testid={`invoice-status-${status}`}>
      {t(`status_${status}`)}
    </span>
  );
}
