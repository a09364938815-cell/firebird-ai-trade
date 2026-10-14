import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Lock, Crown, Check } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { useAuth } from "@/context/AuthContext";

export function PremiumGate({ feature, children }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get("/payments/subscription").then((r) => r.data),
    enabled: !isAdmin,
    staleTime: 30000,
  });

  const active = isAdmin || data?.active;

  if (!isAdmin && isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center" data-testid="premium-gate-loading">
        <div className="w-9 h-9 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (active) return children;

  const perks = ["feat_signals", "feat_autotrade", "feat_scanner", "feat_alerts"];

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4" data-testid="premium-gate">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gold/15 border border-gold/30 flex items-center justify-center mb-5">
          <Lock size={30} className="text-gold" />
        </div>
        <h2 className="text-2xl font-extrabold mb-2" data-testid="premium-gate-title">
          {feature ? t(feature) : t("premium")} · {t("premium_only")}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">{t("premium_gate_desc")}</p>

        <div className="rounded-2xl border border-border bg-card p-5 text-left mb-6">
          <ul className="space-y-2.5">
            {perks.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm">
                <Check size={16} className="text-green-400 shrink-0" />
                <span>{t(f)}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => navigate("/subscription")}
          data-testid="premium-gate-upgrade-btn"
          className="fire-btn w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
        >
          <Crown size={18} /> {t("go_premium")}
        </button>
      </div>
    </div>
  );
}
