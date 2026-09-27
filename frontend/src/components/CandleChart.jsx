import React, { useMemo } from "react";

export default function CandleChart({ candles = [], height = 340 }) {
  const view = useMemo(() => {
    if (!candles.length) return null;
    const data = candles.slice(-80);
    const highs = data.map((c) => c[2]);
    const lows = data.map((c) => c[3]);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const range = max - min || 1;
    const w = 1000;
    const h = height;
    const pad = 8;
    const cw = w / data.length;
    const y = (v) => pad + (max - v) / range * (h - pad * 2);
    return { data, w, h, cw, y, max, min };
  }, [candles, height]);

  if (!view) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        Loading chart…
      </div>
    );
  }

  const { data, w, h, cw, y } = view;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      data-testid="candlestick-chart-container"
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={w} y1={h * g} y2={h * g}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {data.map((c, i) => {
        const [, o, high, low, close] = c;
        const up = close >= o;
        const color = up ? "#00E676" : "#FF1744";
        const x = i * cw + cw / 2;
        const bodyTop = y(Math.max(o, close));
        const bodyBottom = y(Math.min(o, close));
        const bodyH = Math.max(1, bodyBottom - bodyTop);
        const bw = Math.max(1.5, cw * 0.6);
        return (
          <g key={c[0]}>
            <line x1={x} x2={x} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1" />
            <rect x={x - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} rx="0.5" />
          </g>
        );
      })}
    </svg>
  );
}
