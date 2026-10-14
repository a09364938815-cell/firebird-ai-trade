import React from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Waves, Newspaper } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { Panel, Stat, PageTitle, pnlColor, fmt, actionColor } from "@/components/common";

export default function Dashboard() {
  const { t, tv } = useI18n();
  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get("/trading/portfolio").then((r) => r.data),
    refetchInterval: 15000,
  });
  const signals = useQuery({
    queryKey: ["signals", "1h"],
    queryFn: () => api.get("/market/signals?interval=1h").then((r) => r.data),
    refetchInterval: 30000,
  });
  const coins = useQuery({
    queryKey: ["coins"],
    queryFn: () => api.get("/market/coins").then((r) => r.data),
    refetchInterval: 20000,
  });
  const whales = useQuery({
    queryKey: ["whales"],
    queryFn: () => api.get("/market/whales").then((r) => r.data),
    refetchInterval: 30000,
  });
  const news = useQuery({
    queryKey: ["news"],
    queryFn: () => api.get("/market/news").then((r) => r.data),
    refetchInterval: 60000,
  });

  const p = portfolio.data;

  return (
    <div>
      <PageTitle title={t("nav_dashboard")} subtitle={t("tagline")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("total_value")} value={`$${fmt(p?.total_value ?? 100)}`} accent="fire-text" />
        <Stat label={t("cash")} value={`$${fmt(p?.cash ?? 100)}`} />
        <Stat label={t("holdings")} value={`$${fmt(p?.holdings_value ?? 0)}`} />
        <Stat
          label={t("unrealized_pnl")}
          value={`${(p?.unrealized_pnl ?? 0) >= 0 ? "+" : ""}$${fmt(p?.unrealized_pnl ?? 0)}`}
          accent={pnlColor(p?.unrealized_pnl ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title={t("top_signals")} className="lg:col-span-2" testid="dashboard-top-signals">
          <div className="space-y-2">
            {(signals.data || []).slice(0, 6).map((s) => (
              <div key={s.symbol} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0" data-testid={`top-signal-${s.symbol}`}>
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                  <span className="font-head font-bold text-sm sm:text-base truncate">{s.symbol}</span>
                  <span className={`text-[0.625rem] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 ${actionColor(s.action)}`}>
                    {tv(s.action)}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 shrink-0 whitespace-nowrap" dir="ltr">
                  <span className="mono text-xs sm:text-sm whitespace-nowrap">${fmt(s.price)}</span>
                  <span className={`mono text-xs sm:text-sm whitespace-nowrap text-right min-w-[3.75rem] ${pnlColor(s.change_24h)}`}>
                    {s.change_24h > 0 ? "+" : ""}{fmt(s.change_24h)}%
                  </span>
                  <span className="mono text-xs sm:text-sm text-gold whitespace-nowrap text-right min-w-[1.5rem]">{s.score}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("market_overview")} testid="dashboard-market">
          <div className="space-y-2">
            {(coins.data || []).slice(0, 8).map((c) => (
              <div key={c.symbol} className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.symbol}</span>
                <span className="mono">${fmt(c.price)}</span>
                <span className={`mono flex items-center gap-1 ${pnlColor(c.change_24h)}`}>
                  {c.change_24h >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {fmt(c.change_24h)}%
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("whale_activity")} className="lg:col-span-2" testid="dashboard-whales">
          <div className="grid sm:grid-cols-2 gap-3">
            {(whales.data || []).slice(0, 6).map((w) => (
              <div key={w.symbol} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40">
                <div className="flex items-center gap-2">
                  <Waves size={16} className="text-gold" />
                  <span className="font-medium">{w.symbol}</span>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-semibold ${w.pressure === "accumulation" ? "text-success" : "text-danger"}`}>
                    {tv(w.pressure)}
                  </div>
                  <div className="mono text-xs text-muted-foreground">{w.intensity}/100</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("market_pulse")} testid="dashboard-news">
          <div className="space-y-3">
            {(news.data || []).slice(0, 5).map((n, i) => (
              <div key={`${n.symbol}-${i}`} className="flex gap-2">
                <Newspaper size={15} className={n.sentiment === "positive" ? "text-success mt-0.5" : "text-danger mt-0.5"} />
                <div className="text-sm">{n.name ? t(n.change_24h >= 0 ? "news_up" : "news_down", { name: n.name, pct: Math.abs(n.change_24h).toFixed(2) }) : n.title}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
