# Firebird AI Trade — PRD

## Original Problem Statement
Rebuild the insecure single-file `FirebirdAI-v42-Pro.html` (all logic client-side, localStorage auth, demo-only) into a real, secure, scalable web app: React + FastAPI + MongoDB. Crypto + NFT AI trading platform with multi-language (10 + Persian, default EN, RTL), fixed nav sidebar + beginner guide, server-side JWT auth, multi-exchange data, trailing stop, memecoin scanner (no scam tokens), whale/volume tracking, crypto news, AI assistant/scoring, $100 demo mode, 5x5 backtest, and a Firebird 555 NFT collection with 6 rares. Honest scope: no guaranteed win rates, no paid-bot copying, no Facebook scraping, real trading OFF by default.

## Architecture
- Frontend: React (JSX) + Tailwind + shadcn/ui + Recharts/custom SVG candlestick + Framer + sonner. Obsidian dark + phoenix fire theme. i18n context (EN+FA full, 10 langs selectable, RTL).
- Backend: FastAPI, modular routers (auth, market, trading, scanner, ai_core, nft), all /api-prefixed.
- DB: MongoDB (users, positions, ai_messages, nft_items, login_attempts).
- Auth: JWT (httpOnly cookies + Bearer token fallback in localStorage) + bcrypt, brute-force lockout (X-Forwarded-For aware), admin seeding.
- AI: GPT-5.6 (gpt-5.6-terra) via Emergent universal key. NFT art via Gemini Nano Banana (6 rares pre-generated).
- Market data: Binance public REST with graceful synthetic fallback (labeled simulated).

## User Personas
- Retail & pro crypto traders; NFT collectors; owner/admin.

## Core Requirements (static)
Secure server-side auth; demo-first ($100); multi-language RTL; fixed sidebar + guide; live charts + signals; auto & manual demo trading with trailing stop/TP/SL; memecoin scanner (tradeable only, score>=75); whale/news feeds; AI assistant + coin scoring; 555 NFT collection w/ 6 rares; 5x5 backtest; reports; honest disclaimers.

## Implemented (2026-06)
- JWT+bcrypt auth (register/login/logout/me/refresh), brute-force lockout, admin seed.
- Dashboard (portfolio, top signals, market overview, whales, news pulse).
- Live candlestick charts (symbol + 6 timeframes) with RSI/SMA signal panel.
- AI Signals table across timeframes (RSI/SMA/momentum scoring).
- Auto-Trade (demo) with tick loop + trailing stop/TP/SL risk management.
- Manual Trade (buy/sell/close, risk-lock enforced).
- Memecoin scanner (curated tradeable coins, safety + opportunity scoring, no scams).
- 5x5 Backtest with per-window + overall stats and disclaimer.
- Positions & Reports (win rate, PnL, history, demo reset).
- NFT Firebird 555 collection (6 legendary rares via Nano Banana, tier filter, pagination, floor price sim, on-demand Gemini generation endpoint).
- AI Assistant chat + coin scoring (GPT-5.6) with history persistence.
- Settings (risk params) + Exchange Hub (demo connection states).
- i18n EN + FA (full) with RTL; language switcher for 10 languages; Beginner Guide.
- Verified: testing agent backend ~100% (after lockout fix), frontend 100%.

## Backlog / Remaining (P1/P2)
- P1: Complete translations for the other 8 languages (currently EN fallback).
- P1: Live exchange key management + real order execution (currently demo/sandbox only, by design).
- P1: WebSocket live price streaming (currently polling).
- P2: Owner console + commission/revenue share.
- P2: On-chain whale tracking via real APIs; CryptoPanic news key integration.
- P2: NFT mint/launch on-chain (Ethereum/Solana) — network TBD with user.
- P2: DEX data integration.

## Next Tasks
- Confirm target chain for NFT launch and whether real trading + owner console are needed now.

---
## Changelog (this session)

### Phase 1 — UI/UX & Localization (DONE)
- English-digit LTR numbers everywhere (Intl en-US + `.mono/.num` unicode-bidi isolate); RTL table fixes + mobile card lists.
- Full EN/FA i18n; dynamic value translator `tv()` (BUY/SELL/HOLD, tiers, verdicts, reasons, source). Guide steps translated + numbered.
- NFT embedded-image-text removal deferred by user (cost); card text already CSS-rendered.

### Phase 2 — Auto-Trade Risk Rules (DONE, curl-verified)
- All limits in backend/.env: AUTO_MAX_LEVERAGE, AUTO_DEFAULT_LEVERAGE, MAX_CONCURRENT_TRADES, MAX_DRAWDOWN_PCT, MAX_CONSECUTIVE_LOSSES, MIN_STOP_LOSS_PCT, MIN_SAFETY_SCORE, AUTO_MIN_SCORE, AUTO_TIMEFRAMES.
- Mandatory SL/TP, strict 2:1, AI leverage (2→10x by score), max 2 concurrent ("Max concurrent trades reached."), all timeframes, safe memecoins (safety≥75), 20% drawdown halt, 5 consecutive-loss halt.
- Fixed equity/drawdown inflation bug via `_account_equity` (cash+margin+unrealized); peak reset on demo-reset/resume.
- UI risk-status indicator (mode, consecutive losses, drawdown).

### Phase 3 — Cloud Trading & Multi-Exchange (DONE, curl-verified)
- Server-side 24/7 cloud trading via platform cron `.emergent/crons.yml` → POST /api/cron/trade-cycle (Bearer WEBHOOK_CRON_SECRET). Enable/Disable buttons + green/red status.
- SSE `/api/trading/stream` real-time (no polling); state persisted in DB.
- In-app notifications (bell + badge) on open/close/SL-TP/halt.
- Adapter pattern (exchange_adapters.py): BaseExchangeAdapter, CCXTAdapter (CoinEx/XT/Toobit/Binance/Kraken/OKX/Bybit), Iranian REST (Nobitex/Wallex/Bitpin), DEX (Uniswap/Pancake/Jupiter), ExchangeManager. Aggregated balances/prices UI. Keys encrypted (Fernet). Injected non-custodial wallet connect.
- NFT marketplaces endpoint (OpenSea/Blur/Magic Eden/TON Diamonds) with fallback.
- NOTE: live order execution not enabled (demo); cloud cadence ≥15min in prod.

### Security Audit + Fixes (DONE, testing_agent iteration_5 = 19/19 PASS)
- SEC-002: SSE now uses a short-lived scoped stream token (type "stream", 60s) via POST /api/trading/stream-token; full access JWT rejected on the stream (401). auth.py: create_stream_token/decode_stream_sub.
- SEC-001: exchange keys encrypted at rest with dedicated DATA_ENCRYPTION_KEY (separate from JWT_SECRET); api_key no longer stored in plaintext (api_key_enc + api_key_masked); legacy decrypt fallback. Only masked keys returned.
- Hardening: malformed ObjectId → 404 (exchanges + notifications).
- Verdict was CONDITIONAL PASS; both MEDIUM findings now fixed & verified.

## Backlog / Next
- P0: Phase 4 — Crypto payment gateway (TRC20/BEP20/ERC20), Owner Console profit withdrawal, on-chain webhook verify, admin 2FA.
- P1: Phases 5 (AI assistant floating chat, forgot-password, support), 6 (backtest timeframes, real scanner + anti-scam, top-3), 7 (Lightweight Charts, bot reasoning panel, onboarding icons).
- P2: full 10-language translations; live order execution (real trading) once keys provided.
- Cleanup: remove now-unused auth.decode_access_sub.


### Security — Secret Rotation (owner-requested, DONE)
- Rotated ADMIN_PASSWORD (safe charset), JWT_SECRET (64 hex), DATA_ENCRYPTION_KEY (Fernet) multiple times; re-encrypted stored exchange keys old→new on each data-key rotation.
- New values live ONLY in /app/backend/.env. seed_admin (idempotent) re-hashes admin password on restart.
- Deleted /app/OWNER_SECRETS.txt, QR files, and /app/memory/test_credentials.md at owner's request. Admin creds now sourced from .env ADMIN_PASSWORD only (read programmatically, never printed).

### Manual Trade — FIX 1 (DONE, testing_agent iteration_6, no critical issues)
- Backend market.py: GET /api/market/search (auth), /api/market/ticker (auth), and per-user Watchlist in MongoDB (GET/POST/DELETE /api/market/watchlist, db.users.watchlist, user-scoped).
- Frontend ManualTrade.jsx: searchable coin selector (browser fetches Binance exchangeInfo universe, cached localStorage fb_universe; falls back to backend /api/market/search when browser blocked), per-user Watchlist chips (add/remove/select, persists across reload), real-time price via Binance WebSocket (wss trade stream) with graceful fallback to coins snapshot.
- ENV NOTE: preview datacenter is geo/CORS-blocked from Binance (search/ticker use curated fallback, WS 451). On the user's real device the full universe + live WS work.
- Manual Trade route is /manual (not /manual-trade). i18n NOT touched (new labels English per user request).

### Manual Trade — remaining FIXES (P1, pending user go-ahead one at a time)
- FIX 2: Lightweight Charts (TradingView) candlestick + timeframe selector.
- FIX 3 (DONE 2026-06, self-verified via screenshot): TradingChart.jsx now renders 3 panes — candles, green/red Volume histogram (pane 1), Money Flow Index (MFI 14) line with 20/80 guide lines (pane 2). Live-updates via Binance kline WS (recomputes MFI each tick). Legend + live reading badge ("MFI xx · Bullish inflow/Bearish outflow/Overbought/Oversold"). Chart locale pinned to en-US (fixes en-US@posix crash + enforces English digits). ManualTrade.jsx: Free Balance box (portfolio.cash) with "Max" button that fills the amount.
- FIX 4 (DONE 2026-06, self-verified via screenshot): Backend GET /api/market/analysis?symbol&interval (auth) — Firebird AI Core compute_signal on the selected timeframe → {action BUY/SELL/HOLD, score, confidence 0-100 (=|score-50|*2), reason, entry, stop_loss, take_profit, sl_pct 3, tp_pct 6, risk_reward 2:1}. ManualTrade.jsx: Bot Analysis panel (next to chart on lg via grid-cols-12: OpenPosition col-3 / Chart col-6 / BotAnalysis col-3; stacks below chart on mobile, collapsible toggle lg:hidden). Shows direction badge (green/red/gray), confidence bar, reasoning bullets, Entry/TP/SL rows, R:R. TradingChart.jsx: new `levels` prop draws Entry (yellow) / TP (green) / SL (red) horizontal priceLines with axis labels via a dedicated effect (no chart rebuild on refetch). Levels come from the user's open position for that symbol when one exists (live), else from the AI signal.
- FIX 5 (DONE 2026-06, self-verified via screenshot): Backend GET /api/market/signals additive-enriched with `confidence` + `generated_at`, cached 60s. ManualTrade.jsx Auto Signals panel (left column under order form, collapsible on mobile) shows TOP 3 signals (non-HOLD preferred) as clickable cards: symbol/USDT, direction badge, confidence bar+score, first reasoning clause, timeAgo(). Click → setSymbol + setSuggested(symbol) → chart + Bot Analysis + order form update. "Analyze any coin" search (quickAnalyze). ONE-TAP TRADE: when suggested===symbol, order form shows a compact box (Direction/Entry/TP/SL from the same /market/analysis source so badge+levels always agree) and rings the matching Buy/Sell button. Trade payload unchanged ({symbol,side,usd_amount,leverage}); backend still enforces SL/TP rules.
- FIX 6 (DONE 2026-06, self-verified via screenshot): Manual Trade Pro.
  - Part A (Auto Signals custom token + TF): new `sigTf` state (default 15m) with 1m/5m/15m/1h/4h selector driving the signals query AND custom analysis; "Add any token" search reuses searchCoins() (Binance universe + /market/search fallback) with a dropdown; selecting runs on-demand useQuery(["custom-analysis",customSymbol,sigTf]) → /market/analysis; renders a removable custom card (symbol, direction, confidence bar, reason, Entry/TP/SL, TF badge, "Tap to load on chart"). Custom tokens NOT persisted. Top-3 list kept.
  - Part B (S/R zones): TradingChart computeZones() finds volume-weighted swing pivots over last ~100 candles, clusters within 0.6%, picks top 3 support (<price) + 3 resistance (>price) by hits+volume, draws dashed green/red priceLines faded by recency, `showZones` toggle, crosshair hover tooltip (Support/Resistance at $X · Hit N× · Vol $Y) via subscribeCrosshairMove + coordinateToPrice.
  - Part C (Money Depth): new components/MoneyDepth.jsx — volume-by-price (24 buckets) from last 100 klines, green=buy(up candle) red=sell(down) USD bars extending left, current-price bucket highlighted gold, refetch every 5s, ~92px left column, `showDepth` toggle (defaults collapsed on mobile via innerWidth<1024).
  - Part D (layout): chart panel = flex [MoneyDepth | TradingChart(candles+volume+MFI panes)]. NOTE: MFI kept as existing bottom pane inside chart (not moved to a separate right column) to avoid rework — deliberate.
  - Part E: Free Balance+Max, top-3 signals, One-Tap Trade, Bot Analysis, Entry/TP/SL lines all preserved.
- FIX 7-8 (NOT STARTED): strategy details, polish. Pending: signal direction/confidence filters; deferred email+username account system.
- DEFERRED (user, low credits): Email/username account system + email verification + forgot password/username + 2FA. Full plan captured; build when credits allow.
- Later: translate the new Manual Trade English labels into i18n (user deferred to save credits).

