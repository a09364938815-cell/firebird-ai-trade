import React, { useState } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor } from "@/components/common";

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "DOGE", "AVAX"];
const TFS = ["15m", "1h", "4h", "1d"];

export default function Backtest() {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState("BTC");
  const [tf, setTf] = useState("1h");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/trading/backtest?symbol=${symbol}&interval=${tf}`);
      setResult(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_backtest")} subtitle={t("bt_subtitle")} />
      <Panel className="mb-6" testid="backtest-config">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("symbol")}</label>
            <div className="flex gap-2 mt-1">
              {SYMBOLS.map((s) => (
                <button key={s} onClick={() => setSymbol(s)} data-testid={`bt-symbol-${s}`}
                  className={`px-2.5 py-1 rounded-md text-xs border ${symbol === s ? "bg-primary/15 text-primary border-primary/40" : "border-border"}`}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("timeframe")}</label>
            <div className="flex gap-2 mt-1">
              {TFS.map((f) => (
                <button key={f} onClick={() => setTf(f)} data-testid={`bt-tf-${f}`}
                  className={`px-2.5 py-1 rounded-md text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border"}`}>{f}</button>
              ))}
            </div>
          </div>
          <button onClick={run} disabled={busy} data-testid="backtest-run-button"
            className="fire-btn px-5 py-2 rounded-lg font-semibold disabled:opacity-60">
            {busy ? t("running") : t("run_backtest")}
          </button>
        </div>
      </Panel>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label={t("total_trades")} value={result.total_trades} />
            <Stat label={t("win_rate")} value={`${result.overall_win_rate}%`} accent="text-gold" />
            <Stat label={t("return_label")} value={`${result.overall_return_pct > 0 ? "+" : ""}${result.overall_return_pct}%`} accent={pnlColor(result.overall_return_pct)} />
          </div>
          <Panel title={t("window_results")} testid="backtest-results">
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase text-start">
                  <th className="py-2 text-start">{t("window")}</th><th className="text-start">{t("trades")}</th><th className="text-start">{t("win_rate")}</th><th className="text-start">{t("return_label")}</th>
                </tr>
              </thead>
              <tbody>
                {result.windows.map((w) => (
                  <tr key={w.window} className="border-t border-border/50">
                    <td className="py-2.5 mono">#{w.window}</td>
                    <td className="mono">{w.trades}</td>
                    <td className="mono">{w.win_rate}%</td>
                    <td className={`mono ${pnlColor(w.return_pct)}`}>{w.return_pct > 0 ? "+" : ""}{w.return_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="sm:hidden space-y-2">
              {result.windows.map((w) => (
                <div key={w.window} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 text-xs">
                  <span className="mono font-bold">#{w.window}</span>
                  <span className="mono">{t("trades")} {w.trades}</span>
                  <span className="mono">{w.win_rate}%</span>
                  <span className={`mono ${pnlColor(w.return_pct)}`}>{w.return_pct > 0 ? "+" : ""}{w.return_pct}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">{result.disclaimer}</p>
          </Panel>
        </>
      )}
    </div>
  );
}
