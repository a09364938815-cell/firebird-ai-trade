import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Lock } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor } from "@/components/common";

export default function Scanner() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["memecoins"],
    queryFn: () => api.get("/scanner/memecoins").then((r) => r.data),
    refetchInterval: 30000,
  });

  return (
    <div>
      <PageTitle title={t("nav_scanner")} subtitle="Curated memecoins with tradeable liquidity (score ≥ 75). No unknown/scam tokens surfaced." />
      <Panel testid="memecoin-scanner">
        <div className="overflow-x-auto" data-testid="memecoin-scanner-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider text-left">
                <th className="py-2">Coin</th>
                <th>Chain</th>
                <th>{t("price")}</th>
                <th>{t("change_24h")}</th>
                <th>{t("safety")}</th>
                <th>{t("opportunity")}</th>
                <th>{t("holders")}</th>
                <th>{t("verdict")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Scanning…</td></tr>
              )}
              {(data || []).map((c) => (
                <tr key={c.symbol} className="border-t border-border/50" data-testid={`meme-${c.symbol}`}>
                  <td className="py-3">
                    <div className="font-head font-bold">{c.symbol}</div>
                    <div className="text-xs text-muted-foreground">{c.name}</div>
                  </td>
                  <td className="text-xs">{c.chain}</td>
                  <td className="mono">${fmt(c.price, 6)}</td>
                  <td className={`mono ${pnlColor(c.change_24h)}`}>{c.change_24h > 0 ? "+" : ""}{fmt(c.change_24h)}%</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-success" />
                      <span className="mono text-success">{c.safety_score}</span>
                    </div>
                  </td>
                  <td className="mono text-gold">{c.opportunity_score}</td>
                  <td className="mono text-xs">{c.holders.toLocaleString("en-US")}</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.verdict === "Tradeable" ? "bg-success/15 text-success border-success/30" : "bg-gold/15 text-gold border-gold/30"}`}>
                      {c.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
          <Lock size={13} /> Safety = liquidity lock + mint renounce + holder distribution (indicative, not financial advice).
        </div>
      </Panel>
    </div>
  );
}
