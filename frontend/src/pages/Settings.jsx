import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Wallet, Link2, Trash2, RefreshCw, ShieldCheck, Eye, EyeOff, KeyRound, LogOut, User, AlertTriangle, Lock, ChevronDown } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { PageTitle, Panel, fmt, toLatin } from "@/components/common";
import { Switch } from "@/components/ui/switch";
import { WalletPanel } from "@/components/WalletPanel";

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
      <input type="text" inputMode="decimal" dir="ltr" value={s[k]}
        onChange={(e) => setS({ ...s, [k]: Number(toLatin(e.target.value)) || 0 })}
        data-testid={`setting-${k}`}
        className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
    </div>
  );

  return (
    <div>
      <PageTitle title={t("nav_settings")} />
      <div className="mb-6"><FontSizeCard /></div>
      <div className="mb-6"><SecurityPanel /></div>
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
          <WalletPanel />
          <AlertsPanel />
        </div>
      </div>
      <SignOutCard />
    </div>
  );
}

function SignOutCard() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const go = async () => { await logout(); window.location.assign("/login"); };
  return (
    <div className="mt-6 mb-4">
      <button onClick={go} data-testid="settings-signout-button"
        className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 text-danger font-semibold hover:bg-destructive/20">
        <LogOut size={18} /> {t("logout")}
      </button>
    </div>
  );
}

const EX_TUTORIALS = {
  binance: {
    en: ["Log in to Binance → Profile → API Management.", "Click \"Create API\" → choose \"System generated\".", "Enable ONLY \"Enable Reading\". Keep Spot/Margin Trading and Withdraw DISABLED.", "(Optional) Restrict access to trusted IPs for extra safety.", "Copy the API Key and Secret and paste them below."],
    fa: ["وارد بایننس شوید → پروفایل → API Management.", "روی «Create API» بزنید و «System generated» را انتخاب کنید.", "فقط «Enable Reading» را فعال کنید. Spot/Margin Trading و Withdraw را غیرفعال نگه دارید.", "(اختیاری) برای امنیت بیشتر دسترسی را به IPهای مطمئن محدود کنید.", "API Key و Secret را کپی و در پایین وارد کنید."],
  },
  mexc: {
    en: ["Log in to MEXC → Profile → API Management.", "Click \"Create API\".", "Grant ONLY \"Account Reading\" / \"View\". Do NOT enable Spot/Futures Trade or Withdraw.", "Complete 2FA verification.", "Copy the Access Key and Secret and paste them below."],
    fa: ["وارد MEXC شوید → پروفایل → API Management.", "روی «Create API» بزنید.", "فقط دسترسی «Account Reading»/«View» را بدهید. Trade اسپات/فیوچرز و Withdraw را فعال نکنید.", "تأیید دو‌مرحله‌ای (2FA) را کامل کنید.", "Access Key و Secret را کپی و در پایین وارد کنید."],
  },
  toobit: {
    en: ["Log in to Toobit → Account → API Management.", "Create a new API key.", "Select READ-ONLY / View permission only. Disable Trade and Withdraw.", "Confirm with 2FA.", "Copy the key and secret and paste them below."],
    fa: ["وارد Toobit شوید → Account → API Management.", "یک کلید API جدید بسازید.", "فقط دسترسی READ-ONLY/View را انتخاب کنید. Trade و Withdraw را غیرفعال کنید.", "با 2FA تأیید کنید.", "کلید و Secret را کپی و در پایین وارد کنید."],
  },
  xt: {
    en: ["Log in to XT.com → Profile → API Keys.", "Click \"Create API Key\".", "Enable ONLY \"Read\" permission. Leave Trade and Withdraw OFF.", "(Optional) Add IP whitelist.", "Copy the API Key and Secret and paste them below."],
    fa: ["وارد XT.com شوید → پروفایل → API Keys.", "روی «Create API Key» بزنید.", "فقط دسترسی «Read» را فعال کنید. Trade و Withdraw را خاموش بگذارید.", "(اختیاری) IP Whitelist اضافه کنید.", "API Key و Secret را کپی و در پایین وارد کنید."],
  },
  lbank: {
    en: ["Log in to LBank → Account → API Management.", "Create a new API key.", "Grant ONLY read/query permission. Disable Trade and Withdraw.", "Verify with 2FA/email.", "Copy the API Key and Secret and paste them below."],
    fa: ["وارد LBank شوید → Account → API Management.", "یک کلید API جدید بسازید.", "فقط دسترسی read/query را بدهید. Trade و Withdraw را غیرفعال کنید.", "با 2FA/ایمیل تأیید کنید.", "API Key و Secret را کپی و در پایین وارد کنید."],
  },
  coinex: {
    en: ["Log in to CoinEx → Account → API.", "Click \"Create API Key\".", "Select \"Read Only\" scope. Do NOT grant Trade or Withdraw.", "Confirm with 2FA.", "Copy the Access ID and Secret and paste them below."],
    fa: ["وارد CoinEx شوید → Account → API.", "روی «Create API Key» بزنید.", "محدوده «Read Only» را انتخاب کنید. Trade یا Withdraw ندهید.", "با 2FA تأیید کنید.", "Access ID و Secret را کپی و در پایین وارد کنید."],
  },
  _generic: {
    en: ["Open your exchange → API Management.", "Create a new API key.", "Enable READ-ONLY permission only. Disable Trade and Withdraw.", "Copy the key and secret and paste them below."],
    fa: ["صرافی خود را باز کنید → API Management.", "یک کلید API جدید بسازید.", "فقط دسترسی READ-ONLY را فعال کنید. Trade و Withdraw را غیرفعال کنید.", "کلید و Secret را کپی و در پایین وارد کنید."],
  },
};

function ExchangeHub() {
  const { t, tv, lang } = useI18n();
  const qc = useQueryClient();
  const [exchange, setExchange] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [apiPassphrase, setApiPassphrase] = useState("");
  const [showGuide, setShowGuide] = useState(false);
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
      const { data } = await api.post("/exchanges/connect", { exchange, api_key: apiKey, api_secret: apiSecret, api_passphrase: apiPassphrase });
      toast[data.verified ? "success" : "warning"](data.message);
      setApiKey(""); setApiSecret(""); setApiPassphrase("");
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

      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-3" data-testid="exchange-readonly-warning">
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300">{t("readonly_warning")}</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">{t("exchange")}</label>
        <select value={exchange} onChange={(e) => setExchange(e.target.value)} data-testid="exchange-select"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm">
          {exchanges.map((e) => <option key={e.id} value={e.id}>{e.name} · {tv(e.kind)}</option>)}
        </select>

        <button type="button" onClick={() => setShowGuide((v) => !v)} data-testid="exchange-guide-toggle"
          className="w-full flex items-center justify-between text-xs text-primary py-1.5 hover:underline">
          <span className="flex items-center gap-1.5"><KeyRound size={12} /> {t("how_to_create_key")}</span>
          <ChevronDown size={14} className={`transition-transform ${showGuide ? "rotate-180" : ""}`} />
        </button>
        {showGuide && (
          <ol className="space-y-1.5 p-3 rounded-lg bg-secondary/40 text-xs text-muted-foreground" data-testid="exchange-guide-steps">
            {((EX_TUTORIALS[exchange] || EX_TUTORIALS._generic)[lang] || (EX_TUTORIALS[exchange] || EX_TUTORIALS._generic).en).map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary font-semibold shrink-0" dir="ltr">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t("api_key_optional")} data-testid="exchange-apikey-input"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm mono" />
        <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} type="password" placeholder={t("api_secret")} data-testid="exchange-secret-input"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm mono" />
        <input value={apiPassphrase} onChange={(e) => setApiPassphrase(e.target.value)} type="password" placeholder={t("api_passphrase_optional")} data-testid="exchange-passphrase-input"
          className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm mono" />
        <button onClick={connect} disabled={busy} data-testid="exchange-connect-button" className="fire-btn w-full py-2 rounded-lg font-semibold text-sm disabled:opacity-60">
          {busy ? "…" : t("connect")}
        </button>

        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-success/10 border border-success/30 mt-1" data-testid="exchange-security-notice">
          <ShieldCheck size={14} className="text-success shrink-0 mt-0.5" />
          <p className="text-[0.6875rem] text-success">{t("cex_security_notice")}</p>
        </div>
      </div>
    </Panel>
  );
}

function AlertsPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["alert-settings"], queryFn: () => api.get("/scanner/alert-settings").then((r) => r.data) });
  const hist = useQuery({ queryKey: ["alert-history"], queryFn: () => api.get("/scanner/alert-history").then((r) => r.data) });
  const [cfg, setCfg] = useState(null);
  useEffect(() => { if (data) setCfg((prev) => prev || data); }, [data]);
  const c = cfg || data;
  const TFS = ["15m", "1h", "4h", "1d"];

  const toggleTf = (tf) => {
    const has = c.timeframes.includes(tf);
    setCfg({ ...c, timeframes: has ? c.timeframes.filter((x) => x !== tf) : [...c.timeframes, tf] });
  };
  const save = async () => {
    try { const { data: saved } = await api.put("/scanner/alert-settings", c); toast.success(t("save")); setCfg(saved); qc.invalidateQueries({ queryKey: ["alert-settings"] }); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const history = hist.data?.history || [];

  return (
    <Panel title={<span className="flex items-center gap-2"><AlertTriangle size={18} className="text-gold" /> {t("alerts_title")}</span>} testid="alerts-panel">
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 mb-4" data-testid="alerts-risk-disclaimer">
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[0.6875rem] text-amber-200/90 leading-relaxed">{t("risk_disclaimer")}</p>
      </div>

      {!c ? <div className="text-sm text-muted-foreground py-4">…</div> : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("enable_scanner")}</span>
            <Switch checked={c.enabled} onCheckedChange={(v) => setCfg({ ...c, enabled: v })} data-testid="alerts-enable-switch" />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-0.5">
              <span>{t("min_score_label")}</span>
              <span className="mono" dir="ltr">{c.min_score}</span>
            </div>
            <input type="range" min={70} max={95} step={1} value={c.min_score} onChange={(e) => setCfg({ ...c, min_score: Number(e.target.value) })}
              data-testid="alerts-minscore" className="w-full accent-orange-500" />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1.5">{t("monitor_timeframes")}</div>
            <div className="flex gap-1.5">
              {TFS.map((tf) => (
                <button key={tf} onClick={() => toggleTf(tf)} data-testid={`alerts-tf-${tf}`}
                  className={`flex-1 py-1.5 rounded-md text-xs mono border ${c.timeframes.includes(tf) ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary text-muted-foreground"}`}>
                  <span dir="ltr">{tf}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("max_alerts_day")}</label>
              <input type="text" inputMode="numeric" value={c.max_alerts_per_day} onChange={(e) => setCfg({ ...c, max_alerts_per_day: Number(toLatin(e.target.value)) || 0 })}
                data-testid="alerts-maxday" className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm mono" dir="ltr" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("notify_method_label")}</label>
              <select value={c.notify_method} onChange={(e) => setCfg({ ...c, notify_method: e.target.value })} data-testid="alerts-notify-method"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm">
                <option value="in_app">{t("notify_in_app")}</option>
                <option value="in_app_email">{t("notify_in_app_email")}</option>
              </select>
            </div>
          </div>

          <button onClick={save} data-testid="alerts-save-button" className="fire-btn w-full py-2.5 rounded-lg font-semibold text-sm">{t("save")}</button>

          <div>
            <div className="text-xs text-muted-foreground mb-2">{t("alert_history_title")}</div>
            {history.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">{t("no_alert_history")}</div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1" data-testid="alert-history-list">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 text-[0.6875rem]" data-testid={`alert-hist-${i}`}>
                    <span className="font-medium">{h.symbol} <span className="text-muted-foreground mono" dir="ltr">· {h.timeframe}</span></span>
                    <span className="flex items-center gap-2">
                      <span className={h.direction === "BUY" ? "text-success" : "text-danger"}>{h.direction}</span>
                      <span className="mono text-gold" dir="ltr">{h.score}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function AggregatedBalances() {
  const { t, tv } = useI18n();
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
              <div className="text-sm font-semibold mb-1">{a.name} <span className="text-[0.625rem] text-muted-foreground">· {tv(a.kind)}</span></div>
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

function SecurityPanel() {
  const { t } = useI18n();
  const { refresh, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showEmail, setShowEmail] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [editingUser, setEditingUser] = useState(false);
  const [nameEdit, setNameEdit] = useState(false);
  const [dispName, setDispName] = useState("");
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [cePw, setCePw] = useState("");
  const [cur, setCur] = useState("");
  const [np, setNp] = useState("");
  const [cp, setCp] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery({ queryKey: ["security"], queryFn: () => api.get("/auth/security").then((r) => r.data) });
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.get("/auth/devices").then((r) => r.data.devices) });

  const revokeOthers = async () => {
    try {
      await api.post("/auth/devices/revoke-others");
      toast.success(t("revoke_all_others_done"));
      devices.refetch();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };
  const revokeDevice = async (id) => {
    try {
      await api.post(`/auth/devices/${id}/revoke`);
      toast.success(t("device_revoked"));
      devices.refetch();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const saveName = async () => {
    setBusy(true);
    try {
      await api.post("/auth/display-name", { name: dispName });
      toast.success(t("display_name_updated"));
      setNameEdit(false); refetch(); refresh();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const resendVerify = async () => {
    try { const { data: d } = await api.post("/auth/resend-verification"); toast.success(d.message || t("verification_sent")); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const submitChangeEmail = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.post("/auth/change-email", { new_email: newEmail, current_password: cePw });
      toast.success(d.message || t("change_email_sent"));
      setChangeEmailOpen(false); setNewEmail(""); setCePw("");
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const saveUsername = async () => {
    setBusy(true);
    try {
      await api.post("/auth/username", { username: newUsername });
      toast.success(t("username_updated"));
      setEditingUser(false); setNewUsername("");
      refetch(); refresh(); qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const changePassword = async () => {
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: np, confirm_password: cp });
      toast.success(t("password_changed"));
      setCur(""); setNp(""); setCp("");
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const logoutAll = async () => {
    if (!window.confirm(t("confirm_logout_all"))) return;
    try { await api.post("/auth/logout-all"); } catch {}
    await logout();
    navigate("/login");
  };

  const pwValid = np.length >= 8 && /[A-Za-z]/.test(np) && /\d/.test(np);

  return (
    <Panel title={<span className="flex items-center gap-2"><ShieldCheck size={18} className="text-gold" /> {t("profile_security")}</span>} testid="security-panel">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Display Name */}
        <div data-testid="security-displayname">
          <div className="text-xs text-muted-foreground mb-1">{t("display_name")}</div>
          {!nameEdit ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{data?.name || "—"}</span>
              <button onClick={() => { setNameEdit(true); setDispName(data?.name || ""); }} data-testid="edit-name-button"
                className="text-[0.6875rem] px-2 py-1 rounded-md border border-border hover:border-gold hover:text-gold">{t("edit")}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={dispName} onChange={(e) => setDispName(e.target.value)} data-testid="name-input"
                className="flex-1 px-3 py-1.5 rounded-md bg-input border border-border focus:border-primary outline-none text-sm" />
              <button onClick={saveName} disabled={busy} data-testid="save-name-button" className="px-2 py-1 rounded-md text-xs fire-btn font-semibold">{t("save")}</button>
              <button onClick={() => setNameEdit(false)} className="px-2 py-1 rounded-md text-xs border border-border">✕</button>
            </div>
          )}
        </div>

        {/* Username */}
        <div data-testid="security-username">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><User size={13} /> {t("username_label")}</div>
          {!editingUser ? (
            <div className="flex items-center justify-between gap-2">
              <span className="mono font-semibold">{data?.username || "—"}</span>
              <button onClick={() => { setEditingUser(true); setNewUsername(data?.username || ""); }}
                disabled={!data?.username_can_change} data-testid="edit-username-button"
                className="text-[0.6875rem] px-2 py-1 rounded-md border border-border hover:border-gold hover:text-gold disabled:opacity-40">
                {data?.username_can_change ? t("change") : t("in_days", { days: data?.username_days_left })}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} data-testid="username-input"
                className="w-full px-3 py-1.5 rounded-md bg-input border border-border focus:border-primary outline-none mono text-sm" />
              <div className="flex gap-2">
                <button onClick={saveUsername} disabled={busy} data-testid="save-username-button" className="flex-1 py-1 rounded-md text-xs fire-btn font-semibold">{t("save")}</button>
                <button onClick={() => setEditingUser(false)} className="flex-1 py-1 rounded-md text-xs border border-border">{t("cancel")}</button>
              </div>
              <p className="text-[0.625rem] text-muted-foreground">{t("username_hint")}</p>
            </div>
          )}
        </div>

        {/* Email (masked, private) + verified badge */}
        <div data-testid="security-email">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
            {t("email_private")}
            {data?.email_verified
              ? <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30" data-testid="email-verified-badge">{t("verified")}</span>
              : <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30" data-testid="email-unverified-badge">{t("unverified")}</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-sm" data-testid="security-email-value" dir="ltr">{showEmail ? data?.email : data?.email_masked}</span>
            <button onClick={() => setShowEmail((v) => !v)} data-testid="reveal-email-button"
              className="p-1 rounded-md hover:bg-secondary text-muted-foreground">
              {showEmail ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <button onClick={() => setChangeEmailOpen((v) => !v)} data-testid="change-email-button"
              className="text-[0.6875rem] text-primary hover:underline">{t("change_email")}</button>
            {!data?.email_verified && (
              <button onClick={resendVerify} data-testid="resend-verification-button"
                className="text-[0.6875rem] text-amber-400 hover:underline">{t("resend_verification")}</button>
            )}
          </div>
          {changeEmailOpen && (
            <div className="mt-2 space-y-2" data-testid="change-email-form">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t("new_email")}
                data-testid="new-email-input" className="w-full px-3 py-1.5 rounded-md bg-input border border-border focus:border-primary outline-none text-sm" />
              <input type="password" value={cePw} onChange={(e) => setCePw(e.target.value)} placeholder={t("current_password")}
                data-testid="change-email-password-input" className="w-full px-3 py-1.5 rounded-md bg-input border border-border focus:border-primary outline-none text-sm" />
              <button onClick={submitChangeEmail} disabled={busy || !newEmail || !cePw} data-testid="submit-change-email-button"
                className="w-full py-1.5 rounded-md text-xs fire-btn font-semibold disabled:opacity-50">{t("send_verification_new")}</button>
              <p className="text-[0.625rem] text-muted-foreground">{t("change_email_hint")}</p>
            </div>
          )}
          <p className="text-[0.625rem] text-muted-foreground mt-1">{t("email_private_hint")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        {/* Logout all */}
        <div className="flex flex-col justify-start lg:col-start-3">
          <div className="text-xs text-muted-foreground mb-1">{t("sessions")}</div>
          <button onClick={logoutAll} data-testid="logout-all-button"
            className="flex items-center justify-center gap-2 py-2 rounded-md border border-destructive/40 text-danger hover:bg-destructive/10 text-sm">
            <LogOut size={14} /> {t("logout_all_devices")}
          </button>
        </div>
      </div>

      {/* Trusted Devices */}
      <div className="mt-6 pt-5 border-t border-border/60" data-testid="trusted-devices">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck size={15} className="text-gold" /> {t("trusted_devices")}</div>
        <p className="text-xs text-muted-foreground -mt-2 mb-3">{t("sessions_hint")}</p>
        {(devices.data || []).some((d) => !d.current) && (
          <button onClick={revokeOthers} data-testid="revoke-all-others-button"
            className="mb-3 w-full min-h-[44px] rounded-lg border border-destructive/40 bg-destructive/10 text-danger text-sm font-semibold hover:bg-destructive/20 flex items-center justify-center gap-2">
            <LogOut size={15} /> {t("revoke_all_others")} <span className="mono" dir="ltr">({devices.data.filter((d) => !d.current).length})</span>
          </button>
        )}
        {(devices.data || []).length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">{t("no_other_devices")}</div>
        ) : (
          <div className="space-y-3">
            {devices.data.map((d) => (
              <div key={d.device_id} className="p-3 rounded-xl bg-secondary/40 border border-border/60" data-testid={`device-${d.device_id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" dir="ltr" data-testid={`device-name-${d.device_id}`}>{deviceName(d.user_agent) || t("unknown_device")}</span>
                  {d.current && <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30">{t("current_session")}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                  <span className="mono" dir="ltr">IP {d.ip || "—"}</span>
                  <span>· {t("last_active")} <span className="mono" dir="ltr">{(d.last_active || "").slice(0, 16).replace("T", " ")}</span></span>
                </div>
                {!d.current && (
                  <button onClick={() => revokeDevice(d.device_id)} data-testid={`revoke-${d.device_id}`}
                    className="mt-3 w-full min-h-[44px] rounded-lg border border-destructive/40 text-danger text-sm font-semibold hover:bg-destructive/10">{t("revoke")}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="mt-6 pt-5 border-t border-border/60">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2"><KeyRound size={15} className="text-gold" /> {t("change_password")}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={t("current_password")} data-testid="current-password-input"
            className="px-3 py-2 rounded-md bg-input border border-border focus:border-primary outline-none text-sm" />
          <input type="password" value={np} onChange={(e) => setNp(e.target.value)} placeholder={t("new_password")} data-testid="new-password-input"
            className="px-3 py-2 rounded-md bg-input border border-border focus:border-primary outline-none text-sm" />
          <input type="password" value={cp} onChange={(e) => setCp(e.target.value)} placeholder={t("confirm_new_password")} data-testid="confirm-password-input"
            className="px-3 py-2 rounded-md bg-input border border-border focus:border-primary outline-none text-sm" />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className={`text-[0.6875rem] ${pwValid ? "text-success" : "text-muted-foreground"}`}>{t("pw_hint")}</p>
          <button onClick={changePassword} disabled={busy || !cur || !pwValid || np !== cp} data-testid="change-password-button"
            className="fire-btn px-5 py-2 rounded-md font-semibold text-sm disabled:opacity-50">{t("update_password")}</button>
        </div>
      </div>
    </Panel>
  );
}

function deviceName(ua) {
  if (!ua) return "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari"
    : /python|curl|axios|okhttp/i.test(ua) ? "API client" : "";
  return [br, os].filter(Boolean).join(" · ");
}

const FONT_SIZES = ["small", "medium", "large"];

function FontSizeCard() {
  const { t } = useI18n();
  const [size, setSize] = useState(() => localStorage.getItem("fb_font") || "medium");
  const pick = (v) => { setSize(v); localStorage.setItem("fb_font", v); document.documentElement.dataset.font = v; };
  return (
    <Panel title={t("font_size")} testid="font-size-settings">
      <div className="grid grid-cols-3 gap-2" role="radiogroup">
        {FONT_SIZES.map((v, i) => (
          <button key={v} onClick={() => pick(v)} data-testid={`font-size-${v}`} role="radio" aria-checked={size === v}
            className={`min-h-[44px] rounded-lg border font-semibold ${size === v ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary"}`}>
            <span style={{ fontSize: `${0.8 + i * 0.15}rem` }}>{t(`font_${v}`)}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
