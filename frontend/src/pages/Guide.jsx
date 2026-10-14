import React from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, Radar, Bot, ScanSearch, Gem, Sparkles, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { PageTitle, Panel } from "@/components/common";

export default function Guide() {
  const { t } = useI18n();
  const steps = [
    { icon: ShieldCheck, key: "guide1", to: "/settings" },
    { icon: LayoutDashboard, key: "guide2", to: "/" },
    { icon: Radar, key: "guide3", to: "/signals" },
    { icon: Sparkles, key: "guide4", to: "/assistant" },
    { icon: Bot, key: "guide5", to: "/auto-trade" },
    { icon: ScanSearch, key: "guide6", to: "/scanner" },
    { icon: Gem, key: "guide7", to: "/nft" },
  ];

  return (
    <div>
      <PageTitle title={t("nav_guide")} subtitle={t("guide_intro")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="beginner-guide-toc">
        {steps.map((s, i) => (
          <Link key={s.key} to={s.to}>
            <Panel className="h-full" testid={`guide-${s.to}`}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 relative">
                  <s.icon size={20} className="text-primary" />
                  <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-primary text-[0.625rem] font-bold text-white flex items-center justify-center num">{i + 1}</span>
                </div>
                <div>
                  <div className="font-head font-semibold mb-1">
                    <span className="num">{t("guide_step")} {i + 1}</span> · {t(`${s.key}_title`)}
                  </div>
                  <p className="text-sm text-muted-foreground">{t(`${s.key}_desc`)}</p>
                </div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
      <Panel className="mt-6 border-gold/20">
        <p className="text-sm text-muted-foreground">{t("disclaimer")}</p>
      </Panel>
    </div>
  );
}
