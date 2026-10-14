import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, X, ExternalLink, ChevronDown, Info, Trophy, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt, pnlColor } from "@/components/common";
import { TradeConfirmModal } from "@/components/TradeConfirmModal";

const TIERS = ["all", "Legendary", "Epic", "Rare", "Common"];
const MK = ["Blur", "Magic Eden", "Rarible", "Tensor", "Enftino"];

// Stable (per-token) synthetic market meta for the collection detail view.
function nftMeta(id) {
  const r = (n) => { const x = Math.sin((id + 1) * n) * 10000; return x - Math.floor(x); };
  return {
    change_24h: +(((r(12.9) - 0.4) * 18)).toFixed(2),
    volume_24h: +((2 + r(45.2) * 20)).toFixed(2),
    market: MK[id % MK.length],
  };
}

// International marketplaces may need a VPN in some regions; Enftino is IR-friendly.
const MARKETPLACES = [
  { id: "blur", name: "Blur", intl: true },
  { id: "magiceden", name: "Magic Eden", intl: true },
  { id: "rarible", name: "Rarible", intl: true },
  { id: "tensor", name: "Tensor", intl: true },
  { id: "opensea", name: "OpenSea", intl: true },
  { id: "enftino", name: "Enftino", intl: false },
];

// Deterministic per-token cross-marketplace listings, sorted cheapest first.
function buildListings(id, floorEth, ethUsd) {
  const r = (n) => { const x = Math.sin((id + 1) * n) * 10000; return x - Math.floor(x); };
  const start = Math.floor(r(3.7) * 5);
  const picks = [MARKETPLACES[5]]; // always include Enftino
  for (let i = 0; i < 3; i++) picks.push(MARKETPLACES[(start + i) % 5]);
  const uniq = picks.filter((m, i) => picks.findIndex((p) => p.id === m.id) === i);
  const out = uniq.map((mk, idx) => {
    let delta = (r(idx + 2.1) - 0.5) * 0.12;   // ±6%
    if (!mk.intl) delta -= 0.03;               // prioritise Enftino (IR-friendly value)
    const price = +(floorEth * (1 + delta)).toFixed(4);
    return { ...mk, price_eth: price, price_usd: +(price * ethUsd).toFixed(2) };
  });
  out.sort((a, b) => a.price_eth - b.price_eth);
  return out;
}

const tierColor = {
  Legendary: "text-gold border-gold/40 bg-gold/10",
  Epic: "text-[#B026FF] border-[#B026FF]/40 bg-[#B026FF]/10",
  Rare: "text-[#00E5FF] border-[#00E5FF]/40 bg-[#00E5FF]/10",
  Common: "text-muted-foreground border-border bg-secondary/40",
};

export default function NFT() {
  const { t, tv, dir } = useI18n();
  const qc = useQueryClient();
  const [tier, setTier] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [trade, setTrade] = useState(null);
  const [vpnTip, setVpnTip] = useState(null);

  const stats = useQuery({ queryKey: ["nft-stats"], queryFn: () => api.get("/nft/stats").then((r) => r.data) });
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.get("/trading/portfolio").then((r) => r.data) });
  const coins = useQuery({ queryKey: ["coins-eth"], queryFn: () => api.get("/market/coins").then((r) => r.data) });
  const collection = useQuery({
    queryKey: ["nft", tier, page],
    queryFn: () => api.get(`/nft/collection?tier=${tier}&page=${page}&page_size=24`).then((r) => r.data),
  });

  const ethUsd = (coins.data || []).find((c) => c.symbol === "ETH")?.price || 3500;
  const freeBalance = portfolio.data?.cash ?? 0;

  const openDetail = (it) => { setSelected(it); setStoryOpen(false); setVpnTip(null); };

  const buildSignal = (it) => {
    const m = nftMeta(it.token_id);
    return {
      kind: "nft", nft_id: it.token_id, symbol: `FIREBIRD #${String(it.token_id).padStart(3, "0")}`,
      name: it.name, image: it.image, tier: it.tier, rarity_score: it.rarity_score,
      floor_price_eth: it.floor_price_eth, floor_price_usd: +(it.floor_price_eth * ethUsd).toFixed(2),
      eth_usd: +ethUsd.toFixed(2), interval: "24h",
    };
  };

  const onTradeDone = () => {
    qc.invalidateQueries({ queryKey: ["portfolio"] });
    qc.invalidateQueries({ queryKey: ["nft-positions"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };

  const s = stats.data;
  const items = collection.data?.items || [];
  const totalPages = collection.data ? Math.ceil(collection.data.total / collection.data.page_size) : 1;

  return (
    <div>
      <PageTitle title={t("collection")} subtitle={t("nft_subtitle")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("total_supply")} value={s?.total_supply ?? 555} accent="fire-text" />
        <Stat label={t("minted")} value={s?.minted ?? "—"} />
        <Stat label={t("rares")} value="6" accent="text-gold" />
        <Stat label={t("floor_price")} value={`${s?.floor_price_eth ?? "—"} ETH`} />
      </div>

      {s?.rares && (
        <Panel title={t("rares")} className="mb-6" testid="nft-rares">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {s.rares.map((r) => (
              <button key={r.token_id} onClick={() => openDetail(r)}
                className="group relative rounded-xl overflow-hidden border border-gold/30 card-hover text-left" data-testid={`rare-${r.token_id}`}>
                <img src={r.image} alt={r.name} className="w-full aspect-square object-cover" />
                <div className="absolute top-2 right-2"><Crown size={16} className="text-gold" /></div>
                <div className="p-2 bg-background/80">
                  <div className="text-xs font-head font-bold truncate">#{String(r.token_id).padStart(3, "0")}</div>
                  <div className="text-[0.625rem] text-gold truncate">{r.name.replace(/Firebird #\d+ /, "")}</div>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {TIERS.map((ti) => (
          <button key={ti} onClick={() => { setTier(ti); setPage(1); }} data-testid={`nft-tier-${ti}`}
            className={`px-3 py-1.5 rounded-lg text-sm border ${tier === ti ? "bg-primary/15 text-primary border-primary/40" : "border-border hover:bg-secondary"}`}>
            {ti === "all" ? t("all") : tv(ti)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4" data-testid="nft-gallery-grid">
        {items.map((it) => (
          <button key={it.token_id} onClick={() => openDetail(it)}
            className={`rounded-xl overflow-hidden border card-hover text-left ${tierColor[it.tier] || "border-border"}`} data-testid={`nft-${it.token_id}`}>
            <img src={it.image} alt={it.name} className="w-full aspect-square object-cover" loading="lazy" />
            <div className="p-2">
              <div className="text-xs font-head font-bold truncate">#{String(it.token_id).padStart(3, "0")}</div>
              <div className="flex items-center justify-between">
                <span className={`text-[0.625rem] px-1.5 py-0.5 rounded border ${tierColor[it.tier]}`}>{tv(it.tier)}</span>
                <span className="mono text-[0.625rem] text-muted-foreground">{it.floor_price_eth}Ξ</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 mt-6">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-4 py-2 rounded-lg border border-border disabled:opacity-40 hover:bg-secondary">{t("prev")}</button>
        <span className="text-sm mono">{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-4 py-2 rounded-lg border border-border disabled:opacity-40 hover:bg-secondary">{t("next")}</button>
      </div>

      {selected && (() => {
        const m = nftMeta(selected.token_id);
        const floorUsd = +(selected.floor_price_eth * ethUsd).toFixed(2);
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6" data-testid="nft-detail-modal" dir={dir}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} data-testid="nft-modal-backdrop" />
            <div className="relative glass fire-glow w-full max-w-4xl max-h-[88vh] md:max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl fade-up md:flex">
              <div className="md:hidden sticky top-0 z-10 flex justify-center pt-2 pb-1"><span className="h-1 w-10 rounded-full bg-white/25" /></div>
              <div className="px-5 pt-2 md:p-5 md:w-[40%] md:shrink-0 md:self-start md:sticky md:top-0">
                <img src={selected.image} alt={selected.name}
                  className="w-full max-w-[280px] md:max-w-none mx-auto aspect-square object-cover rounded-xl border border-white/10" data-testid="nft-modal-image" />
              </div>
              <div className="md:w-[60%] p-5 md:p-6 md:ps-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-head font-extrabold text-xl md:text-2xl fire-text truncate" dir="ltr" data-testid="nft-modal-title">
                        FIREBIRD #{String(selected.token_id).padStart(3, "0")} · {selected.name.replace(/Firebird #\d+ ?/, "") || "Firebird"}
                      </h3>
                      <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border ${tierColor[selected.tier]}`} data-testid="nft-modal-rarity">{tv(selected.tier)}</span>
                    </div>
                    <button onClick={() => setSelected(null)} className="p-1.5 rounded-md hover:bg-secondary shrink-0" data-testid="nft-modal-close"><X size={18} /></button>
                  </div>

                  {/* Floor + 24h change */}
                  <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <div className="text-[0.625rem] uppercase text-muted-foreground">{t("floor_price")}</div>
                      <div className="font-medium mono" dir="ltr">{selected.floor_price_eth} ETH · ${fmt(floorUsd)}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <div className="text-[0.625rem] uppercase text-muted-foreground">{t("change_24h")}</div>
                      <div className={`font-medium mono ${pnlColor(m.change_24h)}`} dir="ltr">{m.change_24h > 0 ? "+" : ""}{fmt(m.change_24h)}%</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <div className="text-[0.625rem] uppercase text-muted-foreground">{t("best_marketplace")}</div>
                      <div className="font-medium">{m.market}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <div className="text-[0.625rem] uppercase text-muted-foreground">{t("volume_24h")}</div>
                      <div className="font-medium mono" dir="ltr">{fmt(m.volume_24h, 2)} ETH</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <div className="text-[0.625rem] uppercase text-muted-foreground">{t("rarity")}</div>
                      <div className="font-medium mono" dir="ltr">{selected.rarity_score}</div>
                    </div>
                  </div>

                  {/* Buy / Sell / View */}
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <button onClick={() => setTrade({ signal: buildSignal(selected), side: "BUY" })} data-testid="nft-modal-buy"
                      className="py-2 rounded-lg text-sm font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30">{t("buy")}</button>
                    <button onClick={() => setTrade({ signal: buildSignal(selected), side: "SELL" })} data-testid="nft-modal-sell"
                      className="py-2 rounded-lg text-sm font-semibold bg-destructive/20 text-danger border border-destructive/40 hover:bg-destructive/30">{t("sell")}</button>
                    <a href="https://opensea.io" target="_blank" rel="noreferrer" data-testid="nft-modal-opensea"
                      className="py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary flex items-center justify-center gap-1"><ExternalLink size={14} /> OpenSea</a>
                  </div>

                  {/* Marketplace listings — sorted cheapest first with Best Price + VPN notices */}
                  {(() => {
                    const listings = buildListings(selected.token_id, selected.floor_price_eth, ethUsd);
                    return (
                      <div className="mt-5" data-testid="nft-marketplace-listings">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">{t("marketplace_listings")}</div>
                        <div className="space-y-2">
                          {listings.map((lst, i) => (
                            <div key={lst.id} className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${i === 0 ? "border-gold/50 bg-gold/10" : "border-border bg-secondary/40"}`} data-testid={`listing-${lst.id}`}>
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-sm font-medium">{lst.name}</span>
                                {lst.intl ? (
                                  <span className="relative inline-flex">
                                    <button type="button" onClick={() => setVpnTip(vpnTip === lst.id ? null : lst.id)}
                                      className="text-muted-foreground hover:text-primary" title={t("vpn_notice")} aria-label="vpn-info" data-testid={`vpn-info-${lst.id}`}>
                                      <Info size={13} />
                                    </button>
                                    {vpnTip === lst.id && (
                                      <span className="absolute z-20 top-5 left-0 w-56 p-2 rounded-lg bg-background border border-border text-[0.6875rem] text-muted-foreground shadow-lg" dir={dir} data-testid={`vpn-tip-${lst.id}`}>{t("vpn_notice")}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[0.625rem] flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30" data-testid="ir-friendly-badge"><ShieldCheck size={10} /> {t("ir_friendly")}</span>
                                )}
                                {i === 0 && (
                                  <span className="text-[0.625rem] flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold/20 text-gold border border-gold/40" data-testid="best-price-badge"><Trophy size={10} /> {t("best_price")}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="mono text-xs" dir="ltr">{lst.price_eth} ETH · ${fmt(lst.price_usd)}</span>
                                <button onClick={() => setTrade({ signal: { ...buildSignal(selected), floor_price_eth: lst.price_eth, floor_price_usd: lst.price_usd, market: lst.name }, side: "BUY" })}
                                  data-testid={`listing-buy-${lst.id}`} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30">{t("buy")}</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Traits */}
                  {selected.traits && (
                    <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                      {Object.entries(selected.traits).map(([k, v]) => (
                        <div key={k} className="p-2 rounded-lg bg-secondary/40">
                          <div className="text-[0.625rem] uppercase text-muted-foreground">{t(`trait_${k}`)}</div>
                          <div className="font-medium">{v}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Collapsible story */}
                  {selected.story && (
                    <div className="mt-4">
                      <button onClick={() => setStoryOpen((v) => !v)} data-testid="nft-modal-story-toggle"
                        className="flex items-center gap-1.5 text-sm font-semibold text-gold">
                        {t("story")} <ChevronDown size={15} className={`transition-transform ${storyOpen ? "rotate-180" : ""}`} />
                      </button>
                      {storyOpen && <p className="text-sm text-slate-300 leading-relaxed mt-2" data-testid="nft-modal-story">{selected.story}</p>}
                    </div>
                  )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {trade && (
        <TradeConfirmModal signal={trade.signal} side={trade.side} freeBalance={freeBalance}
          defaultLeverage={1} onClose={() => setTrade(null)} onDone={onTradeDone} />
      )}
    </div>
  );
}
