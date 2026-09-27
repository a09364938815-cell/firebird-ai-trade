import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Zap } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor } from "@/components/common";

export default function AutoTrade() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [on, setOn] = useState(false);
  const [log, setLog] = useState([]);
  const [halt, setHalt] = useState(null);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get("/trading/settings").then((r) => r.data),
  });
  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get("/trading/portfolio").then((r) => r.data),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (settings.data) setOn(!!settings.data.settings?.auto_trade);
  }, [settings.data]);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    try {
      await api.put("/trading/settings", { auto_trade: next });
      toast.success(next ? t("auto_trade_on") : t("auto_trade_off"));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  // auto-trade tick loop while active
  useEffect(() => {
    if (!on) return;
    const tick = async () => {
      try {
        const { data } = await api.post("/trading/auto/tick");
        if (data.halt) {
          setHalt(data.halt_reason);
          setOn(false);
          toast.error(data.halt_reason);
        }
        const events = [
          ...(data.opened || []).map((o) => `BUY ${o.symbol} ${o.timeframe} · score ${o.score} · ${o.leverage}x`),
          ...(data.closed || []).map((c) => `${c.reason} ${c.symbol} · $${c.pnl}`),
        ];
        if (events.length) setLog((l) => [...events.map((e) => ({ e, t: new Date().toLocaleTimeString() })), ...l].slice(0, 20));
        qc.invalidateQueries({ queryKey: ["portfolio"] });
      } catch (e) {
        console.error("auto-tick failed", e);
      }
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => clearInterval(id);
  }, [on, qc]);

  const p = portfolio.data;

  const resume = async () => {
    try {
      await api.post("/trading/auto/resume");
      setHalt(null);
      toast.success("Bot re-authorized. You can enable auto-trade again.");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_autotrade")} subtitle={t("disclaimer")} />

      <div className="glass rounded-xl p-4 mb-6 border border-primary/20 text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-1" data-testid="rules-badges">
        <span>⚖️ Reward:Risk <b className="text-gold">2:1</b> (stop required)</span>
        <span>🤖 Max <b className="text-gold">2</b> concurrent auto-trades</span>
        <span>⚡ Auto leverage ≤ <b className="text-gold">10x</b> · Manual ≤ 50x</span>
        <span>🛑 Circuit-breaker at <b className="text-danger">20%</b> drawdown</span>
        <span>✋ Halt after <b className="text-danger">5</b> losses</span>
        <span>📈 Scans all coins & timeframes</span>
      </div>

      {halt && (
        <div className="glass rounded-xl p-4 mb-6 border border-destructive/40 flex flex-wrap items-center justify-between gap-3" data-testid="halt-banner">
          <div className="text-sm text-danger">🛑 {halt}</div>
          <button onClick={resume} data-testid="resume-button"
            className="px-4 py-2 rounded-lg font-semibold border border-gold/40 text-gold hover:bg-gold/10">
            Re-authorize Bot
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("total_value")} value={`$${fmt(p?.total_value ?? 100)}`} accent="fire-text" />
        <Stat label={t("cash")} value={`$${fmt(p?.cash ?? 100)}`} />
        <Stat label={t("unrealized_pnl")} value={`$${fmt(p?.unrealized_pnl ?? 0)}`} accent={pnlColor(p?.unrealized_pnl ?? 0)} />
        <Stat label="Open" value={p?.positions?.length ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel testid="autotrade-control">
          <div className="flex flex-col items-center text-center py-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${on ? "bg-success/15 fire-glow ember-pulse" : "bg-secondary"}`}>
              <Bot size={38} className={on ? "text-success" : "text-muted-foreground"} />
            </div>
            <div className="font-head font-bold text-lg mb-1">{on ? t("auto_trade_on") : t("auto_trade_off")}</div>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              The bot scans all coins across 15m / 1h / 4h, enters the best signal (2:1 reward:risk, stop required), and manages positions with trailing take-profit in demo mode.
            </p>
            <button onClick={toggle} data-testid="auto-trade-toggle-button"
              className={`px-6 py-3 rounded-xl font-semibold ${on ? "bg-destructive/20 text-danger border border-destructive/40" : "fire-btn"}`}>
              {on ? t("auto_trade_off") : t("enable_autotrade")}
            </button>
          </div>
        </Panel>

        <Panel title="Activity Log" testid="autotrade-log">
          {log.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {on ? "Waiting for signals…" : "Enable auto-trade to start"}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {log.map((l, i) => (
                <div key={`${l.t}-${i}`} className="flex items-center gap-2 text-sm">
                  <Zap size={14} className="text-gold" />
                  <span className="mono text-xs text-muted-foreground">{l.t}</span>
                  <span>{l.e}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
