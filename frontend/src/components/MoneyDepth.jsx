import React, { useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import { useI18n } from "@/i18n";

const BUCKETS = 24;
const GREEN = "#26a17b";
const RED = "#e5484d";
const abbrUsd = (v) =>
  v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);

async function fetchKlines(symbol, interval) {
  const map = (raw) => raw.map((k) => ({ open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=100`);
    if (r.ok) return map(await r.json());
  } catch {}
  try {
    const r = await fetch(`${API}/market/klines?symbol=${symbol}&interval=${interval}&limit=100`);
    const d = await r.json();
    return map(d.candles || []);
  } catch { return []; }
}

// Volume-by-price: for each price bucket, sum USD volume bought (up candles) vs sold (down candles).
function computeDepth(candles) {
  if (candles.length < 5) return null;
  let hi = -Infinity, lo = Infinity;
  candles.forEach((c) => { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); });
  const span = hi - lo || 1;
  const step = span / BUCKETS;
  const rows = Array.from({ length: BUCKETS }, () => ({ buy: 0, sell: 0 }));
  candles.forEach((c) => {
    const tp = (c.high + c.low + c.close) / 3;
    const usd = c.volume * tp;
    let idx = Math.floor((tp - lo) / step);
    if (idx < 0) idx = 0; if (idx >= BUCKETS) idx = BUCKETS - 1;
    if (c.close >= c.open) rows[idx].buy += usd; else rows[idx].sell += usd;
  });
  const max = Math.max(...rows.map((r) => r.buy + r.sell), 1);
  return { rows, hi, lo, step, max };
}

export function MoneyDepth({ symbol, interval, currentPrice, className = "" }) {
  const { t } = useI18n();
  const [depth, setDepth] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let dead = false;
    const run = async () => {
      const c = await fetchKlines(symbol, interval);
      if (!dead) setDepth(computeDepth(c));
    };
    run();
    timer.current = setInterval(run, 5000);
    return () => { dead = true; clearInterval(timer.current); };
  }, [symbol, interval]);

  return (
    <div className={`w-[92px] shrink-0 ${className}`} data-testid="money-depth">
      <div className="text-[0.625rem] text-muted-foreground mb-1 text-center">{t("money_depth")}</div>
      <div className="h-[420px] flex flex-col-reverse justify-between rounded-md bg-secondary/20 border border-border/60 py-1 px-0.5">
        {depth ? depth.rows.map((r, i) => {
          const lvlLo = depth.lo + i * depth.step;
          const lvlHi = lvlLo + depth.step;
          const isCur = currentPrice != null && currentPrice >= lvlLo && currentPrice < lvlHi;
          const buyPct = Math.min(100, (r.buy / depth.max) * 100);
          const sellPct = Math.min(100, (r.sell / depth.max) * 100);
          return (
            <div key={i} title={`$${abbrUsd(lvlLo)} · ${t("in_label")} $${abbrUsd(r.buy)} · ${t("out_label")} $${abbrUsd(r.sell)}`}
              className={`flex flex-col justify-center gap-[1px] ${isCur ? "bg-gold/15 rounded-sm" : ""}`} style={{ flex: 1 }}>
              <div className="h-[3px] self-end rounded-sm" style={{ width: `${buyPct}%`, background: isCur ? "#f7931a" : GREEN }} />
              <div className="h-[3px] self-end rounded-sm" style={{ width: `${sellPct}%`, background: isCur ? "#f7931a" : RED }} />
            </div>
          );
        }) : (
          <div className="flex-1 flex items-center justify-center text-[0.5625rem] text-muted-foreground">…</div>
        )}
      </div>
      <div className="flex justify-center gap-2 mt-1 text-[0.5625rem] text-muted-foreground">
        <span className="flex items-center gap-0.5"><span className="w-2 h-1 rounded-sm" style={{ background: GREEN }} />{t("in_label")}</span>
        <span className="flex items-center gap-0.5"><span className="w-2 h-1 rounded-sm" style={{ background: RED }} />{t("out_label")}</span>
      </div>
    </div>
  );
}
