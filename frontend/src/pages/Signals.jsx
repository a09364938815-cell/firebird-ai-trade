import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor, actionColor } from "@/components/common";

const TFS = ["5m", "15m", "1h", "4h", "1d"];

export default function Signals() {
  const { t, tv } = useI18n();
  const [tf, setTf] = useState("1h");
  const { data } = useQuery({
    queryKey: ["signals-all", tf],
    queryFn: () => api.get(`/market/signals?interval=${tf}`).then((r) => r.data),
    refetchInterval: 25000,
  });

  const rows = data || [];

  return (
    <div>
      <PageTitle title={t("nav_signals")} subtitle={t("signals_subtitle")} />
      <div className="flex gap-2 mb-4">
        {TFS.map((f) => (
          <button key={f} onClick={() => setTf(f)} data-testid={`signals-tf-${f}`}
            className={`px-3 py-1 rounded-md text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
            {f}
          </button>
        ))}
      </div>
      <Panel testid="signals-list">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider text-start">
                <th className="py-2 text-start">{t("symbol")}</th>
                <th className="text-start">{t("price")}</th>
                <th className="text-start">{t("change_24h")}</th>
                <th className="text-start">RSI</th>
                <th className="text-start">{t("score")}</th>
                <th className="text-start">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.symbol} className="border-t border-border/50" data-testid={`signal-row-${s.symbol}`}>
                  <td className="py-2.5 font-head font-bold">{s.symbol}</td>
                  <td className="mono">${fmt(s.price)}</td>
                  <td className={`mono ${pnlColor(s.change_24h)}`}>{s.change_24h > 0 ? "+" : ""}{fmt(s.change_24h)}%</td>
                  <td className="mono">{s.rsi}</td>
                  <td className="mono text-gold">{s.score}</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${actionColor(s.action)}`}>{tv(s.action)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {rows.map((s) => (
            <div key={s.symbol} className="p-3 rounded-lg bg-secondary/40" data-testid={`signal-card-${s.symbol}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-head font-bold">{s.symbol}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${actionColor(s.action)}`}>{tv(s.action)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="mono">${fmt(s.price)}</span>
                <span className={`mono ${pnlColor(s.change_24h)}`}>{s.change_24h > 0 ? "+" : ""}{fmt(s.change_24h)}%</span>
                <span className="mono">RSI {s.rsi}</span>
                <span className="mono text-gold">{t("score")} {s.score}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
