import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Send, Sparkles, Target } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useI18n } from "@/i18n";
import { PageTitle, Panel, fmt, toLatin } from "@/components/common";

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "DOGE", "AVAX", "LINK", "XRP"];
const TFS = ["15m", "1h", "4h", "1d"];

export default function Assistant() {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [symbol, setSymbol] = useState("BTC");
  const [tf, setTf] = useState("1h");
  const [score, setScore] = useState(null);
  const [scoring, setScoring] = useState(false);
  const endRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    api.get("/ai/history").then((r) => setMessages(r.data)).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, parseFloat(getComputedStyle(document.documentElement).fontSize) * 6.5)}px`;
  }, [input]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const msg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ai/chat", { message: msg, language: lang });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
      setMessages((m) => [...m, { role: "assistant", content: t("ai_error") }]);
    } finally {
      setBusy(false);
    }
  };

  const runScore = async () => {
    setScoring(true);
    setScore(null);
    try {
      const { data } = await api.post("/ai/score", { symbol, interval: tf, language: lang });
      setScore(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setScoring(false);
    }
  };

  return (
    <div>
      <PageTitle title={t("nav_assistant")} subtitle="GPT-5.6 Firebird AI Core" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title={<span className="flex items-center gap-2"><Sparkles size={18} className="text-gold" /> {t("chat")}</span>} className="lg:col-span-2 flex flex-col" testid="ai-chat">
          <div className="h-[calc(100dvh-300px)] min-h-[280px] lg:flex-1 lg:h-auto lg:min-h-[360px] lg:max-h-[460px] overflow-y-auto overscroll-contain space-y-3 pb-4 px-1" data-testid="ai-chat-messages">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-16">
                {t("ai_empty")}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div dir="auto" className={`max-w-[85%] min-w-0 px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-start ${m.role === "user" ? "bg-primary/20 border border-primary/30" : "bg-secondary/60 border border-border"}`} data-testid={`ai-msg-${i}`}>
                  {toLatin(String(m.content ?? "")).replace(/٪/g, "%")}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-muted-foreground">{t("ai_thinking")}</div>}
            <div ref={endRef} />
          </div>
          <div className="sticky bottom-0 z-10 flex items-end gap-2 pt-3 border-t border-border/60 bg-card" data-testid="ai-chat-input-bar">
            <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("ask_ai")} data-testid="ai-chat-input" dir="auto"
              className="flex-1 min-w-0 resize-none max-h-[6.5rem] overflow-y-auto px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm leading-6" />
            <button onClick={send} disabled={busy} data-testid="ai-chat-send" className="fire-btn shrink-0 w-11 h-11 flex items-center justify-center rounded-lg disabled:opacity-50">
              <Send size={18} className="rtl:-scale-x-100" />
            </button>
          </div>
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><Target size={18} className="text-primary" /> {t("score_coin")}</span>} testid="ai-score">
          <label className="text-xs text-muted-foreground">{t("any_coin_symbol")}</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder={t("coin_example_placeholder")}
            data-testid="score-custom-input"
            className="w-full mt-1 mb-3 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none mono uppercase"
          />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {SYMBOLS.map((s) => (
              <button key={s} onClick={() => setSymbol(s)} data-testid={`score-symbol-${s}`}
                className={`px-2 py-1 rounded text-xs border ${symbol === s ? "bg-primary/15 text-primary border-primary/40" : "border-border"}`}>{s}</button>
            ))}
          </div>
          <div className="flex gap-1.5 mb-4">
            {TFS.map((f) => (
              <button key={f} onClick={() => setTf(f)}
                className={`px-2 py-1 rounded text-xs mono border ${tf === f ? "bg-gold/15 text-gold border-gold/40" : "border-border"}`}>{f}</button>
            ))}
          </div>
          <button onClick={runScore} disabled={scoring} data-testid="run-score-button" className="fire-btn w-full py-2.5 rounded-lg font-semibold mb-4 disabled:opacity-60">
            {scoring ? t("analyzing") : t("score_coin")}
          </button>
          {score && (
            <div className="space-y-3" data-testid="score-result">
              <div className="text-center">
                <div className="font-head font-extrabold text-4xl fire-text">{score.score}</div>
                <div className="text-sm text-gold">{score.rating}</div>
              </div>
              <ScoreRow label={t("entry_strategy")} value={score.entry_strategy} />
              <ScoreRow label={t("exit_strategy")} value={score.exit_strategy} />
              <ScoreRow label={t("risk")} value={score.risk} />
              <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{score.summary}</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ScoreRow({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
