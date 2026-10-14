import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor, toLatin } from "@/components/common";

export default function Positions() {
  const { t, tv } = useI18n();
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
  const nftPositions = useQuery({
    queryKey: ["nft-positions"],
    queryFn: () => api.get("/trading/nft/positions").then((r) => r.data),
    refetchInterval: 30000,
  });
  const nftHistory = useQuery({
    queryKey: ["nft-history"],
    queryFn: () => api.get("/trading/nft/history").then((r) => r.data),
    refetchInterval: 30000,
  });

  const closeNft = async (id) => {
    try {
      const { data } = await api.post(`/trading/nft/positions/${id}/close`);
      toast.success(`${t("close")} · ${t("pnl")} $${data.pnl}`);
      qc.invalidateQueries({ queryKey: ["nft-positions"] });
      qc.invalidateQueries({ queryKey: ["nft-history"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const closeOne = async (id) => {
    try {
      const { data } = await api.post(`/trading/positions/${id}/close`);
      toast.success(`${t("close")} · ${t("pnl")} $${data.pnl}`);
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
      toast.success(data.message + ` · $${data.net}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const r = reports.data;
  const positions = portfolio.data?.positions || [];
  const trades = r?.trades || [];

  return (
    <div>
      <PageTitle title={t("nav_positions")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("total_trades")} value={r?.total_trades ?? 0} />
        <Stat label={t("win_rate")} value={`${r?.win_rate ?? 0}%`} accent="text-gold" />
        <Stat label={t("total_pnl")} value={`${(r?.total_pnl ?? 0) >= 0 ? "+" : ""}$${fmt(r?.total_pnl ?? 0)}`} accent={pnlColor(r?.total_pnl ?? 0)} />
        <Stat label={t("wl")} value={`${r?.wins ?? 0} / ${r?.losses ?? 0}`} />
      </div>

      <Panel className="mb-6" testid="wallet-withdraw" title={t("withdraw_demo_wallet")}>
        <p className="text-xs text-muted-foreground mb-3">{t("withdraw_fee_note")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("amount_usd")}</label>
            <input type="text" inputMode="decimal" dir="ltr" value={wAmount} onChange={(e) => setWAmount(toLatin(e.target.value))}
              data-testid="withdraw-amount-input"
              className="w-40 mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
          </div>
          <button onClick={withdraw} data-testid="withdraw-button"
            className="px-5 py-2 rounded-lg font-semibold border border-gold/40 text-gold hover:bg-gold/10">
            {t("withdraw")}
          </button>
        </div>
      </Panel>

      <Panel title={`${t("crypto_positions_title")} · ${t("open_label")}`} className="mb-6"
        right={<button onClick={resetDemo} data-testid="reset-demo-button" className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary"><RotateCcw size={13} />{t("reset_demo")}</button>}
        testid="open-positions">
        {positions.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{t("no_positions")}</div>
        ) : (
          <div className="space-y-2">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-secondary/40">
                <div><span className="font-head font-bold">{p.symbol}</span><span className="text-xs text-muted-foreground ml-2">{tv(p.side)} · {tv(p.source)}</span></div>
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

      <Panel title={<span className="flex items-center gap-2">{t("nft_positions_title")} <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-[#B026FF]/15 text-[#B026FF] border border-[#B026FF]/30">{t("nft_badge")}</span></span>} className="mb-6" testid="nft-positions">
        {(nftPositions.data || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{t("no_nft_positions")}</div>
        ) : (
          <div className="space-y-2">
            {nftPositions.data.map((p) => (
              <div key={p.id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-secondary/40" data-testid={`nft-position-${p.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {p.nft_image && <img src={p.nft_image} alt="" className="w-9 h-9 rounded-md object-cover shrink-0" />}
                  <div className="min-w-0">
                    <span className="font-head font-bold text-sm truncate block">{p.nft_name}</span>
                    <span className="text-xs text-muted-foreground">{tv(p.side)}</span>
                  </div>
                </div>
                <div className="flex items-center flex-wrap gap-2 sm:gap-5 text-xs sm:text-sm">
                  <span className="mono" dir="ltr">{fmt(p.entry_floor_eth, 3)}Ξ → {fmt(p.current_floor_eth, 3)}Ξ</span>
                  <span className={`mono w-20 text-right ${pnlColor(p.pnl)}`} dir="ltr">{p.pnl > 0 ? "+" : ""}${fmt(p.pnl)}</span>
                  <button onClick={() => closeNft(p.id)} data-testid={`nft-close-${p.id}`}
                    className="text-xs px-3 py-1 rounded-md border border-border hover:border-destructive hover:text-danger">{t("close")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={t("nft_trade_history")} className="mb-6" testid="nft-trade-history"
        right={nftHistory.data?.total_trades ? <span className={`mono text-sm ${pnlColor(nftHistory.data.total_pnl)}`} dir="ltr">{nftHistory.data.total_pnl > 0 ? "+" : ""}${fmt(nftHistory.data.total_pnl)} · {nftHistory.data.wins}/{nftHistory.data.losses}</span> : null}>
        {(nftHistory.data?.trades || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{t("no_nft_trades")}</div>
        ) : (
          <div className="space-y-2">
            {nftHistory.data.trades.map((tr) => (
              <div key={tr.id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-secondary/40" data-testid={`nft-trade-${tr.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {tr.nft_image && <img src={tr.nft_image} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />}
                  <div className="min-w-0">
                    <span className="font-head font-bold text-sm truncate block">{tr.nft_name}</span>
                    <span className="text-xs text-muted-foreground">{tv(tr.side)}</span>
                  </div>
                </div>
                <div className="flex items-center flex-wrap gap-2 sm:gap-5 text-xs sm:text-sm">
                  <span className="mono" dir="ltr">{fmt(tr.entry_floor_eth, 3)}Ξ → {fmt(tr.exit_floor_eth, 3)}Ξ</span>
                  <span className={`mono w-20 text-right ${pnlColor(tr.pnl)}`} dir="ltr">{tr.pnl > 0 ? "+" : ""}${fmt(tr.pnl)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={t("trade_history")} testid="trade-history">
        {trades.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{t("no_closed_trades")}</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase text-start">
                    <th className="py-2 text-start">{t("symbol")}</th><th className="text-start">{t("action")}</th><th className="text-start">{t("entry")}</th><th className="text-start">{t("exit")}</th><th className="text-start">{t("pnl")}</th><th className="text-start">{t("reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((tr) => (
                    <tr key={tr.id} className="border-t border-border/50">
                      <td className="py-2.5 font-head font-bold">{tr.symbol}</td>
                      <td className="text-xs">{tv(tr.side)} · {tv(tr.source)}</td>
                      <td className="mono">${fmt(tr.entry_price)}</td>
                      <td className="mono">${fmt(tr.exit_price)}</td>
                      <td className={`mono ${pnlColor(tr.pnl)}`}>{tr.pnl > 0 ? "+" : ""}${fmt(tr.pnl)}</td>
                      <td className="text-xs text-muted-foreground">{tv(tr.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {trades.map((tr) => (
                <div key={tr.id} className="p-3 rounded-lg bg-secondary/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-head font-bold">{tr.symbol}</span>
                    <span className={`mono ${pnlColor(tr.pnl)}`}>{tr.pnl > 0 ? "+" : ""}${fmt(tr.pnl)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tv(tr.side)} · {tv(tr.source)}</span>
                    <span className="mono">${fmt(tr.entry_price)} → ${fmt(tr.exit_price)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{tv(tr.reason)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
