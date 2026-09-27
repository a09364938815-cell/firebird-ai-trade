import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor } from "@/components/common";

export default function Positions() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [wAmount, setWAmount] = React.useState(20);
  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get("/trading/portfolio").then((r) => r.data),
    refetchInterval: 15000,
  });
  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get("/trading/reports").then((r) => r.data),
    refetchInterval: 20000,
  });

  const closeOne = async (id) => {
    try {
      const { data } = await api.post(`/trading/positions/${id}/close`);
      toast.success(`Closed · PnL $${data.pnl}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const resetDemo = async () => {
    try {
      await api.post("/trading/demo/reset");
      toast.success(t("reset_demo"));
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const withdraw = async () => {
    try {
      const { data } = await api.post("/trading/wallet/withdraw", { amount: Number(wAmount) });
      toast.success(data.message + ` Net $${data.net}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const r = reports.data;
  const positions = portfolio.data?.positions || [];

  return (
    <div>
      <PageTitle title={t("nav_positions")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("total_trades")} value={r?.total_trades ?? 0} />
        <Stat label={t("win_rate")} value={`${r?.win_rate ?? 0}%`} accent="text-gold" />
        <Stat label={t("total_pnl")} value={`${(r?.total_pnl ?? 0) >= 0 ? "+" : ""}$${fmt(r?.total_pnl ?? 0)}`} accent={pnlColor(r?.total_pnl ?? 0)} />
        <Stat label="W / L" value={`${r?.wins ?? 0} / ${r?.losses ?? 0}`} />
      </div>

      <Panel className="mb-6" testid="wallet-withdraw"
        title="Withdraw (Demo Wallet)">
        <p className="text-xs text-muted-foreground mb-3">Withdrawing before 7 days from your last deposit applies a 5% early-withdrawal fee (owner share).</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Amount (USD)</label>
            <input type="number" min={1} value={wAmount} onChange={(e) => setWAmount(e.target.value)}
              data-testid="withdraw-amount-input"
              className="w-40 mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
          </div>
          <button onClick={withdraw} data-testid="withdraw-button"
            className="px-5 py-2 rounded-lg font-semibold border border-gold/40 text-gold hover:bg-gold/10">
            Withdraw
          </button>
        </div>
      </Panel>

      <Panel title={`${t("nav_positions")} · Open`} className="mb-6"
        right={<button onClick={resetDemo} data-testid="reset-demo-button" className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary"><RotateCcw size={13} />{t("reset_demo")}</button>}
        testid="open-positions">
        {positions.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{t("no_positions")}</div>
        ) : (
          <div className="space-y-2">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-secondary/40">
                <div><span className="font-head font-bold">{p.symbol}</span><span className="text-xs text-muted-foreground ml-2">{p.side} · {p.source}</span></div>
                <div className="flex items-center flex-wrap gap-2 sm:gap-5 text-xs sm:text-sm">
                  <span className="mono">${fmt(p.entry_price)} → ${fmt(p.current_price)}</span>
                  <span className={`mono w-20 text-right ${pnlColor(p.pnl)}`}>{p.pnl > 0 ? "+" : ""}${fmt(p.pnl)}</span>
                  <button onClick={() => closeOne(p.id)} className="text-xs px-3 py-1 rounded-md border border-border hover:border-destructive hover:text-danger">{t("close")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Trade History" testid="trade-history">
        {(r?.trades || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No closed trades yet</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase text-left">
                <th className="py-2">{t("symbol")}</th><th>{t("action")}</th><th>{t("entry")}</th><th>Exit</th><th>{t("pnl")}</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {r.trades.map((tr) => (
                <tr key={tr.id} className="border-t border-border/50">
                  <td className="py-2.5 font-head font-bold">{tr.symbol}</td>
                  <td className="text-xs">{tr.side} · {tr.source}</td>
                  <td className="mono">${fmt(tr.entry_price)}</td>
                  <td className="mono">${fmt(tr.exit_price)}</td>
                  <td className={`mono ${pnlColor(tr.pnl)}`}>{tr.pnl > 0 ? "+" : ""}${fmt(tr.pnl)}</td>
                  <td className="text-xs text-muted-foreground">{tr.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
