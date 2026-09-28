import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Wallet, Link2, Trash2, RefreshCw, ShieldCheck } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt } from "@/components/common";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const { t } = useI18n();
  const qc = useQueryClient();
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
        {s && (
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
        )}

        <ExchangeHub />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <AggregatedBalances />
        <div className="space-y-6">
          <AggregatedPrices />
          <WalletConnect />
        </div>
      </div>
    </div>
  );
}

function ExchangeHub() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [exchange, setExchange] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const supported = useQuery({ queryKey: ["ex-supported"], queryFn: () => api.get("/exchanges/supported").then((r) => r.data) });
  const list = useQuery({ queryKey: ["ex-list"], queryFn: () => api.get("/exchanges/list").then((r) => r.data) });
  const exchanges = supported.data?.exchanges || [];
  const conns = list.data?.connections || [];

  useEffect(() => { if (!exchange && exchanges.length) setExchange(exchanges[0].id); }, [exchanges, exchange]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ex-list"] });
    qc.invalidateQueries({ queryKey: ["ex-balances"] });
    qc.invalidateQueries({ queryKey: ["ex-prices"] });
  };

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/exchanges/connect", { exchange, api_key: apiKey, api_secret: apiSecret });
      toast[data.verified ? "success" : "warning"](data.message);
      setApiKey(""); setApiSecret("");
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const test = async (id) => {
    try { const { data } = await api.post(`/exchanges/${id}/test`); toast[data.ok ? "success" : "warning"](data.message); refresh(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/exchanges/${id}`); toast.success(t("remove")); refresh(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  return (
    <Panel title={t("connect_exchange")} testid="exchange-hub">
      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5"><ShieldCheck size={13} className="text-success" /> {t("key_security_note")}</p>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">{t("exchange")}</label>
        <select value={exchange} onChange={(e) => setExchange(e.target.value)} data-testid="exchange-select"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm">
          {exchanges.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.kind}</option>)}
        </select>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t("api_key_optional")} data-testid="exchange-apikey-input"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm mono" />
        <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} type="password" placeholder={t("api_secret")} data-testid="exchange-secret-input"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm mono" />
        <button onClick={connect} disabled={busy} data-testid="exchange-connect-button" className="fire-btn w-full py-2 rounded-lg font-semibold text-sm disabled:opacity-60">
          {busy ? "…" : t("connect")}
        </button>
      </div>

      <div className="mt-5">
        <div className="text-xs text-muted-foreground mb-2">{t("connected_exchanges")}</div>
        {conns.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3">{t("no_connections")}</div>
        ) : (
          <div className="space-y-2">
            {conns.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40" data-testid={`connection-${c.exchange}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 size={14} className="text-gold shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.exchange_name}</div>
                    <div className="text-[10px] text-muted-foreground mono truncate">{c.api_key_masked || "public"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.verified
                    ? <span className="text-[10px] flex items-center gap-1 text-success"><CheckCircle2 size={12} />{t("verified")}</span>
                    : <span className="text-[10px] flex items-center gap-1 text-muted-foreground"><XCircle size={12} />{t("not_verified")}</span>}
                  <button onClick={() => test(c.id)} data-testid={`test-${c.exchange}`} className="p-1.5 rounded hover:bg-secondary" title={t("test")}><RefreshCw size={13} /></button>
                  <button onClick={() => remove(c.id)} data-testid={`remove-${c.exchange}`} className="p-1.5 rounded hover:bg-destructive/15 hover:text-danger" title={t("remove")}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function AggregatedBalances() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["ex-balances"], queryFn: () => api.get("/exchanges/balances").then((r) => r.data) });
  const accounts = data?.accounts || [];
  return (
    <Panel title={t("aggregated_balances")} testid="aggregated-balances">
      {accounts.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">{t("no_connections")}</div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.exchange} className="p-3 rounded-lg bg-secondary/40" data-testid={`balance-${a.exchange}`}>
              <div className="text-sm font-semibold mb-1">{a.name} <span className="text-[10px] text-muted-foreground">· {a.kind}</span></div>
              {a.balances.length === 0 ? (
                <div className="text-xs text-muted-foreground">{t("no_balances")}</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {a.balances.map((b) => (
                    <span key={b.asset} className="text-xs px-2 py-1 rounded bg-background/60 mono">{b.asset}: {fmt(b.amount, 4)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function AggregatedPrices() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["ex-prices"], queryFn: () => api.get("/exchanges/prices?symbols=BTC,ETH,SOL").then((r) => r.data), refetchInterval: 20000 });
  const exchanges = data?.exchanges || {};
  const ids = Object.keys(exchanges);
  return (
    <Panel title={t("aggregated_prices")} testid="aggregated-prices">
      {ids.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">{t("no_connections")}</div>
      ) : (
        <div className="space-y-2">
          {ids.map((id) => (
            <div key={id} className="flex items-center justify-between text-xs" data-testid={`price-${id}`}>
              <span className="font-medium">{exchanges[id].name}</span>
              <div className="flex gap-3">
                {Object.entries(exchanges[id].prices).map(([sym, p]) => (
                  <span key={sym} className="mono"><span className="text-muted-foreground">{sym}</span> ${fmt(p)}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function WalletConnect() {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const connect = async () => {
    if (!window.ethereum) { toast.error("No wallet extension detected (MetaMask/WalletConnect)."); return; }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts?.[0]) { setAddress(accounts[0]); toast.success(t("wallet_connected")); }
    } catch (e) { toast.error("Wallet connection rejected."); }
  };
  return (
    <Panel title={t("connect_wallet")} testid="wallet-connect">
      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5"><ShieldCheck size={13} className="text-success" /> {t("wallet_note")}</p>
      {address ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/40" data-testid="wallet-address">
          <Wallet size={16} className="text-gold" />
          <span className="mono text-xs truncate" dir="ltr">{address}</span>
        </div>
      ) : (
        <button onClick={connect} data-testid="wallet-connect-button" className="fire-btn w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
          <Wallet size={16} /> {t("connect_wallet")}
        </button>
      )}
    </Panel>
  );
}
