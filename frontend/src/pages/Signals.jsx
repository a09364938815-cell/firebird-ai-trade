import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor, actionColor } from "@/components/common";

const TFS = ["5m", "15m", "1h", "4h", "1d"];

export default function Signals() {
  const { t } = useI18n();
  const [tf, setTf] = useState("1h");
  const { data } = useQuery({
    queryKey: ["signals-all", tf],
    queryFn: () => api.get(`/market/signals?interval=${tf}`).then((r) => r.data),
    refetchInterval: 25000,
  });

  return (
    <div>
      <PageTitle title={t("nav_signals")} subtitle="AI + technical scoring across coins" />
      <div className="flex gap-2 mb-4">
        {TFS.map((f) => (
          <button key={f} onClick={() => setTf(f)} data-testid={`signals-tf-${f}`}
            className={`px-3 py-1 rounded-md text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
            {f}
          </button>
        ))}
      </div>
      <Panel testid="signals-list">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider text-left">
                <th className="py-2">{t("symbol")}</th>
                <th>{t("price")}</th>
                <th>{t("change_24h")}</th>
                <th>RSI</th>
                <th>{t("score")}</th>
                <th>{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((s) => (
                <tr key={s.symbol} className="border-t border-border/50" data-testid={`signal-row-${s.symbol}`}>
                  <td className="py-2.5 font-head font-bold">{s.symbol}</td>
                  <td className="mono">${fmt(s.price)}</td>
                  <td className={`mono ${pnlColor(s.change_24h)}`}>{s.change_24h > 0 ? "+" : ""}{fmt(s.change_24h)}%</td>
                  <td className="mono">{s.rsi}</td>
                  <td className="mono text-gold">{s.score}</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${actionColor(s.action)}`}>{s.action}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
