import React, { useState } from "react";
import { toast } from "sonner";
import {
  useAccount, useBalance, useChainId, useDisconnect, useSwitchChain,
  useReadContracts, useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { erc20Abi, formatUnits } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, ShieldCheck, Copy, Check, LogOut, Link2, CheckCircle2, XCircle,
  Trash2, RefreshCw, Lock, ShieldAlert,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Panel, fmt } from "@/components/common";
import api, { formatApiErrorDetail } from "@/lib/api";
import { CHAINS, CHAIN_LABEL, STABLES, DEX_ROUTERS, shortAddr } from "@/web3/config";

function SectionLabel({ children, testid }) {
  return <div className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-2 mt-5 first:mt-0" data-testid={testid}>{children}</div>;
}

export function WalletPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const native = useBalance({ address, query: { enabled: !!address } });
  const [copied, setCopied] = useState(false);

  const stableEntries = Object.entries(STABLES[chainId] || {});
  const tokenReads = useReadContracts({
    allowFailure: true,
    contracts: stableEntries.map(([, tk]) => ({
      address: tk.address, abi: erc20Abi, functionName: "balanceOf", args: [address],
    })),
    query: { enabled: !!address && stableEntries.length > 0 },
  });

  // ---- Smart contract allowances (stablecoins → DEX router) ----
  const router = DEX_ROUTERS[chainId];
  const allowanceReads = useReadContracts({
    allowFailure: true,
    contracts: (router && address) ? stableEntries.map(([, tk]) => ({
      address: tk.address, abi: erc20Abi, functionName: "allowance", args: [address, router.address],
    })) : [],
    query: { enabled: !!address && !!router && stableEntries.length > 0 },
  });
  const { writeContract } = useWriteContract();
  const allowances = stableEntries.map(([sym, tk], i) => {
    const raw = allowanceReads.data?.[i]?.result;
    const amt = raw !== undefined && raw !== null ? Number(formatUnits(raw, tk.decimals)) : 0;
    return { sym, tk, amt };
  }).filter((a) => a.amt > 0);
  const revoke = (tk) => {
    if (!router) return;
    writeContract(
      { address: tk.address, abi: erc20Abi, functionName: "approve", args: [router.address, BigInt(0)] },
      { onSuccess: () => toast.success(t("revoke")), onError: (e) => toast.error((e?.shortMessage || e?.message || "").slice(0, 100)) },
    );
  };

  // ---- Connected exchanges ----
  const list = useQuery({ queryKey: ["ex-list"], queryFn: () => api.get("/exchanges/list").then((r) => r.data) });
  const conns = list.data?.connections || [];
  const refreshEx = () => { qc.invalidateQueries({ queryKey: ["ex-list"] }); qc.invalidateQueries({ queryKey: ["ex-balances"] }); };
  const testEx = async (id) => {
    try { const { data } = await api.post(`/exchanges/${id}/test`); toast[data.ok ? "success" : "warning"](data.message); refreshEx(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };
  const removeEx = async (id) => {
    try { await api.delete(`/exchanges/${id}`); toast.success(t("remove")); refreshEx(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><ShieldCheck size={18} className="text-gold" /> {t("wallet_security")}</span>} testid="wallet-panel">
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-success/10 border border-success/30" data-testid="wallet-security-notice">
        <ShieldCheck size={15} className="text-success shrink-0 mt-0.5" />
        <p className="text-xs text-success">{t("wallet_never_ask")}</p>
      </div>

      {/* ---- Connected Wallets ---- */}
      <SectionLabel testid="section-wallets">{t("connected_wallets")}</SectionLabel>
      {!isConnected ? (
        <div className="space-y-2" data-testid="wallet-empty-state">
          <p className="text-xs text-muted-foreground">{t("no_wallet_connected")}</p>
          <button onClick={() => openConnectModal?.()} data-testid="wallet-connect-button"
            className="fire-btn w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
            <Wallet size={16} /> {t("connect_wallet")}
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="wallet-connected">
          <div className="p-3 rounded-lg bg-secondary/40 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-xs font-semibold">{connector?.name || "Wallet"}</span>
                <span className="mono text-sm" dir="ltr" data-testid="wallet-address">{shortAddr(address)}</span>
                <button onClick={copy} data-testid="wallet-copy-button" title={t("copy_address")}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground">
                  {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
              <span className="text-[0.625rem] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30" data-testid="wallet-chain-badge">
                {CHAIN_LABEL[chainId] || `#${chainId}`}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <div className="p-2 rounded-lg bg-background/40">
                <div className="text-[0.625rem] uppercase text-muted-foreground">{t("native_balance")}</div>
                <div className="font-medium mono" dir="ltr" data-testid="wallet-native-balance">
                  {native.data ? `${fmt(Number(native.data.formatted), 4)} ${native.data.symbol}` : "…"}
                </div>
              </div>
              {stableEntries.map(([sym, tk], i) => {
                const raw = tokenReads.data?.[i]?.result;
                const val = raw !== undefined && raw !== null ? formatUnits(raw, tk.decimals) : null;
                return (
                  <div key={sym} className="p-2 rounded-lg bg-background/40">
                    <div className="text-[0.625rem] uppercase text-muted-foreground">{sym}</div>
                    <div className="font-medium mono" dir="ltr" data-testid={`wallet-token-${sym}`}>{val !== null ? fmt(Number(val), 2) : "…"}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <select value={chainId} onChange={(e) => switchChain({ chainId: Number(e.target.value) })} data-testid="wallet-switch-chain"
                className="flex-1 px-3 py-1.5 rounded-lg bg-input border border-border focus:border-primary outline-none text-xs">
                {CHAINS.map((c) => <option key={c.id} value={c.id}>{CHAIN_LABEL[c.id] || c.name}</option>)}
              </select>
              <button onClick={() => disconnect()} data-testid="wallet-disconnect-button"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-destructive/40 text-danger hover:bg-destructive/10 flex items-center gap-1.5">
                <LogOut size={13} /> {t("disconnect_wallet")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Connected Exchanges ---- */}
      <SectionLabel testid="section-exchanges">{t("connected_exchanges")}</SectionLabel>
      {conns.length === 0 ? (
        <div className="space-y-1" data-testid="exchange-empty-state">
          <p className="text-xs text-muted-foreground">{t("no_exchange_linked")}</p>
          <p className="text-[0.6875rem] text-muted-foreground/70">{t("link_readonly_hint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conns.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40" data-testid={`connection-${c.exchange}`}>
              <div className="flex items-center gap-2 min-w-0">
                <Link2 size={14} className="text-gold shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.exchange_name}</div>
                  <div className="text-[0.625rem] text-muted-foreground mono truncate">{c.api_key_masked || "public"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.read_only === true && (
                  <span className="text-[0.625rem] flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30" data-testid={`readonly-${c.exchange}`}>
                    <Lock size={10} /> {t("read_only_label")}
                  </span>
                )}
                {c.verified
                  ? <span className="text-[0.625rem] flex items-center gap-1 text-success"><CheckCircle2 size={12} />{t("verified")}</span>
                  : <span className="text-[0.625rem] flex items-center gap-1 text-muted-foreground"><XCircle size={12} />{t("not_verified")}</span>}
                <button onClick={() => testEx(c.id)} data-testid={`test-${c.exchange}`} className="p-1.5 rounded hover:bg-secondary" title={t("test")}><RefreshCw size={13} /></button>
                <button onClick={() => removeEx(c.id)} data-testid={`remove-${c.exchange}`} className="p-1.5 rounded hover:bg-destructive/15 hover:text-danger" title={t("remove")}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Smart Contract Allowances ---- */}
      <SectionLabel testid="section-allowances">{t("smart_contract_allowances")}</SectionLabel>
      {(!isConnected || allowances.length === 0) ? (
        <p className="text-xs text-muted-foreground" data-testid="allowances-empty-state">{t("no_allowances")}</p>
      ) : (
        <div className="space-y-2">
          {allowances.map((a) => (
            <div key={a.sym} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40" data-testid={`allowance-${a.sym}`}>
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert size={14} className="text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{router?.name} · {a.sym}</div>
                  <div className="text-[0.625rem] text-muted-foreground mono truncate" dir="ltr">{t("max_spend")}: {fmt(a.amt, 2)} {a.sym}</div>
                </div>
              </div>
              <button onClick={() => revoke(a.tk)} data-testid={`revoke-${a.sym}`}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-destructive/40 text-danger hover:bg-destructive/10 flex items-center gap-1.5">
                <Trash2 size={12} /> {t("revoke")}
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
