import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor } from "@/components/common";

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "DOT", "MATIC"];

export default function ManualTrade() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTC");
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);

  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get("/trading/portfolio").then((r) => r.data),
    refetchInterval: 15000,
  });
  const coins = useQuery({ queryKey: ["coins"], queryFn: () => api.get("/market/coins").then((r) => r.data) });
  const price = coins.data?.find((c) => c.symbol === symbol)?.price;

  const trade = async (side) => {
    setBusy(true);
    try {
      const { data } = await api.post("/trading/manual", { symbol, side, usd_amount: Number(amount) });
      toast.success(side === "BUY" ? `Opened ${symbol} position` : `Closed ${symbol} · PnL $${data.pnl ?? 0}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const closeOne = async (id) => {
    try {
      const { data } = await api.post(`/trading/positions/${id}/close`);
      toast.success(`Closed · PnL $${data.pnl}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_manual")} subtitle={t("disclaimer")} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title={t("open_position")} testid="manual-trade-panel">
          <label className="text-xs text-muted-foreground">{t("symbol")}</label>
          <div className="flex flex-wrap gap-2 my-2">
            {SYMBOLS.map((s) => (
              <button key={s} onClick={() => setSymbol(s)} data-testid={`manual-symbol-${s}`}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${symbol === s ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="text-sm text-muted-foreground mb-3">
            {t("price")}: <span className="mono text-foreground">${fmt(price)}</span>
          </div>
          <label className="text-xs text-muted-foreground">{t("amount_usd")}</label>
          <input type="number" value={amount} min={1} onChange={(e) => setAmount(e.target.value)}
            data-testid="manual-amount-input"
            className="w-full mt-1 mb-4 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
          <div className="grid grid-cols-2 gap-3">
            <button disabled={busy} onClick={() => trade("BUY")} data-testid="manual-buy-button"
              className="py-2.5 rounded-lg font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30 disabled:opacity-50">
              {t("buy")}
            </button>
            <button disabled={busy} onClick={() => trade("SELL")} data-testid="manual-sell-button"
              className="py-2.5 rounded-lg font-semibold bg-destructive/20 text-danger border border-destructive/40 hover:bg-destructive/30 disabled:opacity-50">
              {t("sell")}
            </button>
          </div>
        </Panel>

        <Panel title={t("nav_positions")} className="lg:col-span-2" testid="manual-positions">
          {(portfolio.data?.positions || []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">{t("no_positions")}</div>
          ) : (
            <div className="space-y-2">
              {portfolio.data.positions.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40" data-testid={`position-${p.symbol}`}>
                  <div>
                    <span className="font-head font-bold">{p.symbol}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.side} · {p.source}</span>
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    <span className="mono">{t("entry")} ${fmt(p.entry_price)}</span>
                    <span className="mono">{t("current")} ${fmt(p.current_price)}</span>
                    <span className={`mono w-20 text-right ${pnlColor(p.pnl)}`}>{p.pnl > 0 ? "+" : ""}${fmt(p.pnl)}</span>
                    <button onClick={() => closeOne(p.id)} data-testid={`close-${p.symbol}`}
                      className="text-xs px-3 py-1 rounded-md border border-border hover:border-destructive hover:text-danger">
                      {t("close")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
