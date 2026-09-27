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

  return (
    <div>
      <PageTitle title={<span className="flex items-center gap-2"><Crown size={24} className="text-gold" /> Owner Console</span>}
        subtitle="View-only performance of all users · commission ledger (2% per profitable trade, weekly settlement · 5% early-withdrawal fee)" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Total Users" value={o?.total_users ?? "—"} accent="fire-text" />
        <Stat label="Total Commission" value={`$${fmt(o?.total_commission ?? 0, 2)}`} accent="text-gold" sub="all-time" />
        <Stat label="This Week" value={`$${fmt(o?.weekly_commission ?? 0, 2)}`} sub="settles weekly" />
        <Stat label="Total Volume" value={`$${fmt(o?.total_volume ?? 0)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Commission Breakdown" testid="owner-commission">
          <div className="space-y-3 text-sm">
            <Row icon={TrendingUp} label="From trade profits (2%)" value={`$${fmt(o?.commission_from_trades ?? 0, 2)}`} />
            <Row icon={DollarSign} label="From early-withdrawal fees (5%)" value={`$${fmt(o?.commission_from_fees ?? 0, 2)}`} />
            <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground">
              Owner rate: <span className="text-gold">{o?.owner_rate_pct ?? 2}%</span> · Settlement: {o?.settlement ?? "Weekly"} · Early-exit fee: {o?.early_withdrawal_fee_pct ?? 5}%
            </div>
          </div>
        </Panel>

        <Panel title="Daily Accrual" testid="owner-daily" className="lg:col-span-2">
          {(comm.data?.daily || []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No commission yet — accrues on profitable trades.</div>
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

      <Panel title={<span className="flex items-center gap-2"><Users size={18} /> Users Performance (view-only)</span>} className="mt-6" testid="owner-users">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase text-left">
                <th className="py-2">User</th><th>Role</th><th>Joined</th><th>Trades</th><th>Win Rate</th><th>Volume</th><th>PnL</th><th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {(o?.users || []).map((u, i) => (
                <tr key={`${u.email}-${i}`} className="border-t border-border/50" data-testid={`owner-user-${i}`}>
                  <td className="py-2.5 mono">{u.email}</td>
                  <td>{u.role === "admin" ? <span className="text-gold text-xs">owner</span> : <span className="text-xs text-muted-foreground">user</span>}</td>
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
