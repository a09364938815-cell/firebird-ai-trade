import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Users, DollarSign, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor } from "@/components/common";

export default function OwnerPanel() {
  const { t } = useI18n();
  const overview = useQuery({
    queryKey: ["owner-overview"],
    queryFn: () => api.get("/owner/overview").then((r) => r.data),
    refetchInterval: 20000,
  });
  const comm = useQuery({
    queryKey: ["owner-commissions"],
    queryFn: () => api.get("/owner/commissions").then((r) => r.data),
    refetchInterval: 30000,
  });

  const o = overview.data;
  const users = o?.users || [];

  return (
    <div>
      <PageTitle title={<span className="flex items-center gap-2"><Crown size={24} className="text-gold" /> {t("owner_console")}</span>}
        subtitle={t("owner_subtitle")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("total_users")} value={o?.total_users ?? "—"} accent="fire-text" />
        <Stat label={t("total_commission")} value={`$${fmt(o?.total_commission ?? 0, 2)}`} accent="text-gold" sub={t("all_time")} />
        <Stat label={t("this_week")} value={`$${fmt(o?.weekly_commission ?? 0, 2)}`} sub={t("settles_weekly")} />
        <Stat label={t("total_volume")} value={`$${fmt(o?.total_volume ?? 0)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title={t("commission_breakdown")} testid="owner-commission">
          <div className="space-y-3 text-sm">
            <Row icon={TrendingUp} label={t("from_trade_profits")} value={`$${fmt(o?.commission_from_trades ?? 0, 2)}`} />
            <Row icon={DollarSign} label={t("from_withdrawal_fees")} value={`$${fmt(o?.commission_from_fees ?? 0, 2)}`} />
            <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground">
              {t("owner_rate")}: <span className="text-gold num">{o?.owner_rate_pct ?? 2}%</span> · {t("settlement")}: {t("weekly")} · {t("early_exit_fee")}: <span className="num">{o?.early_withdrawal_fee_pct ?? 5}%</span>
            </div>
          </div>
        </Panel>

        <Panel title={t("daily_accrual")} testid="owner-daily" className="lg:col-span-2">
          {(comm.data?.daily || []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">{t("no_commission_yet")}</div>
          ) : (
            <div className="space-y-2">
              {comm.data.daily.slice(0, 8).map((d) => (
                <div key={d.date} className="flex items-center justify-between text-sm">
                  <span className="mono text-muted-foreground">{d.date}</span>
                  <div className="flex-1 mx-3 h-2 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full fire-btn" style={{ width: `${Math.min(100, d.amount * 200)}%` }} />
                  </div>
                  <span className="mono text-gold">${fmt(d.amount, 3)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title={<span className="flex items-center gap-2"><Users size={18} /> {t("users_performance")}</span>} className="mt-6" testid="owner-users">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase text-start">
                <th className="py-2 text-start">{t("col_user")}</th><th className="text-start">{t("col_role")}</th><th className="text-start">{t("col_joined")}</th><th className="text-start">{t("trades")}</th><th className="text-start">{t("win_rate")}</th><th className="text-start">{t("col_volume")}</th><th className="text-start">{t("pnl")}</th><th className="text-start">{t("col_balance")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={`${u.email}-${i}`} className="border-t border-border/50" data-testid={`owner-user-${i}`}>
                  <td className="py-2.5 mono">{u.email}</td>
                  <td>{u.role === "admin" ? <span className="text-gold text-xs">{t("role_owner")}</span> : <span className="text-xs text-muted-foreground">{t("role_user")}</span>}</td>
                  <td className="mono text-xs">{u.joined}</td>
                  <td className="mono">{u.trades}</td>
                  <td className="mono">{u.win_rate}%</td>
                  <td className="mono">${fmt(u.volume)}</td>
                  <td className={`mono ${pnlColor(u.total_pnl)}`}>{u.total_pnl > 0 ? "+" : ""}${fmt(u.total_pnl)}</td>
                  <td className="mono">${fmt(u.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {users.map((u, i) => (
            <div key={`${u.email}-${i}`} className="p-3 rounded-lg bg-secondary/40" data-testid={`owner-user-card-${i}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="mono text-xs">{u.email}</span>
                {u.role === "admin" ? <span className="text-gold text-xs">{t("role_owner")}</span> : <span className="text-xs text-muted-foreground">{t("role_user")}</span>}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="mono">{t("trades")} {u.trades}</span>
                <span className="mono">{u.win_rate}%</span>
                <span className="mono">${fmt(u.volume)}</span>
                <span className={`mono ${pnlColor(u.total_pnl)}`}>{u.total_pnl > 0 ? "+" : ""}${fmt(u.total_pnl)}</span>
                <span className="mono">${fmt(u.balance)}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground"><Icon size={15} /> {label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
