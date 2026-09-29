import React, { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import { API } from "@/lib/api";

const UP = "#26a17b";
const DOWN = "#e5484d";
const volColor = (o, c) => (c >= o ? "rgba(38,161,123,0.5)" : "rgba(229,72,77,0.5)");
const money = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 4 });
const abbrUsd = (v) =>
  v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);

// Money Flow Index (MFI, 14): a volume-weighted RSI that gauges buying vs selling pressure.
function computeMFI(candles, vols, period = 14) {
  const out = [];
  const tp = candles.map((k) => (k.high + k.low + k.close) / 3);
  const rmf = tp.map((v, i) => v * (vols[i] || 0));
  for (let i = 0; i < candles.length; i++) {
    if (i < period) continue;
    let pos = 0, neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += rmf[j];
      else if (tp[j] < tp[j - 1]) neg += rmf[j];
    }
    const mfi = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    out.push({ time: candles[i].time, value: +mfi.toFixed(1) });
  }
  return out;
}

// Support/Resistance: volume-weighted swing pivots over the last ~100 candles, clustered.
function computeZones(candles) {
  const n = candles.length;
  if (n < 30) return { supports: [], resistances: [] };
  const w = 3;
  const cur = candles[n - 1].close;
  const highs = [], lows = [];
  for (let i = w; i < n - w; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - w; j <= i + w; j++) {
      if (candles[j].high > c.high) isHigh = false;
      if (candles[j].low < c.low) isLow = false;
    }
    const usd = (c.volume || 0) * ((c.high + c.low) / 2);
    if (isHigh) highs.push({ price: c.high, usd, idx: i });
    if (isLow) lows.push({ price: c.low, usd, idx: i });
  }
  const cluster = (arr) => {
    const sorted = [...arr].sort((a, b) => a.price - b.price);
    const out = [];
    for (const p of sorted) {
      const last = out[out.length - 1];
      if (last && Math.abs(p.price - last.price) / last.price < 0.006) {
        last.hits += 1; last.volume += p.usd; last.idxMax = Math.max(last.idxMax, p.idx);
        last.price = (last.price * (last.hits - 1) + p.price) / last.hits;
      } else out.push({ price: p.price, volume: p.usd, hits: 1, idxMax: p.idx });
    }
    return out;
  };
  const rank = (z) => z.hits * 2 + z.volume / 1e6;
  const age = (idx) => +(0.4 + 0.6 * (idx / n)).toFixed(2);
  let res = cluster(highs).filter((z) => z.price > cur).sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  let sup = cluster(lows).filter((z) => z.price < cur).sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  res.forEach((z) => (z.age = age(z.idxMax)));
  sup.forEach((z) => (z.age = age(z.idxMax)));
  return { supports: sup, resistances: res };
}

async function loadHistory(symbol, interval) {
  const map = (raw) => raw.map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=300`);
    if (r.ok) return map(await r.json());
  } catch {}
  try {
    const r = await fetch(`${API}/market/klines?symbol=${symbol}&interval=${interval}&limit=300`);
    const d = await r.json();
    return map(d.candles || []);
  } catch { return []; }
}

export function TradingChart({ symbol, interval, levels, showZones = true, onFlow }) {
  const containerRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const candlesRef = useRef([]);
  const zoneLinesRef = useRef([]);
  const zonesMetaRef = useRef([]);
  const showZonesRef = useRef(showZones);
  const [flow, setFlow] = useState(null);
  const [tip, setTip] = useState(null);

  const drawZones = useCallback(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    zoneLinesRef.current.forEach((l) => { try { series.removePriceLine(l); } catch {} });
    zoneLinesRef.current = [];
    zonesMetaRef.current = [];
    if (!showZonesRef.current) return;
    const { supports, resistances } = computeZones(candlesRef.current || []);
    const add = (z, type) => {
      const col = type === "S" ? `rgba(38,161,123,${z.age})` : `rgba(229,72,77,${z.age})`;
      const line = series.createPriceLine({ price: z.price, color: col, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${type}: $${money(z.price)}` });
      zoneLinesRef.current.push(line);
      zonesMetaRef.current.push({ price: z.price, type, hits: z.hits, volume: z.volume });
    };
    supports.forEach((z) => add(z, "S"));
    resistances.forEach((z) => add(z, "R"));
  }, []);

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

    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    candleSeriesRef.current = candleSeries;
    const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, 1);
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
      candlesRef.current = candles;
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
      drawZones();

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

    // Hover tooltip for S/R zones.
    const onMove = (param) => {
      if (!param.point || !zonesMetaRef.current.length) { setTip(null); return; }
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) { setTip(null); return; }
      let best = null, bestD = Infinity;
      for (const z of zonesMetaRef.current) { const d = Math.abs(z.price - price) / z.price; if (d < bestD) { bestD = d; best = z; } }
      if (best && bestD < 0.0025) {
        setTip({ x: param.point.x, y: param.point.y, text: `${best.type === "S" ? "Support" : "Resistance"} at $${money(best.price)} · Hit ${best.hits}× · Vol $${abbrUsd(best.volume)}` });
      } else setTip(null);
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      disposed = true;
      candleSeriesRef.current = null;
      priceLinesRef.current = [];
      zoneLinesRef.current = [];
      zonesMetaRef.current = [];
      try { ws && ws.close(); } catch {}
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  // Toggle S/R zones without rebuilding the chart.
  useEffect(() => {
    showZonesRef.current = showZones;
    drawZones();
  }, [showZones, drawZones]);

  // Draw / update Entry, TP, SL lines when the analysis levels change.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((pl) => { try { series.removePriceLine(pl); } catch {} });
    priceLinesRef.current = [];
    if (!levels || !levels.entry) return;
    const mk = (price, color, title) => series.createPriceLine({ price, color, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title });
    priceLinesRef.current.push(mk(levels.entry, "#f7931a", "Entry"));
    if (levels.take_profit) priceLinesRef.current.push(mk(levels.take_profit, "#26a17b", "TP"));
    if (levels.stop_loss) priceLinesRef.current.push(mk(levels.stop_loss, "#e5484d", "SL"));
  }, [levels, symbol, interval]);

  return (
    <div>
      <div className="relative">
        <div ref={containerRef} data-testid="trading-chart" className="w-full h-[460px]" />
        {tip && (
          <div data-testid="zone-tooltip"
            className="pointer-events-none absolute z-30 px-2 py-1 rounded-md text-[10px] mono bg-background/95 border border-border shadow-lg whitespace-nowrap"
            style={{ left: Math.max(4, Math.min(tip.x + 12, (containerRef.current?.clientWidth || 400) - 180)), top: Math.max(4, tip.y - 10) }}>
            {tip.text}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-muted-foreground flex-wrap gap-2">
        <span className="flex items-center gap-3 flex-wrap">
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
