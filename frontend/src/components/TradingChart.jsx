import React, { useEffect, useRef } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import { API } from "@/lib/api";

const STEP_SEC = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };

async function loadHistory(symbol, interval) {
  // Try Binance directly from the browser (real data on the user's device)
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=300`);
    if (r.ok) {
      const raw = await r.json();
      return raw.map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
    }
  } catch { /* blocked → fall back to backend */ }
  try {
    const r = await fetch(`${API}/market/klines?symbol=${symbol}&interval=${interval}&limit=300`);
    const d = await r.json();
    return (d.candles || []).map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  } catch { return []; }
}

export function TradingChart({ symbol, interval }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let ws = null;

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#9aa0aa", fontFamily: "JetBrains Mono, monospace" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a17b", downColor: "#e5484d", borderVisible: false,
      wickUpColor: "#26a17b", wickDownColor: "#e5484d",
    });

    (async () => {
      const data = await loadHistory(symbol, interval);
      if (disposed) return;
      series.setData(data);
      chart.timeScale().fitContent();

      // Real-time candle updates via Binance kline WebSocket (runs in the browser)
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}usdt@kline_${interval}`);
        ws.onmessage = (ev) => {
          try {
            const k = JSON.parse(ev.data).k;
            if (k) series.update({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c });
          } catch {}
        };
      } catch {}
    })();

    return () => {
      disposed = true;
      try { ws && ws.close(); } catch {}
      chart.remove();
    };
  }, [symbol, interval]);

  return <div ref={containerRef} data-testid="trading-chart" className="w-full h-[360px]" />;
}
