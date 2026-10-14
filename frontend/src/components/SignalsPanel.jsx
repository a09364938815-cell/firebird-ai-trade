import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, TrendingUp, TrendingDown, Minus, ShieldCheck, ShieldAlert, ExternalLink, ChevronDown, LineChart, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { useI18n, tReason } from "@/i18n";
import { fmt, pnlColor } from "@/components/common";
import { TradeConfirmModal } from "@/components/TradeConfirmModal";

const TFS = ["all", "1m", "5m", "15m", "1h", "4h", "1d"];
const TABS = ["all", "major", "shitcoins", "nfts", "opps"];
const OPP_TFS = ["all", "15m", "1h", "4h", "1d"];
const DIR = {
  BUY: { cls: "bg-success/15 text-success border-success/40", Icon: TrendingUp },
  SELL: { cls: "bg-destructive/15 text-danger border-destructive/40", Icon: TrendingDown },
  HOLD: { cls: "bg-secondary text-muted-foreground border-border", Icon: Minus },
};

export function SignalsPanel({ onPick, freeBalance = 0, defaultLeverage = 1 }) {
  const { t, tv } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("all");
  const [tf, setTf] = useState("1h");
  const [dirFilter, setDirFilter] = useState("all");
  const [minConf, setMinConf] = useState(0);
  const [modal, setModal] = useState(null);

  const fetchTf = tf === "all" ? "1h" : tf;
  const major = useQuery({ queryKey: ["sig-major", fetchTf], queryFn: () => api.get(`/market/signals?interval=${fetchTf}`).then((r) => r.data), refetchInterval: 60000, staleTime: 60000 });
  const shit = useQuery({ queryKey: ["sig-shit", fetchTf], queryFn: () => api.get(`/market/signals/shitcoins?interval=${fetchTf}`).then((r) => r.data), refetchInterval: 60000, staleTime: 60000 });
  const nfts = useQuery({ queryKey: ["sig-nfts"], queryFn: () => api.get("/market/signals/nfts").then((r) => r.data), refetchInterval: 60000, staleTime: 60000 });

  const [oppMin, setOppMin] = useState(80);
  const [oppTf, setOppTf] = useState("all");
  const [oppDir, setOppDir] = useState("all");
  const opps = useQuery({
    queryKey: ["opps", oppMin, oppTf, oppDir],
    queryFn: () => api.get(`/scanner/opportunities?min_score=${oppMin}&timeframe=${oppTf}&direction=${oppDir}`).then((r) => r.data),
    refetchInterval: 60000, staleTime: 30000,
  });

  const loading = major.isLoading || shit.isLoading || nfts.isLoading;
  const counts = { major: (major.data || []).length, shitcoins: (shit.data || []).length, nfts: (nfts.data || []).length };
  counts.all = counts.major + counts.shitcoins + counts.nfts;
  counts.opps = (opps.data?.opportunities || []).length;

  const rows = useMemo(() => {
    const M = major.data || [], S = shit.data || [], N = nfts.data || [];
    let list = tab === "all" ? [...M, ...S, ...N] : tab === "major" ? M : tab === "shitcoins" ? S : N;
    list = list.filter((s) => dirFilter === "all" || s.action === dirFilter);
    list = list.filter((s) => (s.confidence ?? 0) >= minConf);
    return [...list].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 30);
  }, [major.data, shit.data, nfts.data, tab, dirFilter, minConf]);

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["portfolio"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["nft-positions"] });
  };

  return (
    <div className="glass card-hover rounded-2xl p-5 md:p-6" data-testid="auto-signals-panel">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-head font-semibold text-lg flex items-center gap-2">
          <Zap size={17} className="text-gold" /> {t("auto_signals")}
        </h3>
        <button onClick={() => setOpen((v) => !v)} data-testid="auto-signals-toggle" className="lg:hidden p-1 rounded hover:bg-secondary">
          <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Free balance available for trade */}
      <div className="flex items-center justify-between text-xs mb-3 px-3 py-2 rounded-lg bg-secondary/40 border border-border" data-testid="signals-free-balance">
        <span className="text-muted-foreground">{t("available_for_trade")}</span>
        <span className="mono font-semibold text-success" dir="ltr">${fmt(freeBalance)}</span>
      </div>

      <div className={`${open ? "" : "hidden"} lg:block`}>
        {/* Tabs */}
        <div className="grid grid-cols-5 gap-1 mb-3" data-testid="signals-tabs">
          {TABS.map((tb) => (
            <button key={tb} onClick={() => setTab(tb)} data-testid={`signals-tab-${tb}`}
              className={`py-1 rounded-md text-[0.6875rem] font-medium border ${tab === tb ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary text-muted-foreground"}`}>
              {tb === "all" ? t("all") : t(`tab_${tb}`)} <span className="opacity-70" dir="ltr">({counts[tb] ?? 0})</span>
            </button>
          ))}
        </div>

        {tab === "opps" ? (
          <OppsBody data={opps.data} loading={opps.isLoading} t={t} tv={tv}
            oppMin={oppMin} setOppMin={setOppMin} oppTf={oppTf} setOppTf={setOppTf} oppDir={oppDir} setOppDir={setOppDir}
            onPick={onPick} onTradeModal={(signal, side) => setModal({ signal, side })} />
        ) : (
        <>
        {/* Filters */}
        <div className="space-y-2 mb-3" data-testid="signals-filters">
          {tab !== "nfts" && (
            <div className="flex gap-1" data-testid="signals-tf">
              {TFS.map((f) => (
                <button key={f} onClick={() => setTf(f)} data-testid={`signals-tf-${f}`}
                  className={`flex-1 py-1 rounded-md text-[0.6875rem] mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
                  <span dir="ltr">{f}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1" data-testid="signals-direction">
            {[["all", t("all")], ["BUY", t("buy_only")], ["SELL", t("sell_only")]].map(([v, label]) => (
              <button key={v} onClick={() => setDirFilter(v)} data-testid={`signals-dir-${v}`}
                className={`flex-1 py-1 rounded-md text-[0.6875rem] border ${dirFilter === v ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground mb-0.5">
              <span>{t("min_confidence")}</span>
              <span className="mono" dir="ltr">{minConf}</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}
              data-testid="signals-minconf" className="w-full accent-orange-500" />
          </div>
        </div>

        {/* Cards */}
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center" data-testid="auto-signals-empty">
            {loading ? t("scanning_market") : t("no_signals")}
          </div>
        ) : (
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1" data-testid="auto-signals-list">
            {rows.map((s) => (
              <SignalCard key={`${s.kind}-${s.symbol}-${s.nft_id ?? ""}`} s={s} t={t} tv={tv}
                onPick={onPick} onTrade={(side) => setModal({ signal: s, side })} />
            ))}
          </div>
        )}
        </>
        )}
      </div>

      {modal && (
        <TradeConfirmModal signal={modal.signal} side={modal.side} freeBalance={freeBalance}
          defaultLeverage={defaultLeverage} onClose={() => setModal(null)} onDone={onDone} />
      )}
    </div>
  );
}

function OppsBody({ data, loading, t, tv, oppMin, setOppMin, oppTf, setOppTf, oppDir, setOppDir, onPick, onTradeModal }) {
  const rows = data?.opportunities || [];
  return (
    <div data-testid="opportunities-body">
      {/* Permanent, non-dismissable risk disclaimer */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 mb-3" data-testid="risk-disclaimer">
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <div className="text-[0.6875rem] font-semibold text-amber-300">{t("risk_disclaimer_title")}</div>
          <p className="text-[0.6875rem] text-amber-200/90 leading-relaxed">{t("risk_disclaimer")}</p>
        </div>
      </div>

      <div className="text-[0.6875rem] text-muted-foreground mb-2" data-testid="alerts-today">
        <span className="mono font-semibold text-gold" dir="ltr">{data?.alerts_today ?? 0}</span> {t("alerts_triggered_today")}
      </div>

      {/* Opp filters */}
      <div className="space-y-2 mb-3" data-testid="opp-filters">
        <div className="flex gap-1" data-testid="opp-tf">
          {OPP_TFS.map((f) => (
            <button key={f} onClick={() => setOppTf(f)} data-testid={`opp-tf-${f}`}
              className={`flex-1 py-1 rounded-md text-[0.6875rem] mono border ${oppTf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-secondary"}`}>
              <span dir="ltr">{f === "all" ? t("all") : f}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1" data-testid="opp-direction">
          {[["all", t("all")], ["BUY", t("buy_only")], ["SELL", t("sell_only")]].map(([v, label]) => (
            <button key={v} onClick={() => setOppDir(v)} data-testid={`opp-dir-${v}`}
              className={`flex-1 py-1 rounded-md text-[0.6875rem] border ${oppDir === v ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground mb-0.5">
            <span>{t("score_range")}</span>
            <span className="mono" dir="ltr">{oppMin}–100</span>
          </div>
          <input type="range" min={80} max={100} step={1} value={oppMin} onChange={(e) => setOppMin(Number(e.target.value))}
            data-testid="opp-minscore" className="w-full accent-orange-500" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center" data-testid="opportunities-empty">
          {loading ? t("scanning_market") : t("no_opportunities")}
        </div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" data-testid="opportunities-list">
          {rows.map((o) => (
            <div key={`${o.asset_type}-${o.symbol}-${o.timeframe}`}>
              <div className="flex items-center justify-end mb-1">
                <span className="text-[0.625rem] font-bold px-1.5 py-0.5 rounded-md bg-gold/20 text-gold border border-gold/40 flex items-center gap-1" data-testid={`opp-score-${o.symbol}`}>
                  <AlertTriangle size={9} /> {t("high_opportunity")} · <span dir="ltr">{o.score}</span>
                </span>
              </div>
              <SignalCard s={o} t={t} tv={tv} onPick={onPick} onTrade={(side) => onTradeModal(o, side)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalCard({ s, t, tv, onPick, onTrade }) {
  const d = DIR[s.action] || DIR.HOLD;
  const isNft = s.kind === "nft";
  const isShit = s.kind === "shitcoin";
  const rrColor = (rr) => (rr >= 2 ? "text-success" : rr >= 1 ? "text-gold" : "text-orange-400");
  return (
    <div className={`p-3 rounded-lg border bg-secondary/40 ${isShit ? "border-gold/30" : isNft ? "border-[#B026FF]/30" : "border-border"}`}
      data-testid={`signal-card-${s.symbol}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <button onClick={() => !isNft && onPick && onPick(s.symbol, s.interval)} className="flex items-center gap-2 min-w-0 text-start" data-testid={`signal-pick-${s.symbol}`}>
          {isNft && s.image && <img src={s.image} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />}
          <span className="font-head font-bold text-sm truncate">{isNft ? s.symbol : `${s.symbol}/USDT`}</span>
          <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-background/60 text-muted-foreground mono shrink-0" data-testid={`signal-tf-${s.symbol}`} dir="ltr">{s.interval || "15m"}</span>
        </button>
        <span className={`text-[0.6875rem] px-2 py-0.5 rounded-md border font-semibold flex items-center gap-1 shrink-0 ${d.cls}`}>
          <d.Icon size={11} /> {tv(s.action)}
        </span>
      </div>

      {/* NFT extra line: floor, best marketplace, 24h volume */}
      {isNft && (
        <div className="space-y-1 mb-1.5 text-[0.6875rem] mono" dir="ltr">
          <div className="flex items-center justify-between">
            <span className="text-gold">{t("floor")}: <span className="mono whitespace-nowrap">${fmt(s.floor_price_usd)}</span></span>
            <span className={pnlColor(s.change_24h)}>{s.change_24h > 0 ? "+" : ""}{fmt(s.change_24h)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("best_marketplace")}: <span className="text-foreground">{s.best_marketplace_name}</span></span>
            <span className="text-muted-foreground">{t("volume_24h")}: <span className="mono whitespace-nowrap">{fmt(s.volume_24h_eth, 2)}Ξ</span></span>
          </div>
        </div>
      )}

      {/* confidence bar */}
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-primary" style={{ width: `${s.confidence ?? 0}%` }} />
        </div>
        <span className="mono text-[0.6875rem] text-muted-foreground" dir="ltr">{s.confidence ?? 0}</span>
      </div>

      {/* Entry / TP / SL / R:R (crypto + shitcoin) */}
      {!isNft && s.entry != null && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[0.6875rem] mono my-1.5 py-1.5 border-y border-border/40" dir="ltr" data-testid={`signal-levels-${s.symbol}`}>
          <span className="text-gold">{t("entry")}: ${fmt(s.entry)}</span>
          <span className={rrColor(s.risk_reward)}>{t("rr_short")}: {s.risk_reward} : 1</span>
          <span className="text-success">{t("tp_short")}: ${fmt(s.take_profit)} (+{fmt(s.tp_pct)}%)</span>
          <span className="text-danger">{t("sl_short")}: ${fmt(s.stop_loss)} (-{fmt(s.sl_pct)}%)</span>
        </div>
      )}

      {/* Shitcoin safety badges */}
      {isShit && (
        <div className="flex items-center flex-wrap gap-1.5 mb-1.5 text-[0.625rem]">
          <span className={`px-1.5 py-0.5 rounded border ${(s.safety_score ?? 0) >= 75 ? "text-success border-success/40 bg-success/10" : "text-danger border-destructive/40 bg-destructive/10"}`} data-testid={`signal-safety-${s.symbol}`}>
            {t("safety_score")} {s.safety_score}
          </span>
          <span className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${s.honeypot_safe ? "text-success border-success/40" : "text-danger border-destructive/40"}`}>
            {s.honeypot_safe ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}{t("honeypot")}
          </span>
        </div>
      )}

      <div className="text-[0.6875rem] text-muted-foreground truncate mb-2">{tReason((s.reason || "").split(";")[0], t)}</div>

      <div className="flex gap-2">
        <button onClick={() => onTrade("BUY")} data-testid={`signal-buy-${s.symbol}`}
          className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30">{t("buy")}</button>
        <button onClick={() => onTrade("SELL")} data-testid={`signal-sell-${s.symbol}`}
          className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-destructive/20 text-danger border border-destructive/40 hover:bg-destructive/30">{t("sell")}</button>
        {isNft ? (
          <a href="https://opensea.io" target="_blank" rel="noreferrer" data-testid={`signal-opensea-${s.nft_id}`}
            className="px-2 py-1.5 rounded-md text-xs border border-border hover:bg-secondary flex items-center" title={t("view_on_opensea")}>
            <ExternalLink size={13} />
          </a>
        ) : (
          <button onClick={() => onPick && onPick(s.symbol, s.interval)} data-testid={`signal-chart-${s.symbol}`}
            className="px-2 py-1.5 rounded-md text-xs border border-border hover:bg-secondary flex items-center gap-1 text-muted-foreground" title={t("view_chart")}>
            <LineChart size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
