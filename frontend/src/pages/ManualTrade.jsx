import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Star, X, Plus, Wifi, Wallet, TrendingUp, TrendingDown, Minus, Target, Shield, ChevronDown, Bot, Zap } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n, tReason } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor, toLatin } from "@/components/common";
import { TradingChart } from "@/components/TradingChart";
import { MoneyDepth } from "@/components/MoneyDepth";
import { VerticalSlider } from "@/components/VerticalSlider";
import { SignalsPanel } from "@/components/SignalsPanel";
import { useAuth } from "@/context/AuthContext";
import { RiskLeverageControls, useTradeLimits, riskCheck } from "@/components/RiskLeverageControls";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"];

export default function ManualTrade() {
  const { t, tv } = useI18n();
  const { user } = useAuth();
  const emailVerified = user?.email_verified !== false;
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTC");
  const [tf, setTf] = useState("15m");
  const [amount, setAmount] = useState(25);
  const [leverage, setLeverage] = useState(1);
  const [risk, setRisk] = useState(3);
  const [highAck, setHighAck] = useState(false);
  const [levAck, setLevAck] = useState(false);
  const [armed, setArmed] = useState(false);
  const limits = useTradeLimits(symbol);
  useEffect(() => { setArmed(false); }, [symbol, leverage]);
  const [busy, setBusy] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [signalsOpen, setSignalsOpen] = useState(true);
  const [sigQuery, setSigQuery] = useState("");
  const [suggested, setSuggested] = useState(null);
  const [sigTf, setSigTf] = useState("15m");
  const [sigResults, setSigResults] = useState([]);
  const [sigShow, setSigShow] = useState(false);
  const [customSymbol, setCustomSymbol] = useState(null);
  const [showDepth, setShowDepth] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [showZones, setShowZones] = useState(true);
  const [entryInput, setEntryInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [slInput, setSlInput] = useState("");
  const [tpslOpen, setTpslOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [livePrice, setLivePrice] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const wsRef = useRef(null);
  const universeRef = useRef([]);

  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get("/trading/portfolio").then((r) => r.data),
    refetchInterval: 15000,
  });
  const coins = useQuery({ queryKey: ["coins"], queryFn: () => api.get("/market/coins").then((r) => r.data) });
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: () => api.get("/market/watchlist").then((r) => r.data.symbols) });
  const wl = watchlist.data || [];

  // Firebird AI Core analysis for the selected symbol + timeframe (direction, confidence, Entry/TP/SL).
  const analysis = useQuery({
    queryKey: ["analysis", symbol, tf],
    queryFn: () => api.get(`/market/analysis?symbol=${symbol}&interval=${tf}`).then((r) => r.data),
    refetchInterval: 30000,
  });

  // Auto Signals: top movers from the AI Core for the selected Auto-Signals timeframe (backend caches 60s).
  const signals = useQuery({
    queryKey: ["auto-signals", sigTf],
    queryFn: () => api.get(`/market/signals?interval=${sigTf}`).then((r) => r.data),
    refetchInterval: 60000,
    staleTime: 60000,
  });
  const topSignals = useMemo(() => {
    const rows = signals.data || [];
    const active = rows.filter((s) => s.action !== "HOLD");
    return (active.length ? active : rows).slice(0, 3);
  }, [signals.data]);

  // On-demand analysis for a custom token typed into the Auto Signals search (not saved to the list).
  const customAnalysis = useQuery({
    queryKey: ["custom-analysis", customSymbol, sigTf],
    queryFn: () => api.get(`/market/analysis?symbol=${customSymbol}&interval=${sigTf}`).then((r) => r.data),
    enabled: !!customSymbol,
    refetchInterval: 60000,
  });

  const pickSignal = (s) => { setSymbol(s.symbol); setSuggested(s.symbol); };
  const pickCustom = (sym) => { setCustomSymbol(sym.toUpperCase()); setSigResults([]); setSigShow(false); setSigQuery(""); };
  const quickAnalyze = (e) => {
    e.preventDefault();
    const q = sigQuery.trim().toUpperCase().replace(/USDT$/, "");
    if (q) pickCustom(q);
  };

  // Fallback price (from coins snapshot) if WS has not delivered yet
  const fallbackPrice = coins.data?.find((c) => c.symbol === symbol)?.price;
  const price = livePrice ?? fallbackPrice;
  const freeBalance = portfolio.data?.cash ?? 0;
  const inPositions = portfolio.data?.holdings_value ?? 0;
  const equity = portfolio.data?.total_value ?? (freeBalance + inPositions);

  // Vertical slider percentage ↔ amount (two-way)
  const percent = freeBalance > 0 ? Math.min(100, Math.round((Number(amount) / freeBalance) * 100)) : 0;
  const setPercent = (p) => setAmount(+((freeBalance * p) / 100).toFixed(2));

  // Advanced TP/SL (framed for a long/BUY). Base entry = user override or live price.
  const entryBase = Number(entryInput) || price || 0;
  const tpPrice = tpInput ? Number(tpInput) : null;
  const slPrice = slInput ? Number(slInput) : null;
  const notional = Number(amount) * Number(leverage);
  const pnlPreview = useMemo(() => {
    if (!entryBase) return null;
    const mk = (target) => {
      if (!target) return null;
      const pct = (target - entryBase) / entryBase; // + for TP above, - for SL below
      const usd = notional * pct;
      const onMargin = Number(amount) > 0 ? (usd / Number(amount)) * 100 : 0;
      return { usd, onMargin };
    };
    return { tp: mk(tpPrice), sl: mk(slPrice) };
  }, [entryBase, tpPrice, slPrice, notional, amount]);

  // If the user already holds this symbol, draw the lines from the live position; else from the AI signal.
  const openPos = (portfolio.data?.positions || []).find((p) => p.symbol === symbol);
  const levels = useMemo(() => {
    if (openPos) {
      const e = openPos.entry_price;
      const tpP = openPos.take_profit_pct ?? 6;
      const slP = openPos.stop_loss_pct ?? 3;
      const long = openPos.side === "BUY";
      return {
        entry: e,
        take_profit: long ? e * (1 + tpP / 100) : e * (1 - tpP / 100),
        stop_loss: long ? e * (1 - slP / 100) : e * (1 + slP / 100),
        source: "position",
      };
    }
    if (analysis.data && analysis.data.entry) {
      return {
        entry: analysis.data.entry,
        take_profit: analysis.data.take_profit,
        stop_loss: analysis.data.stop_loss,
        source: "signal",
      };
    }
    return null;
  }, [openPos, analysis.data]);

  // Custom TP/SL overrides the chart lines when set; otherwise use position/AI levels.
  const customLevels = (tpPrice || slPrice || Number(entryInput)) ? {
    entry: entryBase,
    take_profit: tpPrice || undefined,
    stop_loss: slPrice || undefined,
    source: "custom",
  } : null;
  const chartLevels = customLevels || levels;

  // Load the full tradeable universe from Binance in the browser (server may be geo-blocked).
  // Cached in localStorage for 24h. Falls back to the server search if the browser is also blocked.
  useEffect(() => {
    const cached = localStorage.getItem("fb_universe");
    const ts = Number(localStorage.getItem("fb_universe_ts") || 0);
    if (cached && Date.now() - ts < 86400000) {
      try { universeRef.current = JSON.parse(cached); return; } catch {}
    }
    (async () => {
      try {
        const r = await fetch("https://api.binance.com/api/v3/exchangeInfo");
        const d = await r.json();
        const uni = [...new Set((d.symbols || [])
          .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING"
            && !/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset))
          .map((s) => s.baseAsset))].sort();
        if (uni.length) {
          universeRef.current = uni;
          localStorage.setItem("fb_universe", JSON.stringify(uni));
          localStorage.setItem("fb_universe_ts", String(Date.now()));
        }
      } catch { /* browser blocked too — server fallback used in search */ }
    })();
  }, []);

  // Reusable coin search: local (Binance universe) first, server fallback.
  const searchCoins = useCallback(async (q) => {
    const uni = universeRef.current;
    if (uni.length) {
      const starts = uni.filter((s) => s.startsWith(q));
      const contains = uni.filter((s) => s.includes(q) && !s.startsWith(q));
      const local = [...starts, ...contains].slice(0, 30).map((s) => ({ symbol: s, name: s }));
      if (local.length) return local;
    }
    try { const { data } = await api.get(`/market/search?q=${encodeURIComponent(q)}`); return data.results || []; }
    catch { return []; }
  }, []);

  // Debounced coin search for the order-form symbol picker
  useEffect(() => {
    const q = query.trim().toUpperCase();
    if (!q) { setResults([]); return; }
    const tmo = setTimeout(async () => {
      const r = await searchCoins(q);
      setResults(r); setShowResults(true);
    }, 250);
    return () => clearTimeout(tmo);
  }, [query, searchCoins]);

  // Debounced coin search for the Auto Signals custom-token picker
  useEffect(() => {
    const q = sigQuery.trim().toUpperCase();
    if (!q) { setSigResults([]); return; }
    const tmo = setTimeout(async () => {
      const r = await searchCoins(q);
      setSigResults(r); setSigShow(true);
    }, 250);
    return () => clearTimeout(tmo);
  }, [sigQuery, searchCoins]);

  // Real-time price via Binance WebSocket for the selected symbol (no polling)
  useEffect(() => {
    setLivePrice(null);
    setLiveConnected(false);
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    let closed = false;
    let ws;
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}usdt@trade`);
      wsRef.current = ws;
      ws.onopen = () => { if (!closed) setLiveConnected(true); };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.p) setLivePrice(parseFloat(m.p));
        } catch {}
      };
      ws.onerror = () => setLiveConnected(false);
      ws.onclose = () => setLiveConnected(false);
    } catch { setLiveConnected(false); }
    return () => { closed = true; try { ws && ws.close(); } catch {} };
  }, [symbol]);

  const pick = (s) => { setSymbol(s.toUpperCase()); setShowResults(false); setQuery(""); };

  const addWatch = async (s) => {
    try { const { data } = await api.post("/market/watchlist", { symbol: s }); qc.setQueryData(["watchlist"], data.symbols); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };
  const removeWatch = async (s) => {
    try { const { data } = await api.delete(`/market/watchlist/${s}`); qc.setQueryData(["watchlist"], data.symbols); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const trade = async (side) => {
    if (side === "BUY") {
      const err = riskCheck({ limits, risk, highAck, leverage, levAck, armed });
      if (err === "arm") { setArmed(true); toast.warning(t("lev_confirm_again")); return; }
      if (err) { toast.error(t(err)); return; }
    }
    setBusy(true);
    try {
      const payload = { symbol, side, usd_amount: Number(amount), leverage: Number(leverage), risk_pct: risk, high_risk_ack: highAck, leverage_confirmed: levAck && armed };
      if (side === "BUY" && entryBase > 0) {
        if (tpPrice) payload.take_profit_pct = +(((tpPrice - entryBase) / entryBase) * 100).toFixed(2);
        if (slPrice) payload.stop_loss_pct = +(((entryBase - slPrice) / entryBase) * 100).toFixed(2);
      }
      const { data } = await api.post("/trading/manual", payload);
      if (data.warning) toast.warning(data.warning);
      toast.success(side === "BUY" ? t("toast_opened", { symbol, leverage: data.leverage || leverage }) : t("toast_closed", { symbol, pnl: data.pnl ?? 0 }));
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setArmed(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const closeOne = async (id) => {
    try {
      const { data } = await api.post(`/trading/positions/${id}/close`);
      toast.success(t("toast_closed_pnl", { pnl: data.pnl }));
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_manual")} subtitle={t("disclaimer")} />
      {!emailVerified && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm" data-testid="unverified-banner">
          <span className="flex-1">⚠️ {t("verify_email_banner")}</span>
          <button onClick={async () => { try { const { data } = await api.post("/auth/resend-verification"); toast.success(data.message || t("verification_sent")); } catch (e) { toast.error(t("could_not_resend")); } }}
            data-testid="banner-resend-verification"
            className="text-xs px-3 py-1 rounded-md border border-amber-500/40 hover:bg-amber-500/15 whitespace-nowrap">{t("resend")}</button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-6">
        <Panel title={t("open_position")} testid="manual-trade-panel">
          {/* Searchable coin list */}
          <label className="text-xs text-muted-foreground">{t("symbol")}</label>
          <div className="relative mt-1 mb-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-input border border-border focus-within:border-primary">
              <Search size={14} className="text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query && setShowResults(true)}
                placeholder={t("search_coin_placeholder")}
                data-testid="coin-search-input"
                className="w-full bg-transparent outline-none text-sm mono" />
            </div>
            {showResults && results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto glass rounded-lg border border-border" data-testid="coin-search-results">
                {results.map((r) => (
                  <button key={r.symbol} onClick={() => pick(r.symbol)} data-testid={`search-result-${r.symbol}`}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary text-start">
                    <span className="text-sm font-medium">{r.symbol}</span>
                    <span className="text-[0.6875rem] text-muted-foreground truncate ml-2">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected symbol + live price + add to watchlist */}
          <div className="flex items-center justify-between mb-2" data-testid="selected-symbol-bar">
            <div className="flex items-center gap-2">
              <span className="font-head font-bold text-lg" data-testid="selected-symbol">{symbol}</span>
              <button onClick={() => addWatch(symbol)} title={t("add_to_watchlist")} data-testid="add-watchlist-button"
                className="p-1 rounded hover:bg-secondary text-gold">
                <Plus size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi size={12} className={liveConnected ? "text-success" : "text-muted-foreground/50"} data-testid="live-indicator" />
              <span className="text-[0.625rem] text-muted-foreground">{liveConnected ? t("live") : "…"}</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground mb-2">
            {t("price")}: <span className="mono text-foreground" data-testid="live-price">${fmt(price)}</span>
          </div>
          <div className="mb-3 px-3 py-2.5 rounded-lg bg-secondary/40 border border-border space-y-1.5" data-testid="balance-summary">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet size={13} className="text-success" /> {t("free_balance")}</span>
              <span className="mono font-semibold text-success text-sm" data-testid="free-balance-value" dir="ltr">${fmt(freeBalance)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("in_positions")}</span>
              <span className="mono text-muted-foreground text-sm" data-testid="in-positions-value" dir="ltr">${fmt(inPositions)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
              <span className="text-xs text-gold font-semibold">{t("total_equity")}</span>
              <span className="mono font-bold text-gold text-sm" data-testid="total-equity-value" dir="ltr">${fmt(equity)}</span>
            </div>
          </div>

          {/* Watchlist */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Star size={12} className="text-gold" /> {t("watchlist")}
            </div>
            {wl.length === 0 ? (
              <div className="text-[0.6875rem] text-muted-foreground">{t("watchlist_empty")}</div>
            ) : (
              <div className="flex flex-wrap gap-2" data-testid="watchlist">
                {wl.map((s) => (
                  <span key={s} className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-md text-xs font-medium border ${symbol === s ? "bg-primary/15 text-primary border-primary/40" : "border-border"}`} data-testid={`watch-${s}`}>
                    <button onClick={() => setSymbol(s)} className="hover:underline">{s}</button>
                    <button onClick={() => removeWatch(s)} data-testid={`watch-remove-${s}`} className="p-0.5 rounded hover:bg-destructive/20 hover:text-danger">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Amount with vertical percentage slider (Part B) */}
          <label className="text-xs text-muted-foreground">{t("amount_usd")}</label>
          <div className="flex items-start gap-3 mt-1 mb-2">
            <VerticalSlider value={percent} onChange={setPercent} />
            <div className="flex-1">
              <input type="text" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(toLatin(e.target.value))}
                data-testid="manual-amount-input"
                className="w-full px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
              <div className="grid grid-cols-4 gap-1.5 mt-2" data-testid="amount-quick-buttons">
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} type="button" onClick={() => setPercent(p)} data-testid={`amount-pct-${p}`}
                    className={`py-1 rounded-md text-[0.6875rem] mono border ${percent === p ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
                    {p}%
                  </button>
                ))}
              </div>
              {percent > 75 && (
                <div className="text-[0.6875rem] text-amber-400 mt-2" data-testid="amount-high-warning">
                  ⚠️ {t("high_exposure", { percent })}
                </div>
              )}
            </div>
          </div>
          <RiskLeverageControls limits={limits} freeBalance={freeBalance} risk={risk} setRisk={setRisk} leverage={leverage} setLeverage={setLeverage}
            highAck={highAck} setHighAck={setHighAck} levAck={levAck} setLevAck={setLevAck} setAmount={setAmount} prefix="manual" />

          {/* Advanced TP/SL (Part C) */}
          <div className="mt-3 mb-2 rounded-lg border border-border" data-testid="advanced-tpsl">
            <button type="button" onClick={() => setTpslOpen((v) => !v)} data-testid="tpsl-toggle"
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Target size={13} className="text-gold" /> {t("advanced_tpsl")}</span>
              <ChevronDown size={15} className={`transition-transform ${tpslOpen ? "rotate-180" : ""}`} />
            </button>
            {tpslOpen && (
              <div className="px-3 pb-3 space-y-2.5">
                <div>
                  <label className="text-[0.625rem] text-muted-foreground">{t("entry_optional")}</label>
                  <input type="text" inputMode="decimal" dir="ltr" value={entryInput} onChange={(e) => setEntryInput(toLatin(e.target.value))}
                    placeholder={price ? String(fmt(price)) : t("market")} data-testid="entry-input"
                    className="w-full mt-0.5 px-3 py-1.5 rounded-md bg-input border border-border focus:border-primary outline-none mono text-sm" />
                </div>
                <div>
                  <label className="text-[0.625rem] text-success">{t("take_profit_price")}</label>
                  <input type="text" inputMode="decimal" dir="ltr" value={tpInput} onChange={(e) => setTpInput(toLatin(e.target.value))}
                    placeholder={t("tp_example")} data-testid="tp-input"
                    className="w-full mt-0.5 px-3 py-1.5 rounded-md bg-input border border-border focus:border-success outline-none mono text-sm" />
                  <div className="grid grid-cols-5 gap-1 mt-1.5" data-testid="tp-quick">
                    {[1, 2, 5, 10, 20].map((p) => (
                      <button key={p} type="button" onClick={() => setTpInput((entryBase * (1 + p / 100)).toFixed(entryBase >= 1000 ? 2 : 6))}
                        data-testid={`tp-plus-${p}`}
                        className="py-1 rounded-md text-[0.625rem] mono border border-success/30 text-success hover:bg-success/10">+{p}%</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[0.625rem] text-danger">{t("stop_loss_price")}</label>
                  <input type="text" inputMode="decimal" dir="ltr" value={slInput} onChange={(e) => setSlInput(toLatin(e.target.value))}
                    placeholder={t("sl_example")} data-testid="sl-input"
                    className="w-full mt-0.5 px-3 py-1.5 rounded-md bg-input border border-border focus:border-danger outline-none mono text-sm" />
                  <div className="grid grid-cols-4 gap-1 mt-1.5" data-testid="sl-quick">
                    {[1, 2, 5, 10].map((p) => (
                      <button key={p} type="button" onClick={() => setSlInput((entryBase * (1 - p / 100)).toFixed(entryBase >= 1000 ? 2 : 6))}
                        data-testid={`sl-minus-${p}`}
                        className="py-1 rounded-md text-[0.625rem] mono border border-destructive/30 text-danger hover:bg-destructive/10">-{p}%</button>
                    ))}
                  </div>
                </div>
                {(pnlPreview?.tp || pnlPreview?.sl) && (
                  <div className="text-[0.6875rem] mono space-y-1 pt-1 border-t border-border/60" data-testid="pnl-preview">
                    {pnlPreview.tp && (
                      <div className="flex justify-between text-success" data-testid="pnl-tp">
                        <span>{t("if_tp_hits")}</span>
                        <span dir="ltr">+${fmt(Math.abs(pnlPreview.tp.usd))} (+{fmt(Math.abs(pnlPreview.tp.onMargin))}%)</span>
                      </div>
                    )}
                    {pnlPreview.sl && (
                      <div className="flex justify-between text-danger" data-testid="pnl-sl">
                        <span>{t("if_sl_hits")}</span>
                        <span dir="ltr">-${fmt(Math.abs(pnlPreview.sl.usd))} (-{fmt(Math.abs(pnlPreview.sl.onMargin))}%)</span>
                      </div>
                    )}
                    <div className="text-[0.5625rem] text-muted-foreground/70">{t("pnl_preview_note", { amount: fmt(amount), leverage })}</div>
                  </div>
                )}
                {(tpInput || slInput || entryInput) && (
                  <button type="button" onClick={() => { setEntryInput(""); setTpInput(""); setSlInput(""); }}
                    data-testid="tpsl-clear" className="w-full py-1 rounded-md text-[0.625rem] border border-border hover:bg-secondary text-muted-foreground">
                    {t("clear_tpsl")}
                  </button>
                )}
              </div>
            )}
          </div>
          {/* One-Tap Trade — appears when a signal was tapped; shows AI Direction/Entry/TP/SL */}
          {suggested === symbol && levels && (
            <div className="mb-3 p-3 rounded-lg border border-gold/40 bg-gold/5" data-testid="one-tap-trade">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.6875rem] text-gold font-semibold flex items-center gap-1"><Zap size={12} /> {t("one_tap_trade")}</span>
                {(() => { const d = DIR[analysis.data?.action || "HOLD"] || DIR.HOLD; return (
                  <span className={`text-[0.6875rem] px-2 py-0.5 rounded-md border font-semibold flex items-center gap-1 ${d.cls}`} data-testid="one-tap-direction">
                    <d.Icon size={11} /> {tv(d.label)}
                  </span>
                ); })()}
              </div>
              <div className="space-y-1 text-[0.6875rem] mono">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("entry")}</span><span dir="ltr">${fmt(levels.entry)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("tp_short")}</span><span className="text-success" dir="ltr">${fmt(levels.take_profit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("sl_short")}</span><span className="text-danger" dir="ltr">${fmt(levels.stop_loss)}</span></div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <button disabled={busy} onClick={() => trade("BUY")} data-testid="manual-buy-button"
              className={`py-2.5 rounded-lg font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30 disabled:opacity-50 ${suggested === symbol && analysis.data?.action === "BUY" ? "ring-2 ring-success" : ""}`}>
              {armed ? t("confirm_again") : t("buy")}
            </button>
            <button disabled={busy} onClick={() => trade("SELL")} data-testid="manual-sell-button"
              className={`py-2.5 rounded-lg font-semibold bg-destructive/20 text-danger border border-destructive/40 hover:bg-destructive/30 disabled:opacity-50 ${suggested === symbol && analysis.data?.action === "SELL" ? "ring-2 ring-danger" : ""}`}>
              {t("sell")}
            </button>
          </div>
        </Panel>

        <SignalsPanel
          onPick={(sym, interval) => { setSymbol(sym); setSuggested(sym); if (interval) setTf(interval); }}
          freeBalance={freeBalance}
          defaultLeverage={leverage}
        />
        </div>

        <Panel
          title={
            <div className="flex items-center justify-between w-full gap-3 flex-wrap">
              <span className="flex items-center gap-2"><span className="font-head font-bold">{symbol}/USDT</span>
                <span className="mono text-sm text-muted-foreground">${fmt(price)}</span></span>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setShowDepth((v) => !v)} data-testid="toggle-money-depth"
                  className={`px-2 py-1 rounded-md text-[0.6875rem] border ${showDepth ? "bg-gold/15 text-gold border-gold/40" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                  {t("money_depth")}
                </button>
                <button onClick={() => setShowZones((v) => !v)} data-testid="toggle-sr-zones"
                  className={`px-2 py-1 rounded-md text-[0.6875rem] border ${showZones ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                  {t("sr_zones")}
                </button>
                <div className="flex gap-1" data-testid="chart-timeframes">
                  {TIMEFRAMES.map((f) => (
                    <button key={f} onClick={() => setTf(f)} data-testid={`chart-tf-${f}`}
                      className={`px-2.5 py-1 rounded-md text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          }
          className="lg:col-span-6" testid="manual-chart-panel">
          <div className="flex gap-2">
            {showDepth && <MoneyDepth symbol={symbol} interval={tf} currentPrice={price} />}
            <div className="flex-1 min-w-0">
              <TradingChart symbol={symbol} interval={tf} levels={chartLevels} showZones={showZones} />
            </div>
          </div>
        </Panel>

        {/* Bot Analysis — next to the chart on desktop, below (collapsible) on mobile */}
        <div className="lg:col-span-3" data-testid="bot-analysis-panel">
          <div className="glass card-hover rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-head font-semibold text-lg flex items-center gap-2">
                <Bot size={18} className="text-primary" /> {t("bot_analysis")}
              </h3>
              <button onClick={() => setAnalysisOpen((v) => !v)} data-testid="bot-analysis-toggle"
                className="lg:hidden p-1 rounded hover:bg-secondary">
                <ChevronDown size={18} className={`transition-transform ${analysisOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
            <div className={`${analysisOpen ? "" : "hidden"} lg:block`}>
              <BotAnalysis symbol={symbol} tf={tf} data={analysis.data} levels={levels} hasPosition={!!openPos} />
            </div>
          </div>
        </div>
      </div>

      <Panel title={t("nav_positions")} className="mt-6" testid="manual-positions">
        {(portfolio.data?.positions || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">{t("no_positions")}</div>
        ) : (
          <div className="space-y-2">
            {portfolio.data.positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-secondary/40" data-testid={`position-${p.symbol}`}>
                <div>
                  <span className="font-head font-bold">{p.symbol}</span>
                  <span className="text-xs text-muted-foreground ml-2">{tv(p.side)} · {tv(p.source)}</span>
                </div>
                <div className="flex items-center flex-wrap gap-2 sm:gap-5 text-xs sm:text-sm">
                  <span className="mono">{t("entry")} ${fmt(p.entry_price)}</span>
                  <span className="mono">{t("current")} ${fmt(p.current_price)}</span>
                  <span className={`mono w-20 text-right ${pnlColor(p.pnl)}`}>{p.pnl > 0 ? "+" : ""}${fmt(p.pnl)}</span>
                  <button onClick={() => closeOne(p.id)} data-testid={`close-${p.symbol}`}
                    className="text-xs px-3 py-1 rounded-md border border-border hover:border-destructive hover:text-danger">
                    {t("close")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}


const DIR = {
  BUY: { label: "BUY", cls: "bg-success/15 text-success border-success/40", Icon: TrendingUp },
  SELL: { label: "SELL", cls: "bg-destructive/15 text-danger border-destructive/40", Icon: TrendingDown },
  HOLD: { label: "HOLD", cls: "bg-secondary text-muted-foreground border-border", Icon: Minus },
};

function timeAgo(iso, t) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return t ? t("ago_s", { n: s }) : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return t ? t("ago_m", { n: m }) : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return t ? t("ago_h", { n: h }) : `${h}h ago`;
  return t ? t("ago_d", { n: Math.floor(h / 24) }) : `${Math.floor(h / 24)}d ago`;
}

function BotAnalysis({ symbol, tf, data, levels, hasPosition }) {
  const { t, tv } = useI18n();
  if (!data) {
    return <div className="text-sm text-muted-foreground py-6 text-center" data-testid="bot-analysis-loading">{t("analyzing_on", { symbol, tf })}</div>;
  }
  const dir = DIR[data.action] || DIR.HOLD;
  const conf = data.confidence ?? 0;
  const reasons = (data.reason || "").split(";").map((r) => tReason(r.trim(), t)).filter(Boolean);
  return (
    <div className="space-y-4">
      {/* Direction + confidence */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${dir.cls}`} data-testid="bot-direction">
        <span className="flex items-center gap-2 font-head font-bold text-lg">
          <dir.Icon size={18} /> {tv(dir.label)}
        </span>
        <span className="text-xs text-muted-foreground">{symbol} · {tf}</span>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>{t("confidence")}</span>
          <span className="mono text-foreground" data-testid="bot-confidence" dir="ltr">{conf}/100</span>
        </div>
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-primary transition-all" style={{ width: `${conf}%` }} />
        </div>
      </div>

      {/* Reasoning */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">{t("reasoning")}</div>
        <ul className="space-y-1.5" data-testid="bot-reasoning">
          {reasons.map((r, i) => (
            <li key={i} className="text-xs flex items-start gap-1.5">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Entry / TP / SL */}
      {levels && (
        <div className="space-y-2" data-testid="bot-levels">
          <LevelRow color="#f7931a" Icon={Target} label={t("entry")} value={levels.entry} />
          <LevelRow color="#26a17b" Icon={Target} label={t("tp_label")} value={levels.take_profit} />
          <LevelRow color="#e5484d" Icon={Shield} label={t("sl_label")} value={levels.stop_loss} />
        </div>
      )}

      {/* Risk:Reward */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40 border border-border">
        <span className="text-xs text-muted-foreground">{t("risk_reward")}</span>
        <span className="mono font-semibold text-gold" data-testid="bot-risk-reward" dir="ltr">1 : {data.risk_reward ?? 2}</span>
      </div>

      <div className="text-[0.625rem] text-muted-foreground text-center" data-testid="bot-levels-source">
        {hasPosition ? t("levels_from_position") : t("levels_suggested")}
      </div>
    </div>
  );
}

function LevelRow({ color, Icon, label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <Icon size={13} style={{ color }} /> {label}
      </span>
      <span className="mono font-medium" dir="ltr">${fmt(value)}</span>
    </div>
  );
}
