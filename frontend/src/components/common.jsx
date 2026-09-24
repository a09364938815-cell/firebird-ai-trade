import React from "react";

export function Panel({ title, right, children, className = "", testid }) {
  return (
    <div className={`glass card-hover rounded-2xl p-5 md:p-6 ${className}`} data-testid={testid}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="font-head font-semibold text-lg">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className={`font-head font-extrabold text-2xl md:text-3xl mono ${accent || ""}`}>{value}</div>
      {sub && <div className="text-xs mt-1 text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PageTitle({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="font-head font-extrabold text-2xl md:text-3xl tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

export function pnlColor(v) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}

export function fmt(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const num = Number(n);
  if (Math.abs(num) >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: d });
  if (Math.abs(num) < 0.01 && num !== 0) return num.toPrecision(3);
  return num.toFixed(d);
}

export function actionColor(a) {
  if (a === "BUY") return "bg-success/15 text-success border-success/30";
  if (a === "SELL") return "bg-destructive/15 text-danger border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}
