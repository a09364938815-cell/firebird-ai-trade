import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useI18n } from "@/i18n";

export function useTradeLimits(symbol) {
  return useQuery({
    queryKey: ["trade-limits", symbol],
    queryFn: () => api.get(`/trading/limits?symbol=${symbol}`).then((r) => r.data),
    enabled: !!symbol,
    staleTime: Infinity,
  }).data;
}

// Per-trade risk % + leverage with tiered caps/warnings. Parent owns the state.
export function RiskLeverageControls({ limits, freeBalance, risk, setRisk, leverage, setLeverage, highAck, setHighAck, levAck, setLevAck, setAmount, prefix }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!limits) return;
    setRisk(limits.default_risk_pct);
    setLeverage((l) => Math.min(l, limits.max_leverage));
    setAmount(+((freeBalance * limits.default_risk_pct) / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limits?.symbol]);
  if (!limits) return null;
  const onRisk = (v) => { setRisk(v); setAmount(+((freeBalance * v) / 100).toFixed(2)); if (v <= limits.high_risk_pct) setHighAck(false); };
  const onLev = (v) => { setLeverage(v); if (v <= limits.extreme_leverage) setLevAck(false); };
  const levCls = leverage > 20 ? "text-danger" : leverage > 10 ? "text-amber-400" : "text-gold";
  return (
    <div className="mt-3 space-y-3" data-testid={`${prefix}-risk-leverage`}>
      <div>
        <label className="text-xs text-muted-foreground flex items-center justify-between">
          <span>{t("risk_per_trade")} <span className="text-[0.625rem] px-1.5 py-0.5 ms-1 rounded bg-secondary">{t(`tier_${limits.tier}`)}</span></span>
          <span className={`mono ${risk > limits.high_risk_pct ? "text-danger" : "text-gold"}`} dir="ltr" data-testid={`${prefix}-risk-value`}>{risk}%</span>
        </label>
        <input type="range" min={limits.min_risk_pct} max={limits.max_risk_pct} step={1} value={risk} onChange={(e) => onRisk(Number(e.target.value))}
          data-testid={`${prefix}-risk-input`} className="w-full mt-1 accent-orange-500" />
        <div className="flex justify-between text-[0.625rem] text-muted-foreground mono" dir="ltr"><span>{limits.min_risk_pct}%</span><span>{t("max_amount")}: ${(freeBalance * risk / 100).toFixed(2)}</span><span>{limits.max_risk_pct}%</span></div>
        {risk > limits.high_risk_pct && (
          <label className="flex items-start gap-2 mt-2 text-[0.6875rem] text-danger cursor-pointer" data-testid={`${prefix}-high-risk-box`}>
            <input type="checkbox" checked={highAck} onChange={(e) => setHighAck(e.target.checked)} className="mt-0.5 accent-red-500" data-testid={`${prefix}-high-risk-checkbox`} />
            <span>{t("high_risk_ack")}</span>
          </label>
        )}
      </div>
      <div>
        <label className="text-xs text-muted-foreground flex items-center justify-between">
          <span>{t("leverage")}</span>
          <span className={`mono ${levCls}`} dir="ltr" data-testid={`${prefix}-leverage-value`}>{leverage}x</span>
        </label>
        <input type="range" min={1} max={limits.max_leverage} step={1} value={leverage} onChange={(e) => onLev(Number(e.target.value))}
          data-testid={`${prefix}-leverage-input`} className="w-full mt-1 accent-orange-500" />
        <div className="flex justify-between text-[0.625rem] text-muted-foreground mono" dir="ltr"><span>1x</span><span>{limits.max_leverage}x</span></div>
        {leverage > 10 && leverage <= 20 && (
          <div className="text-[0.6875rem] text-amber-400 mt-1" data-testid={`${prefix}-leverage-warning`}>⚠️ {t("lev_warn_yellow")}</div>
        )}
        {leverage > 20 && (
          <div className="mt-1 p-2 rounded-md border border-destructive/40 bg-destructive/10" data-testid={`${prefix}-leverage-danger`}>
            <div className="text-[0.6875rem] text-danger font-semibold">🛑 {t("lev_warn_red")}</div>
            <label className="flex items-start gap-2 mt-1.5 text-[0.6875rem] text-danger cursor-pointer">
              <input type="checkbox" checked={levAck} onChange={(e) => setLevAck(e.target.checked)} className="mt-0.5 accent-red-500" data-testid={`${prefix}-leverage-ack-checkbox`} />
              <span>{t("lev_ack")}</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

// Validates acks; returns an error key or null. `armed` implements the 2nd confirmation for >20x.
export function riskCheck({ limits, risk, highAck, leverage, levAck, armed }) {
  if (!limits) return null;
  if (risk > limits.high_risk_pct && !highAck) return "high_risk_required";
  if (leverage > limits.extreme_leverage && !levAck) return "lev_ack_required";
  if (leverage > limits.extreme_leverage && !armed) return "arm";
  return null;
}
