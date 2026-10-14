import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle } from "@/components/common";
import { SignalsPanel } from "@/components/SignalsPanel";

export default function Signals() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.get("/trading/portfolio").then((r) => r.data) });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get("/auth/me").then((r) => r.data) });

  const freeBalance = portfolio.data?.cash ?? 0;
  const defaultLeverage = me.data?.settings?.default_leverage ?? 5;

  return (
    <div>
      <PageTitle title={t("nav_signals")} subtitle={t("signals_subtitle")} />
      <SignalsPanel
        onPick={(sym, interval) => navigate(`/charts?symbol=${sym}${interval ? `&tf=${interval}` : ""}`)}
        freeBalance={freeBalance}
        defaultLeverage={defaultLeverage}
      />
    </div>
  );
}
