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
    <div className="glass rounded-2xl px-3 py-4 sm:p-5 card-hover min-w-0">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
      <FitNumber className={`font-head font-extrabold text-[min(4.6vw,1.25rem)] sm:text-2xl md:text-3xl mono whitespace-nowrap rtl:text-right leading-tight ${accent || ""}`}>{value}</FitNumber>
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
  if (Math.abs(num) >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (Math.abs(num) < 0.01 && num !== 0) return num.toPrecision(3);
  return num.toFixed(d);
}

// Convert Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Latin 0-9 so numeric
// inputs always display/accept English digits regardless of OS/browser locale.
export function toLatin(str) {
  if (str === null || str === undefined) return str;
  return String(str)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function actionColor(a) {
  if (a === "BUY") return "bg-success/15 text-success border-success/30";
  if (a === "SELL") return "bg-destructive/15 text-danger border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

// Shrinks the font until the full value fits on one line (handles OS/browser text scaling).
export function FitNumber({ className = "", children }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && size > 9) { size -= 0.5; el.style.fontSize = `${size}px`; }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [children]);
  return <div ref={ref} dir="ltr" className={`${className} overflow-hidden`} data-testid="fit-number">{children}</div>;
}
