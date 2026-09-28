import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Lock } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor } from "@/components/common";

export default function Scanner() {
  const { t, tv } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["memecoins"],
    queryFn: () => api.get("/scanner/memecoins").then((r) => r.data),
    refetchInterval: 30000,
  });

  const rows = data || [];

  return (
    <div>
      <PageTitle title={t("nav_scanner")} subtitle={t("scanner_subtitle")} />
      <Panel testid="memecoin-scanner">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto" data-testid="memecoin-scanner-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider text-start">
                <th className="py-2 text-start">{t("coin")}</th>
                <th className="text-start">{t("chain")}</th>
                <th className="text-start">{t("price")}</th>
                <th className="text-start">{t("change_24h")}</th>
                <th className="text-start">{t("safety")}</th>
                <th className="text-start">{t("opportunity")}</th>
                <th className="text-start">{t("holders")}</th>
                <th className="text-start">{t("verdict")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">{t("scanning")}</td></tr>
              )}
              {rows.map((c) => (
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
                      {tv(c.verdict)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {isLoading && <div className="py-8 text-center text-muted-foreground text-sm">{t("scanning")}</div>}
          {rows.map((c) => (
            <div key={c.symbol} className="p-3 rounded-lg bg-secondary/40" data-testid={`meme-card-${c.symbol}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-head font-bold">{c.symbol}</span>
                  <span className="text-xs text-muted-foreground ml-2">{c.name} · {c.chain}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${c.verdict === "Tradeable" ? "bg-success/15 text-success border-success/30" : "bg-gold/15 text-gold border-gold/30"}`}>
                  {tv(c.verdict)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                <span className="mono">${fmt(c.price, 6)}</span>
                <span className={`mono ${pnlColor(c.change_24h)}`}>{c.change_24h > 0 ? "+" : ""}{fmt(c.change_24h)}%</span>
                <span className="mono text-success flex items-center gap-1"><ShieldCheck size={12} />{c.safety_score}</span>
                <span className="mono text-gold">{t("opportunity")} {c.opportunity_score}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
          <Lock size={13} /> {t("safety_note")}
        </div>
      </Panel>
    </div>
  );
}
