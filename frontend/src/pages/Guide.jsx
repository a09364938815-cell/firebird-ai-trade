import React from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, Radar, Bot, ScanSearch, Gem, Sparkles, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { PageTitle, Panel } from "@/components/common";

export default function Guide() {
  const { t } = useI18n();
  const steps = [
    { icon: ShieldCheck, title: "1. Demo Mode is on", to: "/settings", desc: "You start with a $100 demo balance. No real money is used until you explicitly enable live trading with your own secure keys." },
    { icon: LayoutDashboard, title: "2. Read the Dashboard", to: "/", desc: "See portfolio value, top AI signals, market overview, whale activity, and market pulse in one place." },
    { icon: Radar, title: "3. Check AI Signals", to: "/signals", desc: "Coins are scored 0-100 using RSI, SMA crossovers and momentum across timeframes." },
    { icon: Sparkles, title: "4. Ask the AI Assistant", to: "/assistant", desc: "Get a coin score with entry/exit strategy and risk notes from Firebird AI Core (GPT-5.6)." },
    { icon: Bot, title: "5. Try Auto-Trade (Demo)", to: "/auto-trade", desc: "Let the bot open BUY positions on strong signals and manage them with trailing stop / take-profit." },
    { icon: ScanSearch, title: "6. Scan Memecoins", to: "/scanner", desc: "Only tradeable memecoins with high safety scores are shown — no unknown or scam tokens." },
    { icon: Gem, title: "7. Explore Firebird 555 NFTs", to: "/nft", desc: "Browse the 555-item phoenix collection with 6 legendary rares." },
  ];

  return (
    <div>
      <PageTitle title={t("nav_guide")} subtitle={t("guide_intro")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="beginner-guide-toc">
        {steps.map((s) => (
          <Link key={s.title} to={s.to}>
            <Panel className="h-full" testid={`guide-${s.to}`}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <s.icon size={20} className="text-primary" />
                </div>
                <div>
                  <div className="font-head font-semibold mb-1">{s.title}</div>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
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
