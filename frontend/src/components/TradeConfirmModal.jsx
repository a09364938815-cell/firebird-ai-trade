import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, TrendingUp, TrendingDown, ShieldCheck, ShieldAlert, ExternalLink, Wallet } from "lucide-react";
import { useAccount, useChainId, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { fmt, toLatin } from "@/components/common";
import { EXPLORER_TX, CHAIN_LABEL, shortAddr } from "@/web3/config";
import { RiskLeverageControls, useTradeLimits, riskCheck } from "@/components/RiskLeverageControls";

const QUICK = [5, 10, 25, 50, 100];

// Unified Buy/Sell confirmation for crypto, shitcoin and NFT (demo) signals.
export function TradeConfirmModal({ signal, side, freeBalance = 0, defaultLeverage = 1, onClose, onDone }) {
  const { t, tv, dir } = useI18n();
  const isNft = signal.kind === "nft";
  const isShit = signal.kind === "shitcoin";
  const [amount, setAmount] = useState(() => +(Math.max(1, freeBalance * 0.05)).toFixed(2));
  const [leverage, setLeverage] = useState(isNft ? 1 : Math.min(defaultLeverage || 1, 10));
  const [risk, setRisk] = useState(3);
  const [highAck, setHighAck] = useState(false);
  const [levAck, setLevAck] = useState(false);
  const [armed, setArmed] = useState(false);
  const limits = useTradeLimits(isNft || side !== "BUY" ? null : signal.symbol);
  const entry = isNft ? (signal.floor_price_usd || 0) : (signal.entry || signal.price || 0);
  const [tpInput, setTpInput] = useState(signal.take_profit ? String(fmt(signal.take_profit)) : "");
  const [slInput, setSlInput] = useState(signal.stop_loss ? String(fmt(signal.stop_loss)) : "");
  const [busy, setBusy] = useState(false);

  // DEX (on-chain) — user signs in their own wallet; keys never leave the device.
  const { address: wAddress, isConnected: wConnected } = useAccount();
  const wChainId = useChainId();
  const { data: txHash, sendTransaction, isPending: txPending, error: txError } = useSendTransaction();
  const txReceipt = useWaitForTransactionReceipt({ hash: txHash });
  const signDex = () => {
    if (!wAddress) return;
    sendTransaction({ to: wAddress, value: BigInt(0) });
  };

  const tpPrice = tpInput ? Number(tpInput) : null;
  const slPrice = slInput ? Number(slInput) : null;
  const notional = Number(amount) * Number(leverage);
  const after = Math.max(0, freeBalance - Number(amount));

  const preview = useMemo(() => {
    if (isNft || !entry) return null;
    const mk = (target) => {
      if (!target) return null;
      const long = side === "BUY";
      const pct = long ? (target - entry) / entry : (entry - target) / entry;
      const usd = notional * pct;
      const onMargin = Number(amount) > 0 ? (usd / Number(amount)) * 100 : 0;
      return { usd, onMargin };
    };
    return { tp: mk(tpPrice), sl: mk(slPrice) };
  }, [entry, tpPrice, slPrice, notional, amount, side, isNft]);

  const setPct = (p) => setAmount(+((freeBalance * p) / 100).toFixed(2));

  const submit = async () => {
    if (Number(amount) <= 0) { toast.error(t("amount_gt_zero")); return; }
    if (Number(amount) > freeBalance + 1e-9) { toast.error(t("amount_exceeds_balance")); return; }
    if (isShit && (signal.safety_score ?? 0) < 75) { toast.error(t("min_safety_required")); return; }
    if (!isNft && side === "BUY") {
      const err = riskCheck({ limits, risk, highAck, leverage, levAck, armed });
      if (err === "arm") { setArmed(true); toast.warning(t("lev_confirm_again")); return; }
      if (err) { toast.error(t(err)); return; }
    }
    setBusy(true);
    try {
      if (isNft) {
        await api.post("/trading/nft/open", {
          nft_id: signal.nft_id, nft_name: signal.name || signal.symbol, nft_image: signal.image,
          side, usd_amount: Number(amount),
          entry_floor_eth: signal.floor_price_eth, eth_usd: signal.eth_usd,
        });
        toast.success(t("nft_position_opened"));
      } else {
        const payload = { symbol: signal.symbol, side, usd_amount: Number(amount), leverage: Number(leverage), risk_pct: risk, high_risk_ack: highAck, leverage_confirmed: levAck && armed };
        if (side === "BUY" && entry > 0) {
          if (tpPrice) payload.take_profit_pct = +(((tpPrice - entry) / entry) * 100).toFixed(2);
          if (slPrice) payload.stop_loss_pct = +(((entry - slPrice) / entry) * 100).toFixed(2);
        }
        const { data } = await api.post("/trading/manual", payload);
        if (data.warning) toast.warning(data.warning);
        toast.success(side === "BUY" ? t("toast_opened", { symbol: signal.symbol, leverage: data.leverage || leverage }) : t("toast_closed", { symbol: signal.symbol, pnl: data.pnl ?? 0 }));
      }
      onDone && onDone();
      onClose();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const DirIcon = side === "BUY" ? TrendingUp : TrendingDown;
  const dirCls = side === "BUY" ? "text-success border-success/40 bg-success/15" : "text-danger border-destructive/40 bg-destructive/15";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="trade-confirm-modal" dir={dir}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass fire-glow rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-5 fade-up">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {isNft && signal.image && <img src={signal.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
            <div className="min-w-0">
              <div className="font-head font-bold text-lg truncate" data-testid="confirm-symbol">{isNft ? signal.symbol : `${signal.symbol}/USDT`}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[0.6875rem] px-2 py-0.5 rounded-md border font-semibold flex items-center gap-1 ${dirCls}`} data-testid="confirm-direction">
                  <DirIcon size={11} /> {tv(side)}
                </span>
                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground mono" data-testid="confirm-timeframe" dir="ltr">{signal.interval || "15m"}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} data-testid="confirm-close" className={`p-1.5 rounded-md hover:bg-secondary ${dir === "rtl" ? "order-first" : ""}`}><X size={18} /></button>
        </div>

        {/* Price / entry info */}
        <div className="rounded-lg bg-secondary/40 border border-border p-3 space-y-1.5 text-sm mb-3">
          {isNft ? (
            <>
              <Row label={t("floor")} value={<span dir="ltr">{fmt(signal.floor_price_eth, 3)} ETH</span>} />
              <Row label={t("usd_equiv")} value={<span dir="ltr">${fmt(signal.floor_price_usd)}</span>} />
              <Row label={t("rarity")} value={<span dir="ltr">{signal.rarity_score}</span>} />
            </>
          ) : (
            <>
              <Row label={t("entry")} value={<span dir="ltr">${fmt(entry)}</span>} />
              {signal.take_profit != null && <Row label={t("tp_label")} value={<span className="text-success" dir="ltr">${fmt(signal.take_profit)}</span>} />}
              {signal.stop_loss != null && <Row label={t("sl_label")} value={<span className="text-danger" dir="ltr">${fmt(signal.stop_loss)}</span>} />}
              {signal.risk_reward != null && <Row label={t("risk_reward")} value={<span className="text-gold" dir="ltr">1 : {signal.risk_reward}</span>} />}
            </>
          )}
        </div>

        {/* Shitcoin safety */}
        {isShit && (
          <div className="rounded-lg bg-secondary/40 border border-border p-3 space-y-1.5 text-xs mb-3" data-testid="confirm-safety">
            <Row label={t("safety_score")} value={<span className={(signal.safety_score ?? 0) >= 75 ? "text-success" : "text-danger"} dir="ltr">{signal.safety_score}</span>} />
            <Row label={t("liquidity_lock")} value={<span className={signal.liquidity_locked ? "text-success" : "text-danger"}>{signal.liquidity_locked ? t("locked") : t("unlocked")}</span>} />
            <Row label={t("honeypot")} value={<span className={`flex items-center gap-1 ${signal.honeypot_safe ? "text-success" : "text-danger"}`}>{signal.honeypot_safe ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}{signal.honeypot_safe ? t("honeypot_safe_label") : t("honeypot_risk")}</span>} />
          </div>
        )}

        {/* Amount */}
        <label className="text-xs text-muted-foreground">{t("amount_usd")}</label>
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(toLatin(e.target.value))} data-testid="confirm-amount-input"
          className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none mono" dir="ltr" />
        <div className="grid grid-cols-5 gap-1.5 mt-2" data-testid="confirm-quick">
          {QUICK.map((p) => (
            <button key={p} type="button" onClick={() => setPct(p)} data-testid={`confirm-pct-${p}`}
              className="py-1 rounded-md text-[0.6875rem] mono border border-border hover:bg-secondary"><span dir="ltr">{p}%</span></button>
          ))}
        </div>

        {/* Risk + leverage (crypto BUY only) */}
        {!isNft && side === "BUY" && (
          <RiskLeverageControls limits={limits} freeBalance={freeBalance} risk={risk} setRisk={setRisk} leverage={leverage}
            setLeverage={(v) => { setLeverage(v); setArmed(false); }} highAck={highAck} setHighAck={setHighAck} levAck={levAck} setLevAck={setLevAck}
            setAmount={setAmount} prefix="confirm" />
        )}

        {/* Editable TP/SL for crypto/shitcoin */}
        {!isNft && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="text-[0.625rem] text-success">{t("take_profit_price")}</label>
              <input type="text" inputMode="decimal" value={tpInput} onChange={(e) => setTpInput(toLatin(e.target.value))} data-testid="confirm-tp-input"
                className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-input border border-border focus:border-success outline-none mono text-sm" dir="ltr" />
            </div>
            <div>
              <label className="text-[0.625rem] text-danger">{t("stop_loss_price")}</label>
              <input type="text" inputMode="decimal" value={slInput} onChange={(e) => setSlInput(toLatin(e.target.value))} data-testid="confirm-sl-input"
                className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-input border border-border focus:border-danger outline-none mono text-sm" dir="ltr" />
            </div>
          </div>
        )}

        {/* P&L preview */}
        {preview && (preview.tp || preview.sl) && (
          <div className="text-[0.6875rem] mono space-y-1 mt-3 pt-2 border-t border-border/60" data-testid="confirm-pnl-preview">
            {preview.tp && <div className="flex justify-between text-success"><span>{t("if_tp_hits")}</span><span dir="ltr">+${fmt(Math.abs(preview.tp.usd))} (+{fmt(Math.abs(preview.tp.onMargin))}%)</span></div>}
            {preview.sl && <div className="flex justify-between text-danger"><span>{t("if_sl_hits")}</span><span dir="ltr">-${fmt(Math.abs(preview.sl.usd))} (-{fmt(Math.abs(preview.sl.onMargin))}%)</span></div>}
          </div>
        )}

        {isNft && <p className="text-[0.6875rem] text-amber-400 mt-3" data-testid="confirm-nft-notice">{t("nft_demo_notice")}</p>}

        {/* Balance after */}
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-muted-foreground">{t("free_balance_after")}</span>
          <span className="mono font-semibold text-gold" data-testid="confirm-balance-after" dir="ltr">${fmt(after)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={onClose} data-testid="confirm-cancel" className="py-2.5 rounded-lg font-semibold border border-border hover:bg-secondary">{t("cancel")}</button>
          <button onClick={submit} disabled={busy} data-testid="confirm-submit"
            className={`py-2.5 rounded-lg font-semibold disabled:opacity-50 ${side === "BUY" ? "bg-success/20 text-success border border-success/40 hover:bg-success/30" : "bg-destructive/20 text-danger border border-destructive/40 hover:bg-destructive/30"}`}>
            {armed ? t("confirm_again") : t("confirm")}
          </button>
        </div>

        {/* DEX on-chain signing — only when a wallet is actually connected.
            Demo trades use the paper engine and never require a wallet. */}
        {!isNft && wConnected && (
          <div className="mt-4 pt-3 border-t border-border/60" data-testid="dex-section">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold flex items-center gap-1.5"><Wallet size={13} className="text-gold" /> {t("dex_onchain")}</span>
              <span className="text-[0.625rem] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30" dir="ltr" data-testid="dex-wallet-chip">{shortAddr(wAddress)} · {CHAIN_LABEL[wChainId] || `#${wChainId}`}</span>
            </div>
            <>
              <button onClick={signDex} disabled={txPending || txReceipt.isLoading} data-testid="dex-sign-button"
                className="w-full py-2 rounded-lg text-sm font-semibold bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25 disabled:opacity-50 flex items-center justify-center gap-2">
                <Wallet size={14} /> {txPending ? t("waiting_signature") : t("sign_in_wallet")}
              </button>
              <p className="text-[0.625rem] text-muted-foreground mt-1.5">{t("dex_demo_note")}</p>
              {txError && <p className="text-[0.6875rem] text-danger mt-1.5" data-testid="dex-tx-error">{(txError.shortMessage || txError.message || "").slice(0, 120)}</p>}
              {txHash && (
                <div className="mt-2 text-[0.6875rem] space-y-1" data-testid="dex-tx-status">
                  <div className={txReceipt.isSuccess ? "text-success" : txReceipt.isLoading ? "text-amber-400" : "text-muted-foreground"}>
                    {txReceipt.isSuccess ? t("tx_confirmed") : txReceipt.isLoading ? t("tx_pending") : ""}
                  </div>
                  <a href={`${EXPLORER_TX[wChainId] || ""}${txHash}`} target="_blank" rel="noreferrer" data-testid="dex-tx-link"
                    className="flex items-center gap-1 text-primary hover:underline mono break-all" dir="ltr">
                    <ExternalLink size={12} className="shrink-0" /> {shortAddr(txHash)} · {t("view_on_explorer")}
                  </a>
                </div>
              )}
            </>
          </div>
        )}

        {isNft && (
          <a href="https://opensea.io" target="_blank" rel="noreferrer" data-testid="confirm-opensea"
            className="mt-3 flex items-center justify-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink size={13} /> {t("view_on_opensea")}
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="mono font-medium">{value}</span>
    </div>
  );
}
