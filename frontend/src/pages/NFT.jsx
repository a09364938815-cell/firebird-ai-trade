import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, X } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, Stat, fmt } from "@/components/common";

const TIERS = ["all", "Legendary", "Epic", "Rare", "Common"];

const tierColor = {
  Legendary: "text-gold border-gold/40 bg-gold/10",
  Epic: "text-[#B026FF] border-[#B026FF]/40 bg-[#B026FF]/10",
  Rare: "text-[#00E5FF] border-[#00E5FF]/40 bg-[#00E5FF]/10",
  Common: "text-muted-foreground border-border bg-secondary/40",
};

export default function NFT() {
  const { t, tv } = useI18n();
  const [tier, setTier] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const stats = useQuery({ queryKey: ["nft-stats"], queryFn: () => api.get("/nft/stats").then((r) => r.data) });
  const collection = useQuery({
    queryKey: ["nft", tier, page],
    queryFn: () => api.get(`/nft/collection?tier=${tier}&page=${page}&page_size=24`).then((r) => r.data),
  });

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
              <button key={r.token_id} onClick={() => setSelected(r)}
                className="group relative rounded-xl overflow-hidden border border-gold/30 card-hover text-left" data-testid={`rare-${r.token_id}`}>
                <img src={r.image} alt={r.name} className="w-full aspect-square object-cover" />
                <div className="absolute top-2 right-2"><Crown size={16} className="text-gold" /></div>
                <div className="p-2 bg-background/80">
                  <div className="text-xs font-head font-bold truncate">#{String(r.token_id).padStart(3, "0")}</div>
                  <div className="text-[10px] text-gold truncate">{r.name.replace(/Firebird #\d+ /, "")}</div>
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
          <button key={it.token_id} onClick={() => setSelected(it)}
            className={`rounded-xl overflow-hidden border card-hover text-left ${tierColor[it.tier] || "border-border"}`} data-testid={`nft-${it.token_id}`}>
            <img src={it.image} alt={it.name} className="w-full aspect-square object-cover" loading="lazy" />
            <div className="p-2">
              <div className="text-xs font-head font-bold truncate">#{String(it.token_id).padStart(3, "0")}</div>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tierColor[it.tier]}`}>{tv(it.tier)}</span>
                <span className="mono text-[10px] text-muted-foreground">{it.floor_price_eth}Ξ</span>
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

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="nft-detail-modal">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative glass fire-glow rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto grid md:grid-cols-2 gap-0 fade-up">
            <img src={selected.image} alt={selected.name} className="w-full h-full object-cover md:rounded-l-2xl max-h-[45vh] md:max-h-none" />
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Firebird #{String(selected.token_id).padStart(3, "0")}</div>
                  <h3 className="font-head font-extrabold text-2xl fire-text">{selected.name.replace(/Firebird #\d+ ?/, "") || "Firebird"}</h3>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-md hover:bg-secondary" data-testid="nft-modal-close"><X size={18} /></button>
              </div>
              <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border ${tierColor[selected.tier]}`}>{tv(selected.tier)}</span>
              <p className="text-sm text-slate-300 leading-relaxed mt-4">{selected.story}</p>
              <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
                {selected.traits && Object.entries(selected.traits).map(([k, v]) => (
                  <div key={k} className="p-2 rounded-lg bg-secondary/40">
                    <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                    <div className="font-medium">{v}</div>
                  </div>
                ))}
                <div className="p-2 rounded-lg bg-secondary/40">
                  <div className="text-[10px] uppercase text-muted-foreground">{t("floor_price")}</div>
                  <div className="font-medium mono">{selected.floor_price_eth} ETH</div>
                </div>
                <div className="p-2 rounded-lg bg-secondary/40">
                  <div className="text-[10px] uppercase text-muted-foreground">{t("rarity")}</div>
                  <div className="font-medium mono">{selected.rarity_score}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
