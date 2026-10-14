import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { useTradeLimits } from "@/components/RiskLeverageControls";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor } from "@/components/common";

const DEFAULT_SYMBOLS = ["BTC","ETH","SOL","BNB","DOGE","AVAX"];
const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function Backtest() {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState("BTC");
  const [coins, setCoins] = useState(() => {
    try {
      const saved = localStorage.getItem("fb_backtest_coins");
      return saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
    } catch (e) { return DEFAULT_SYMBOLS; }
  });
  const [showAddCoin, setShowAddCoin] = useState(false);
  const [newCoinInput, setNewCoinInput] = useState("");
  const addCoin = () => {
    const t = newCoinInput.trim().toUpperCase();
    if (!t || coins.includes(t)) { setShowAddCoin(false); setNewCoinInput(""); return; }
    const n = [...coins, t];
    setCoins(n);
    localStorage.setItem("fb_backtest_coins", JSON.stringify(n));
    setShowAddCoin(false);
    setNewCoinInput("");
  };
  const removeCoin = (c) => {
    if (coins.length <= 1) return;
    const n = coins.filter(x => x !== c);
    setCoins(n);
    localStorage.setItem("fb_backtest_coins", JSON.stringify(n));
    if (symbol === c) setSymbol(n[0]);
  };
  const [tf, setTf] = useState("1h");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const [compare, setCompare] = useState(null);
  const minSl = useTradeLimits(symbol)?.min_stop_loss_pct ?? 2;
  const [slRaw, setSl] = useState(() => Number(localStorage.getItem("fb_bt_sl")) || 2);
  const sl = Math.max(slRaw, minSl);
  const [minScore, setMinScore] = useState(() => Number(localStorage.getItem("fb_bt_score")) || 55);
  const strat = `&stop_loss_pct=${sl}&min_score=${minScore}`;
  const setSlP = (v) => { setSl(v); localStorage.setItem("fb_bt_sl", v); };
  const setScoreP = (v) => { setMinScore(v); localStorage.setItem("fb_bt_score", v); };
  const runCompare = async () => {
    setBusy("cmp");
    try {
      const res = await Promise.all(TFS.map((f) => api.get(`/trading/backtest?symbol=${symbol}&interval=${f}&save=false${strat}`, { timeout: 120000 }).then((r) => r.data).catch(() => null)));
      setCompare({ symbol, rows: res.map((d, i) => ({ tf: TFS[i], d })) });
    } finally {
      setBusy(false);
    }
  };

  const run = async (all = false) => {
    setBusy(all ? "all" : "one");
    try {
      const q = all ? `symbols=${coins.join(",")}` : `symbol=${symbol}`;
      const { data } = await api.get(`/trading/backtest?${q}&interval=${tf}${strat}`, { timeout: 120000 });
      setResult(data);
      qc.invalidateQueries({ queryKey: ["backtest-history"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const okResults = (result?.results || []).filter((r) => !r.error);
  const multi = okResults.length > 1;

  return (
    <div>
      <PageTitle title={t("nav_backtest")} subtitle={t("bt_subtitle")} />
      <Panel className="mb-6" testid="backtest-config">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("symbol")}</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {coins.map((s) => (
                <button key={s} onClick={() => setSymbol(s)} data-testid={`bt-symbol-${s}`}
                  className={`group px-2.5 py-1 rounded-md text-xs border flex items-center gap-1 ${symbol === s ? "bg-primary/15 text-primary border-primary/40" : "border-border"}`}>
                  {s}
                  {coins.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); removeCoin(s); }} data-testid={`bt-remove-${s}`} className="opacity-40 hover:opacity-100 hover:text-red-400 cursor-pointer text-sm leading-none">×</span>
                  )}
                </button>
              ))}
              {showAddCoin ? (
                <span className="flex items-center gap-1">
                  <input autoFocus value={newCoinInput} onChange={(e) => setNewCoinInput(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12))}
                    onKeyDown={(e) => { if (e.key === "Enter") addCoin(); if (e.key === "Escape") setShowAddCoin(false); }}
                    placeholder="PEPE" dir="ltr" data-testid="bt-add-coin-input"
                    className="w-20 px-2 py-1 rounded-md text-xs mono bg-input border border-border focus:border-primary outline-none" />
                  <button onClick={addCoin} data-testid="bt-add-coin-confirm" className="px-2 py-1 rounded-md text-xs border border-primary/40 text-primary">✓</button>
                </span>
              ) : (
                <button onClick={() => setShowAddCoin(true)} data-testid="bt-add-coin-button"
                  className="px-2.5 py-1 rounded-md text-xs border border-dashed border-border text-muted-foreground hover:text-primary">+</button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("timeframe")}</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {TFS.map((f) => (
                <button key={f} onClick={() => setTf(f)} data-testid={`bt-tf-${f}`}
                  className={`px-2.5 py-1 rounded-md text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border"}`}>{f}</button>
              ))}
            </div>
          </div>
          <StrategySettings sl={sl} minSl={minSl} setSl={setSlP} minScore={minScore} setMinScore={setScoreP} t={t} />
          <button onClick={() => run(false)} disabled={!!busy} data-testid="backtest-run-button"
            className="fire-btn px-5 py-2 rounded-lg font-semibold disabled:opacity-60">
            {busy === "one" ? t("running") : t("run_backtest")}
          </button>
          <button onClick={() => run(true)} disabled={!!busy} data-testid="backtest-run-all-button"
            className="px-5 py-2 rounded-lg font-semibold border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-60">
            {busy === "all" ? t("running") : <>{t("bt_run_all")} <span className="mono">({coins.length})</span></>}
          </button>
          <button onClick={runCompare} disabled={!!busy} data-testid="backtest-compare-tf-button"
            className="px-5 py-2 rounded-lg font-semibold border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-60">
            {busy === "cmp" ? t("running") : <>{t("bt_compare_tf")} <span className="mono">({symbol})</span></>}
          </button>
        </div>
      </Panel>

      {compare && <TimeframeCompare compare={compare} t={t} />}
      <BacktestHistory t={t} />
      {result && (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs" data-testid="backtest-data-source">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${result.data_source === "live" ? "bg-success/15 text-success border-success/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}>
              {result.data_source === "live" ? t("bt_data_live") : t("bt_data_simulated")}
            </span>
            <span className="mono text-muted-foreground" dir="ltr">{multi ? `${okResults.length} coins` : result.symbol} · {result.interval}</span>
            <span className="ms-auto flex gap-2">
              <button onClick={() => shareCard(cardFromResult(result, okResults), t, true)} data-testid="backtest-download-button"
                className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-border hover:bg-secondary font-semibold">
                <Download size={14} /> {t("bt_download")}
              </button>
              <button onClick={() => shareCard(cardFromResult(result, okResults), t)} data-testid="backtest-share-button"
                className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-primary/40 text-primary hover:bg-primary/10 font-semibold">
                <Share2 size={14} /> {t("bt_share")}
              </button>
            </span>
          </div>
          {multi && <MultiResults result={result} okResults={okResults} t={t} />}
          {!multi && <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label={t("total_trades")} value={result.total_trades} />
            <Stat label={t("win_rate")} value={`${result.overall_win_rate}%`} accent="text-gold" />
            <Stat label={t("return_label")} value={`${result.overall_return_pct > 0 ? "+" : ""}${result.overall_return_pct}%`} accent={pnlColor(result.overall_return_pct)} />
          </div>
          <Panel title={t("window_results")} testid="backtest-results">
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase text-start">
                  <th className="py-2 text-start">{t("window")}</th><th className="text-start">{t("trades")}</th><th className="text-start">{t("win_rate")}</th><th className="text-start">{t("return_label")}</th>
                </tr>
              </thead>
              <tbody>
                {result.windows.map((w) => (
                  <tr key={w.window} className="border-t border-border/50">
                    <td className="py-2.5 mono">#{w.window}</td>
                    <td className="mono">{w.trades}</td>
                    <td className="mono">{w.win_rate}%</td>
                    <td className={`mono ${pnlColor(w.return_pct)}`}>{w.return_pct > 0 ? "+" : ""}{w.return_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="sm:hidden space-y-2">
              {result.windows.map((w) => (
                <div key={w.window} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 text-xs">
                  <span className="mono font-bold">#{w.window}</span>
                  <span className="mono">{t("trades")} {w.trades}</span>
                  <span className="mono">{w.win_rate}%</span>
                  <span className={`mono ${pnlColor(w.return_pct)}`}>{w.return_pct > 0 ? "+" : ""}{w.return_pct}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">{result.disclaimer}</p>
          </Panel>
          </>}
          {!multi && <SectionTable bySection={result.by_section} t={t} />}
        </>
      )}
    </div>
  );
}

const sign = (v) => `${v > 0 ? "+" : ""}${v}%`;

function MultiResults({ result, okResults, t }) {
  const trades = okResults.reduce((a, r) => a + r.total_trades, 0);
  const wins = okResults.reduce((a, r) => a + r.windows.reduce((b, w) => b + (w.wins || 0), 0), 0);
  const avgRet = +(okResults.reduce((a, r) => a + r.overall_return_pct, 0) / okResults.length).toFixed(2);
  const failed = (result.results || []).filter((r) => r.error || r.total_trades === undefined);
  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-6" data-testid="backtest-multi-summary">
        <Stat label={t("total_trades")} value={trades} />
        <Stat label={t("win_rate")} value={`${trades ? ((wins / trades) * 100).toFixed(1) : 0}%`} accent="text-gold" />
        <Stat label={t("bt_avg_return")} value={sign(avgRet)} accent={pnlColor(avgRet)} />
      </div>
      <SectionTable bySection={result.by_section} t={t} />
      <Panel title={t("bt_per_coin")} className="mb-6" testid="backtest-per-coin">
        <ResultRows highlight rows={okResults.map((r) => ({ key: r.symbol, label: r.symbol, sub: t(`bt_sec_${r.section}`), trades: r.total_trades, win: r.overall_win_rate, ret: r.overall_return_pct }))} t={t} prefix="coin" />
        {failed.length > 0 && <p className="text-xs text-muted-foreground mt-3" dir="ltr">{t("bt_skipped")}: {failed.map((r) => r.symbol).join(", ")}</p>}
        <p className="text-xs text-muted-foreground mt-4">{result.disclaimer}</p>
      </Panel>
    </>
  );
}

function SectionTable({ bySection, t }) {
  const rows = Object.entries(bySection || {});
  if (!rows.length) return null;
  return (
    <Panel title={t("bt_by_section")} className="mb-6" testid="backtest-by-section">
      <ResultRows rows={rows.map(([sec, s]) => ({ key: sec, label: t(`bt_sec_${sec}`), sub: s.coins.join(", "), trades: s.total_trades, win: s.win_rate, ret: s.avg_return_pct ?? s.return_pct }))} t={t} prefix="section" retLabel={t("bt_avg_return")} />
    </Panel>
  );
}

function ResultRows({ rows, t, prefix, retLabel, highlight }) {
  const rets = rows.map((r) => r.ret);
  const best = highlight && rows.length > 1 ? Math.max(...rets) : null;
  const worst = highlight && rows.length > 1 ? Math.min(...rets) : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[0.625rem] uppercase text-muted-foreground px-3">
        <span /><span className="w-12 text-end">{t("trades")}</span><span className="w-14 text-end">{t("win_rate")}</span><span className="w-16 text-end">{retLabel || t("return_label")}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center p-3 rounded-lg text-xs border ${r.ret === best ? "bg-success/10 border-success/40" : r.ret === worst ? "bg-destructive/10 border-destructive/40" : "bg-secondary/40 border-transparent"}`} data-testid={`bt-${prefix}-row-${r.key}`}>
          <div className="min-w-0"><div className="font-semibold truncate flex items-center gap-1.5">{r.label}
            {r.ret === best && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded bg-success/20 text-success" data-testid={`bt-best-${r.key}`}>{t("bt_best")}</span>}
            {r.ret === worst && <span className="text-[0.5625rem] px-1.5 py-0.5 rounded bg-destructive/20 text-danger" data-testid={`bt-worst-${r.key}`}>{t("bt_worst")}</span>}
          </div><div className="text-[0.625rem] text-muted-foreground break-words rtl:text-right" dir="ltr">{r.sub}</div></div>
          <span className="mono w-12 text-end">{r.trades}</span>
          <span className="mono w-14 text-end">{r.win}%</span>
          <span className={`mono w-16 text-end ${pnlColor(r.ret)}`}>{sign(r.ret)}</span>
        </div>
      ))}
    </div>
  );
}

function TimeframeCompare({ compare, t }) {
  const ok = compare.rows.filter((r) => r.d);
  return (
    <Panel title={`${t("bt_compare_tf")} · ${compare.symbol}`} className="mb-6" testid="backtest-tf-compare">
      <ResultRows highlight prefix="tf" t={t}
        rows={ok.map(({ tf, d }) => ({ key: tf, label: tf, sub: "", trades: d.total_trades, win: d.overall_win_rate, ret: d.overall_return_pct }))} />
      {ok.length > 0 && <p className="text-[0.625rem] text-muted-foreground mt-3">{ok.every(({ d }) => d.data_source === "live") ? t("bt_data_live") : t("bt_data_simulated")}</p>}
    </Panel>
  );
}

function cardFromResult(r, ok) {
  const multi = ok.length > 1;
  const trades = multi ? ok.reduce((a, x) => a + x.total_trades, 0) : r.total_trades;
  const wins = ok.reduce((a, x) => a + x.windows.reduce((b, w) => b + (w.wins || 0), 0), 0);
  return {
    title: multi ? ok.map((x) => x.symbol).join(", ") : r.symbol, interval: r.interval, trades,
    win: multi ? (trades ? +((wins / trades) * 100).toFixed(1) : 0) : r.overall_win_rate,
    ret: multi ? +(ok.reduce((a, x) => a + x.overall_return_pct, 0) / ok.length).toFixed(2) : r.overall_return_pct,
    source: r.data_source, date: new Date().toISOString(),
    sl: r.config?.stop_loss_pct ?? r.stop_loss_pct, minScore: r.config?.min_score,
  };
}

const cardFromRun = (h) => ({ title: h.symbols.join(", "), interval: h.interval, trades: h.total_trades, win: h.win_rate, ret: h.return_pct, source: h.data_source, date: h.created_at, sl: h.stop_loss_pct, minScore: h.min_score });

// Draws a 1080x1080 result card on canvas, then shares (mobile) or downloads it as PNG.
async function shareCard(c, t, downloadOnly = false) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1080;
  const g = cv.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, "#0b0f17"); bg.addColorStop(1, "#1a0d06");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
  g.strokeStyle = "rgba(255,120,40,0.5)"; g.lineWidth = 4; g.strokeRect(40, 40, 1000, 1000);
  g.direction = "ltr"; g.textAlign = "left";
  g.fillStyle = "#ff8a3d"; g.font = "800 64px sans-serif"; g.fillText("FireBird Crypto", 90, 160);
  g.fillStyle = "#9aa3b2"; g.font = "500 36px sans-serif"; g.fillText("AI Backtest Result", 90, 215);
  g.fillStyle = "#ffffff"; g.font = "800 56px monospace";
  const title = c.title.length > 26 ? `${c.title.slice(0, 25)}…` : c.title;
  g.fillText(`${title} · ${c.interval}`, 90, 340);
  const stats = [["Trades", String(c.trades), "#ffffff"], ["Win rate", `${c.win}%`, "#f5c542"], ["Return", `${c.ret > 0 ? "+" : ""}${c.ret}%`, c.ret >= 0 ? "#22c55e" : "#ef4444"]];
  stats.forEach(([label, val, col], i) => {
    const y = 480 + i * 150;
    g.fillStyle = "#9aa3b2"; g.font = "500 34px sans-serif"; g.fillText(label, 90, y);
    g.fillStyle = col; g.font = "800 84px monospace"; g.fillText(val, 90, y + 90);
  });
  if (c.sl) {
    g.fillStyle = "#9aa3b2"; g.font = "500 30px monospace";
    g.fillText(`SL ${c.sl}% · TP ${+(c.sl * 2).toFixed(2)}% · Min score ${c.minScore ?? "-"}`, 90, 900);
  }
  g.fillStyle = c.source === "live" ? "#22c55e" : "#f59e0b"; g.font = "700 30px sans-serif";
  g.fillText(c.source === "live" ? "LIVE market data" : "SIMULATED data", 90, 960);
  g.fillStyle = "#6b7280"; g.font = "400 26px monospace"; g.textAlign = "right";
  g.fillText(String(c.date).slice(0, 16).replace("T", " ") + " UTC", 990, 960);
  g.font = "400 22px sans-serif"; g.fillText("Past performance does not guarantee future results.", 990, 1005);
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  const name = `firebird-backtest-${c.interval}.png`;
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (!downloadOnly && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "FireBird Backtest" }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast.success(t("bt_card_saved"));
}

function BacktestHistory({ t }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["backtest-history"], queryFn: () => api.get("/trading/backtest/history").then((r) => r.data) });
  if (!data.length) return null;
  const del = async (id) => {
    try { await api.delete(`/trading/backtest/history/${id}`); qc.invalidateQueries({ queryKey: ["backtest-history"] }); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };
  return (
    <Panel title={t("bt_history")} className="mb-6" testid="backtest-history">
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {data.map((h) => (
          <div key={h.id} className="p-3 rounded-lg bg-secondary/40 text-xs" data-testid={`bt-history-${h.id}`}>
            <div className="font-semibold break-words" dir="ltr">{h.symbols.join(", ")} · {h.interval}</div>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="text-[0.625rem] text-muted-foreground mono flex-1 min-w-0" dir="ltr">{String(h.created_at).slice(0, 16).replace("T", " ")} · {h.data_source}{h.stop_loss_pct ? ` · SL ${h.stop_loss_pct}% · TP ${h.take_profit_pct}% · ≥${h.min_score}` : ""}</div>
              <span className="mono shrink-0">{h.total_trades}</span>
              <span className="mono shrink-0">{h.win_rate}%</span>
              <span className={`mono shrink-0 ${pnlColor(h.return_pct)}`}>{sign(h.return_pct)}</span>
              <button onClick={() => shareCard(cardFromRun(h), t)} data-testid={`bt-history-share-${h.id}`} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md hover:bg-primary/10 text-primary"><Share2 size={14} /></button>
              <button onClick={() => del(h.id)} data-testid={`bt-history-delete-${h.id}`} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md hover:bg-destructive/10 text-danger"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function StrategySettings({ sl, minSl, setSl, minScore, setMinScore, t }) {
  return (
    <div className="w-full grid sm:grid-cols-2 gap-4 p-3 rounded-lg bg-secondary/30 border border-border/60" data-testid="backtest-strategy-settings">
      <label className="text-xs text-muted-foreground">
        <span className="flex justify-between"><span>{t("bt_stop_loss")}</span>
          <span className="mono text-foreground" data-testid="bt-sl-value">SL {sl}% · TP {+(sl * 2).toFixed(1)}%</span></span>
        <input type="range" min={minSl} max={10} step={0.5} value={sl} onChange={(e) => setSl(Number(e.target.value))}
          className="w-full mt-1 accent-orange-500" dir="ltr" data-testid="bt-sl-input" />
      </label>
      <label className="text-xs text-muted-foreground">
        <span className="flex justify-between"><span>{t("bt_min_score")}</span>
          <span className="mono text-foreground" data-testid="bt-score-value">{minScore}</span></span>
        <input type="range" min={50} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
          className="w-full mt-1 accent-orange-500" dir="ltr" data-testid="bt-score-input" />
      </label>
    </div>
  );
}
