import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { Panel, PageTitle, fmt, pnlColor, actionColor } from "@/components/common";
import CandleChart from "@/components/CandleChart";

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK"];
const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function Charts() {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState("BTC");
  const [tf, setTf] = useState("1h");

  const klines = useQuery({
    queryKey: ["klines", symbol, tf],
    queryFn: () => api.get(`/market/klines?symbol=${symbol}&interval=${tf}&limit=120`).then((r) => r.data),
    refetchInterval: 20000,
  });
  const signals = useQuery({
    queryKey: ["signals", tf],
    queryFn: () => api.get(`/market/signals?interval=${tf}`).then((r) => r.data),
    refetchInterval: 30000,
  });

  const candles = klines.data?.candles || [];
  const last = candles.length ? candles[candles.length - 1][4] : null;
  const sig = (signals.data || []).find((s) => s.symbol === symbol);

  return (
    <div>
      <PageTitle title={t("nav_charts")} />
      <div className="flex flex-wrap gap-2 mb-4">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            data-testid={`chart-symbol-${s}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              symbol === s ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        {TFS.map((f) => (
          <button
            key={f}
            onClick={() => setTf(f)}
            data-testid={`chart-tf-${f}`}
            className={`px-3 py-1 rounded-md text-xs mono border transition-colors ${
              tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Panel className="lg:col-span-3" testid="chart-panel"
          title={<span className="font-head">{symbol}/USDT · <span className="mono text-gold">${fmt(last)}</span></span>}
          right={klines.data?.simulated && <span className="text-[10px] text-muted-foreground">simulated feed</span>}
        >
          <CandleChart candles={candles} />
        </Panel>

        <Panel title={t("nav_signals")} testid="chart-signal">
          {sig ? (
            <div className="space-y-3">
              <div className={`inline-block text-sm px-3 py-1 rounded-full border ${actionColor(sig.action)}`}>
                {sig.action} · {sig.score}/100
              </div>
              <Row label="RSI" value={sig.rsi} />
              <Row label="SMA9" value={`$${fmt(sig.sma_fast)}`} />
              <Row label="SMA21" value={`$${fmt(sig.sma_slow)}`} />
              <Row label="Momentum" value={`${fmt(sig.momentum)}%`} cls={pnlColor(sig.momentum)} />
              <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">{sig.reason}</p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value, cls }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`mono ${cls || ""}`}>{value}</span>
    </div>
  );
}
