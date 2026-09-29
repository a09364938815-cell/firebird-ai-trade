import React, { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import { API } from "@/lib/api";

const UP = "#26a17b";
const DOWN = "#e5484d";
const volColor = (o, c) => (c >= o ? "rgba(38,161,123,0.5)" : "rgba(229,72,77,0.5)");

// Money Flow Index (MFI, 14): a volume-weighted RSI that gauges buying vs selling pressure.
function computeMFI(candles, vols, period = 14) {
  const out = [];
  const tp = candles.map((k) => (k.high + k.low + k.close) / 3);
  const rmf = tp.map((v, i) => v * (vols[i] || 0));
  for (let i = 0; i < candles.length; i++) {
    if (i < period) continue;
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += rmf[j];
      else if (tp[j] < tp[j - 1]) neg += rmf[j];
    }
    const mfi = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    out.push({ time: candles[i].time, value: +mfi.toFixed(1) });
  }
  return out;
}

async function loadHistory(symbol, interval) {
  const map = (raw) =>
    raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=300`);
    if (r.ok) return map(await r.json());
  } catch { /* blocked → backend fallback */ }
  try {
    const r = await fetch(`${API}/market/klines?symbol=${symbol}&interval=${interval}&limit=300`);
    const d = await r.json();
    return map(d.candles || []);
  } catch { return []; }
}

export function TradingChart({ symbol, interval, onFlow }) {
  const containerRef = useRef(null);
  const [flow, setFlow] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let ws = null;

    const chart = createChart(el, {
      autoSize: true,
      localization: { locale: "en-US" },
      layout: { background: { color: "transparent" }, textColor: "#9aa0aa", fontFamily: "JetBrains Mono, monospace" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
    });

    // Pane 1: Volume histogram (green/red).
    const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, 1);

    // Pane 2: Money Flow Index (MFI 14) line with 20/80 guides.
    const mfiSeries = chart.addSeries(LineSeries, { color: "#f7931a", lineWidth: 2, priceLineVisible: false }, 2);

    let candles = [];
    let mfi = [];

    const refreshFlow = () => {
      const last = mfi.length ? mfi[mfi.length - 1].value : null;
      if (last == null) return;
      const label = last >= 80 ? "Overbought" : last <= 20 ? "Oversold" : last >= 50 ? "Bullish inflow" : "Bearish outflow";
      const meta = { mfi: last, label, positive: last >= 50 };
      setFlow(meta);
      onFlow && onFlow(meta);
    };

    (async () => {
      candles = await loadHistory(symbol, interval);
      if (disposed) return;
      candleSeries.setData(candles.map((k) => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close })));
      volSeries.setData(candles.map((k) => ({ time: k.time, value: k.volume, color: volColor(k.open, k.close) })));
      mfi = computeMFI(candles, candles.map((k) => k.volume));
      mfiSeries.setData(mfi);
      mfiSeries.createPriceLine({ price: 80, color: "rgba(229,72,77,0.4)", lineWidth: 1, lineStyle: 2 });
      mfiSeries.createPriceLine({ price: 20, color: "rgba(38,161,123,0.4)", lineWidth: 1, lineStyle: 2 });
      chart.timeScale().fitContent();
      const panes = chart.panes();
      if (panes[0]) panes[0].setHeight(280);
      if (panes[1]) panes[1].setHeight(90);
      if (panes[2]) panes[2].setHeight(90);
      refreshFlow();

      // Live candle + volume via Binance kline WebSocket (runs in the browser).
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}usdt@kline_${interval}`);
        ws.onmessage = (ev) => {
          try {
            const k = JSON.parse(ev.data).k;
            if (!k) return;
            const bar = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
            candleSeries.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
            volSeries.update({ time: bar.time, value: bar.volume, color: volColor(bar.open, bar.close) });
            const lastIdx = candles.length - 1;
            if (lastIdx >= 0 && candles[lastIdx].time === bar.time) candles[lastIdx] = bar;
            else candles.push(bar);
            mfi = computeMFI(candles, candles.map((c) => c.volume));
            mfiSeries.setData(mfi);
            refreshFlow();
          } catch {}
        };
      } catch {}
    })();

    return () => {
      disposed = true;
      try { ws && ws.close(); } catch {}
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  return (
    <div>
      <div ref={containerRef} data-testid="trading-chart" className="w-full h-[460px]" />
      <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(38,161,123,0.6)" }} /> Volume up</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(229,72,77,0.6)" }} /> Volume down</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: "#f7931a" }} /> Money Flow (MFI 14)</span>
        </span>
        {flow && (
          <span data-testid="money-flow-reading" className={`mono font-medium ${flow.positive ? "text-success" : "text-danger"}`}>
            MFI {flow.mfi} · {flow.label}
          </span>
        )}
      </div>
    </div>
  );
}
