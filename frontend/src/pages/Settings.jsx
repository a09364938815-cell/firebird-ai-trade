import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, CheckCircle2, XCircle } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel } from "@/components/common";
import { Switch } from "@/components/ui/switch";

const EXCHANGES = ["Binance", "Kraken", "Coinbase", "OKX", "Bybit", "Uniswap / DEX"];

export default function Settings() {
  const { t } = useI18n();
  const [s, setS] = useState(null);

  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api.get("/trading/settings").then((r) => r.data) });
  useEffect(() => { if (data) setS(data.settings); }, [data]);

  const save = async () => {
    try {
      await api.put("/trading/settings", s);
      toast.success(t("save"));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  if (!s) return <div className="text-muted-foreground">Loading…</div>;

  const num = (k, label) => (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type="number" value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
        data-testid={`setting-${k}`}
        className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
    </div>
  );

  return (
    <div>
      <PageTitle title={t("nav_settings")} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title={t("risk_strategy")} testid="risk-settings">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm">{t("risk_lock")}</span>
            <Switch checked={s.risk_lock} onCheckedChange={(v) => setS({ ...s, risk_lock: v })} data-testid="risk-lock-switch" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {num("max_position_pct", t("max_position"))}
            {num("trailing_stop_pct", t("trailing_stop"))}
            {num("take_profit_pct", t("take_profit"))}
            {num("stop_loss_pct", t("stop_loss"))}
          </div>
          <button onClick={save} data-testid="save-settings-button" className="fire-btn w-full mt-5 py-2.5 rounded-lg font-semibold">{t("save")}</button>
        </Panel>

        <Panel title={t("exchanges")} testid="exchange-hub">
          <p className="text-xs text-muted-foreground mb-4">
            Demo/sandbox mode. Live keys are stored server-side and never in the browser. Real trading stays off until you explicitly enable it.
          </p>
          <div className="space-y-2">
            {EXCHANGES.map((ex, i) => (
              <div key={ex} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40" data-testid={`exchange-${i}`}>
                <div className="flex items-center gap-2">
                  <Link2 size={16} className="text-gold" />
                  <span className="text-sm font-medium">{ex}</span>
                </div>
                {i === 0 ? (
                  <span className="text-xs flex items-center gap-1 text-success"><CheckCircle2 size={14} /> {t("connected")}</span>
                ) : (
                  <span className="text-xs flex items-center gap-1 text-muted-foreground"><XCircle size={14} /> {t("disconnected")}</span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
