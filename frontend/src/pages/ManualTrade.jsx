import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Star, X, Plus, Wifi, Wallet, TrendingUp, TrendingDown, Minus, Target, Shield, ChevronDown, Bot, Zap } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, pnlColor } from "@/components/common";
import { TradingChart } from "@/components/TradingChart";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"];

export default function ManualTrade() {
  const { t, tv } = useI18n();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTC");
  const [tf, setTf] = useState("15m");
  const [amount, setAmount] = useState(25);
  const [leverage, setLeverage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [signalsOpen, setSignalsOpen] = useState(true);
  const [sigQuery, setSigQuery] = useState("");

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

  // Auto Signals: top movers from the AI Core for the current timeframe (backend caches 60s).
  const signals = useQuery({
    queryKey: ["auto-signals", tf],
    queryFn: () => api.get(`/market/signals?interval=${tf}`).then((r) => r.data),
    refetchInterval: 60000,
    staleTime: 60000,
  });
  const topSignals = useMemo(() => {
    const rows = signals.data || [];
    const active = rows.filter((s) => s.action !== "HOLD");
    return (active.length ? active : rows).slice(0, 5);
  }, [signals.data]);

  const pickSignal = (s) => { setSymbol(s.symbol); };
  const quickAnalyze = (e) => {
    e.preventDefault();
    const q = sigQuery.trim().toUpperCase().replace(/USDT$/, "");
    if (q) { setSymbol(q); setSigQuery(""); }
  };

  // Fallback price (from coins snapshot) if WS has not delivered yet
  const fallbackPrice = coins.data?.find((c) => c.symbol === symbol)?.price;
  const price = livePrice ?? fallbackPrice;
  const freeBalance = portfolio.data?.cash ?? 0;

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

  // Debounced coin search: local (Binance universe) first, server fallback
  useEffect(() => {
    const q = query.trim().toUpperCase();
    if (!q) { setResults([]); return; }
    const tmo = setTimeout(async () => {
      const uni = universeRef.current;
      let local = [];
      if (uni.length) {
        const starts = uni.filter((s) => s.startsWith(q));
        const contains = uni.filter((s) => s.includes(q) && !s.startsWith(q));
        local = [...starts, ...contains].slice(0, 30).map((s) => ({ symbol: s, name: s }));
      }
      if (local.length) {
        setResults(local);
        setShowResults(true);
        return;
      }
      // Universe unavailable (e.g. browser blocked from Binance) → server search fallback
      try {
        const { data } = await api.get(`/market/search?q=${encodeURIComponent(q)}`);
        setResults(data.results || []);
        setShowResults(true);
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(tmo);
  }, [query]);

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
    setBusy(true);
    try {
      const { data } = await api.post("/trading/manual", { symbol, side, usd_amount: Number(amount), leverage: Number(leverage) });
      if (data.warning) toast.warning(data.warning);
      toast.success(side === "BUY" ? `Opened ${symbol} ${data.leverage || leverage}x position` : `Closed ${symbol} · PnL $${data.pnl ?? 0}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const closeOne = async (id) => {
    try {
      const { data } = await api.post(`/trading/positions/${id}/close`);
      toast.success(`Closed · PnL $${data.pnl}`);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_manual")} subtitle={t("disclaimer")} />
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
                placeholder="Search any coin (e.g. BTC, PEPE, ARB)"
                data-testid="coin-search-input"
                className="w-full bg-transparent outline-none text-sm mono" />
            </div>
            {showResults && results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto glass rounded-lg border border-border" data-testid="coin-search-results">
                {results.map((r) => (
                  <button key={r.symbol} onClick={() => pick(r.symbol)} data-testid={`search-result-${r.symbol}`}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary text-start">
                    <span className="text-sm font-medium">{r.symbol}</span>
                    <span className="text-[11px] text-muted-foreground truncate ml-2">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected symbol + live price + add to watchlist */}
          <div className="flex items-center justify-between mb-2" data-testid="selected-symbol-bar">
            <div className="flex items-center gap-2">
              <span className="font-head font-bold text-lg" data-testid="selected-symbol">{symbol}</span>
              <button onClick={() => addWatch(symbol)} title="Add to watchlist" data-testid="add-watchlist-button"
                className="p-1 rounded hover:bg-secondary text-gold">
                <Plus size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi size={12} className={liveConnected ? "text-success" : "text-muted-foreground/50"} data-testid="live-indicator" />
              <span className="text-[10px] text-muted-foreground">{liveConnected ? "Live" : "…"}</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground mb-2">
            {t("price")}: <span className="mono text-foreground" data-testid="live-price">${fmt(price)}</span>
          </div>
          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-secondary/40 border border-border" data-testid="free-balance-box">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet size={13} className="text-gold" /> Free Balance
            </div>
            <div className="flex items-center gap-2">
              <span className="mono font-semibold text-success" data-testid="free-balance-value">${fmt(freeBalance)}</span>
              <button type="button" onClick={() => setAmount(Math.floor(freeBalance))} disabled={!freeBalance}
                data-testid="free-balance-max"
                className="text-[10px] px-2 py-0.5 rounded-md border border-border hover:border-gold hover:text-gold disabled:opacity-40">
                Max
              </button>
            </div>
          </div>

          {/* Watchlist */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Star size={12} className="text-gold" /> Watchlist
            </div>
            {wl.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">No coins yet — search and tap + to add.</div>
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

          <label className="text-xs text-muted-foreground">{t("amount_usd")}</label>
          <input type="number" value={amount} min={1} onChange={(e) => setAmount(e.target.value)}
            data-testid="manual-amount-input"
            className="w-full mt-1 mb-3 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none mono" />
          <label className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{t("leverage")}</span>
            <span className={`mono ${leverage >= 10 ? "text-danger" : "text-gold"}`}>{leverage}x</span>
          </label>
          <input type="range" min={1} max={50} step={1} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))}
            data-testid="manual-leverage-input"
            className="w-full mt-1 mb-1 accent-orange-500" />
          {leverage >= 10 && (
            <div className="text-[11px] text-danger mb-3" data-testid="leverage-warning">
              ⚠️ {t("high_leverage_warning")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <button disabled={busy} onClick={() => trade("BUY")} data-testid="manual-buy-button"
              className="py-2.5 rounded-lg font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30 disabled:opacity-50">
              {t("buy")}
            </button>
            <button disabled={busy} onClick={() => trade("SELL")} data-testid="manual-sell-button"
              className="py-2.5 rounded-lg font-semibold bg-destructive/20 text-danger border border-destructive/40 hover:bg-destructive/30 disabled:opacity-50">
              {t("sell")}
            </button>
          </div>
        </Panel>

        {/* Auto Signals — reuses Firebird AI Core, cached 60s. Click to load into chart + order form. */}
        <div className="glass card-hover rounded-2xl p-5 md:p-6" data-testid="auto-signals-panel">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-head font-semibold text-lg flex items-center gap-2">
              <Zap size={17} className="text-gold" /> Auto Signals
            </h3>
            <button onClick={() => setSignalsOpen((v) => !v)} data-testid="auto-signals-toggle"
              className="lg:hidden p-1 rounded hover:bg-secondary">
              <ChevronDown size={18} className={`transition-transform ${signalsOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div className={`${signalsOpen ? "" : "hidden"} lg:block`}>
            {/* Custom coin quick-analyze */}
            <form onSubmit={quickAnalyze} className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg bg-input border border-border focus-within:border-primary">
                <Search size={13} className="text-muted-foreground shrink-0" />
                <input value={sigQuery} onChange={(e) => setSigQuery(e.target.value)}
                  placeholder="Analyze any coin…" data-testid="auto-signals-search"
                  className="w-full bg-transparent outline-none text-sm mono" />
              </div>
              <button type="submit" data-testid="auto-signals-analyze"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25">
                Analyze
              </button>
            </form>

            {topSignals.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center" data-testid="auto-signals-empty">
                {signals.isLoading ? "Scanning the market…" : "No signals yet."}
              </div>
            ) : (
              <div className="space-y-2" data-testid="auto-signals-list">
                {topSignals.map((s) => {
                  const d = DIR[s.action] || DIR.HOLD;
                  return (
                    <button key={s.symbol} onClick={() => pickSignal(s)} data-testid={`auto-signal-${s.symbol}`}
                      className={`w-full text-start p-3 rounded-lg border transition-colors hover:border-primary/50 ${symbol === s.symbol ? "bg-primary/10 border-primary/40" : "bg-secondary/40 border-border"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-head font-bold text-sm">{s.symbol}/USDT</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-md border font-semibold flex items-center gap-1 ${d.cls}`}>
                          <d.Icon size={11} /> {d.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-gold to-primary" style={{ width: `${s.confidence ?? 0}%` }} />
                        </div>
                        <span className="mono text-[11px] text-muted-foreground">{s.confidence ?? 0}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{(s.reason || "").split(";")[0]}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(s.generated_at)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>

        <Panel
          title={
            <div className="flex items-center justify-between w-full gap-3 flex-wrap">
              <span className="flex items-center gap-2"><span className="font-head font-bold">{symbol}/USDT</span>
                <span className="mono text-sm text-muted-foreground">${fmt(price)}</span></span>
              <div className="flex gap-1" data-testid="chart-timeframes">
                {TIMEFRAMES.map((f) => (
                  <button key={f} onClick={() => setTf(f)} data-testid={`chart-tf-${f}`}
                    className={`px-2.5 py-1 rounded-md text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          }
          className="lg:col-span-6" testid="manual-chart-panel">
          <TradingChart symbol={symbol} interval={tf} levels={levels} />
        </Panel>

        {/* Bot Analysis — next to the chart on desktop, below (collapsible) on mobile */}
        <div className="lg:col-span-3" data-testid="bot-analysis-panel">
          <div className="glass card-hover rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-head font-semibold text-lg flex items-center gap-2">
                <Bot size={18} className="text-primary" /> Bot Analysis
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

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function BotAnalysis({ symbol, tf, data, levels, hasPosition }) {
  if (!data) {
    return <div className="text-sm text-muted-foreground py-6 text-center" data-testid="bot-analysis-loading">Analyzing {symbol} on {tf}…</div>;
  }
  const dir = DIR[data.action] || DIR.HOLD;
  const conf = data.confidence ?? 0;
  const reasons = (data.reason || "").split(";").map((r) => r.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      {/* Direction + confidence */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${dir.cls}`} data-testid="bot-direction">
        <span className="flex items-center gap-2 font-head font-bold text-lg">
          <dir.Icon size={18} /> {dir.label}
        </span>
        <span className="text-xs text-muted-foreground">{symbol} · {tf}</span>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Confidence</span>
          <span className="mono text-foreground" data-testid="bot-confidence">{conf}/100</span>
        </div>
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-primary transition-all" style={{ width: `${conf}%` }} />
        </div>
      </div>

      {/* Reasoning */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Reasoning</div>
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
          <LevelRow color="#f7931a" Icon={Target} label="Entry" value={levels.entry} />
          <LevelRow color="#26a17b" Icon={Target} label="Take Profit" value={levels.take_profit} />
          <LevelRow color="#e5484d" Icon={Shield} label="Stop Loss" value={levels.stop_loss} />
        </div>
      )}

      {/* Risk:Reward */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40 border border-border">
        <span className="text-xs text-muted-foreground">Risk : Reward</span>
        <span className="mono font-semibold text-gold" data-testid="bot-risk-reward">1 : {data.risk_reward ?? 2}</span>
      </div>

      <div className="text-[10px] text-muted-foreground text-center" data-testid="bot-levels-source">
        {hasPosition ? "Levels live from your open position" : "Suggested levels · not financial advice"}
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
      <span className="mono font-medium">${fmt(value)}</span>
    </div>
  );
}
