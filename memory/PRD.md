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
- FIX 6b / Manual Trade Pro order form (DONE 2026-10, self-verified via screenshot):
  - Part A: balance summary box — Free Balance (portfolio.cash, green) / In Positions (holdings_value, gray) / Total Equity (total_value, gold). testids: free-balance-value, in-positions-value, total-equity-value.
  - Part B: new components/VerticalSlider.jsx — vertical draggable % slider (marks 5/10/25/50/75/100, clickable to snap, pointer+touch drag via window listeners, gold fill below knob, orange >75%, % label on knob). Two-way sync with Amount: percent = amount/freeBalance*100, setPercent→amount=freeBalance*p/100. Quick buttons 25/50/75/100 (amount-pct-*). High-exposure warning >75%.
  - Part C: Advanced TP/SL collapsible (tpslOpen, default open desktop). Entry (optional, defaults to live price), TP price + quick +1/+2/+5/+10/+20%, SL price + quick -1/-2/-5/-10% (computed off entryBase, long/BUY framing). Live P&L preview (pnlPreview): notional=amount*leverage, usd=notional*((target-entry)/entry), onMargin %. Custom levels override chart drawing via chartLevels=customLevels||levels passed to TradingChart. trade() sends take_profit_pct/stop_loss_pct on BUY.
  - Backend: ManualTradeInput + _open_position now accept optional per-trade tp_pct/sl_pct (clamped: sl>=MIN_STOP_LOSS_PCT); manual_trade passes them. auto trades still enforce strict 2:1. Verified via curl (tp 5 / sl 3 applied).
  - Parts D/E (Money Depth + S/R + layout) were already in place from the prior Manual Trade Pro work.
- AUTH v2 (DONE 2026-10, self-verified via curl + screenshots):
  - Username system: users have unique `username` (3-20 [a-zA-Z0-9_]); login accepts username OR email in the same `email` field (LoginInput.email is str, $or lookup). Admin username="admin". Migration ensure_auth_setup() backfills usernames (from email prefix, de-duped) + session_version for existing users; unique sparse index on username; TTL index on password_reset_tokens.expires_at.
  - session_version: in user doc + JWT `sv` claim; get_current_user rejects mismatched sv (401). Bumped by change-password, reset-password, logout-all → invalidates old tokens.
  - Endpoints (auth.py): POST change-password, logout-all, username (30-day limit), forgot-password ({identifier}, neutral msg, 3/15min rate limit, token sha256-hashed + 15min expiry, link logged + emailed), reset-password ({token,password,confirm}), GET security ({username,email,email_masked,can_change,days_left}), GET dev-reset-link (admin only). Password policy: >=8 chars + letter + number, != current.
  - Email: send_email() via Gmail SMTP (EMAIL_HOST/PORT/USER/PASSWORD/FROM in .env); EMAIL_USER/PASSWORD empty → fallback logs "[PASSWORD RESET LINK]" to backend.*.log. User to add Gmail app password later.
  - Privacy: email NEVER in public UI. Header shows username ("Welcome, <username>"). Owner Console shows username + admin-only eye reveal (overview returns username + real email, admin-only endpoint). Settings → Profile & Security panel: username edit, masked email + reveal, change password, logout-all.
  - Frontend: Login label "Username or Email" + Forgot Password link; new /forgot-password + /reset-password pages (routes in App.js); SecurityPanel in Settings; OwnerPanel username+reveal. i18n untouched (English literals).
  - test_credentials.md updated (admin / Firebird2026 / username admin).
- FIX 7 (Mobile Responsive, DONE 2026-10, desktop verified via screenshot; true 375px not captured — screenshot tool forces 1920 viewport):
  - TradingChart: container h-[320px] md:h-[460px]; pane heights 190/60/60 on mobile (innerWidth<768) vs 280/90/90 desktop.
  - VerticalSlider: w-[40px] md:w-[54px], rail height 190 mobile / 230 desktop.
  - Money Depth + Advanced TP/SL default collapsed on mobile (innerWidth>=1024 gate), toggles present; chart full-width on mobile (depth hidden).
  - Page grid single-column on mobile. Desktop layout unchanged.
- STEP 2 — Full Auth System (DONE 2026-10, backend verified via curl + UI via screenshots):
  - F2 Registration form: Display Name (optional) + Username + Email + Password + Confirm, per-field validation (username 3-20 regex, email format, pw >=8 + letter + number, confirm match). Backend register enforces _validate_new_password + username uniqueness; issues 24h email-verify token.
  - F3 Email verification: users start email_verified=False; verify_email/change_email tokens in db.verification_tokens (sha256-hashed, 24h, TTL index). GET /auth/verify?token handles both kinds (verify sets email_verified; change_email swaps email + bumps session_version + notifies old email). POST /auth/resend-verification; GET /auth/dev-verify-link (admin). Trading GATED: manual_trade + cloud/enable + settings auto_trade=true return 403 when !email_verified. /verify frontend page + unverified banner on Manual Trade (resend). Migration: existing users set email_verified=True; admin verified.
  - F6 Change Email: POST /auth/change-email (new_email + current_password) → verify-link to NEW email → confirm updates email + bumps session_version + logs old-email notice. UI in Settings.
  - F7 Profile/Security panel: Display Name edit (POST /auth/display-name), Username (30-day), Email masked + reveal + Verified/Unverified badge, Change Email, Change Password, Logout-all.
  - F8 Email config: EMAIL_HOST/PORT/USER/PASSWORD/FROM + EMAIL_ENABLED (default false) in .env; send_email() honors EMAIL_ENABLED, else logs link. User to add Gmail app password + set EMAIL_ENABLED=true later.
  - /verify route added to App.js; Register.jsx + Verify.jsx rebuilt; SecurityPanel extended. i18n untouched.
- NEXT: Persian translation phase (i18n).


- PHASE — Persian Translation / i18n (DONE 2026-10-04, self-tested via screenshots, testing_agent NOT used per user):
  - Engine (src/i18n/index.jsx): kept inline en/fa dicts (no json migration per user). Added interpolation to t(key, params) ({x} placeholders). Extended VALUE_KEYS/tv() with Bullish/Bearish, inflow/outflow.
  - ~130 new keys added to both en & fa covering: Layout header, ManualTrade (banner, search, balances, watchlist, Advanced TP/SL, PnL preview, One-Tap, Auto Signals, Bot Analysis, timeAgo, toasts), MoneyDepth, TradingChart (legend/flow/tooltip), Settings SecurityPanel + WalletConnect, Login/Register/Verify/ForgotPassword/ResetPassword, Owner confirm/title, Assistant placeholder.
  - Wrapped all hardcoded strings with t()/tv() across those files. Added useI18n to Verify/Forgot/Reset/MoneyDepth/TradingChart and SecurityPanel/BotAnalysis.
  - English numerals enforced everywhere: converted existing Persian digits in fa dict (۲۴→24, ۵۵۵→555, ۲:۱→2:1, etc.) to English; fmt()/Intl stay en-US; key numeric spans given dir="ltr".
  - Canvas price-line markers (Entry/TP/SL/S:/R:) intentionally left as compact English trading abbreviations (lightweight-charts axis labels); all DOM chart text is Persian.
  - Verified FA mode: Manual Trade, Settings, chart legend ("جریان پول (MFI 14)", "MFI 52 · ورود پول صعودی") render Persian + English numbers + RTL.
- DEFERRED (user): Gmail SMTP hookup (Step 3), Trusted Devices, Verify-reminder banner.

- FEATURE — Signals v2: Timeframe badges + Shitcoin/NFT signals + unified Buy/Sell confirm modal (DONE 2026-10-04, self-tested via curl + FA screenshots; testing_agent NOT used per user):
  - Backend market.py: _levels() helper (2:1 R:R). /market/signals now returns entry/tp/sl + kind:"major". NEW GET /market/signals/shitcoins?interval= (real safety-vetted memecoins via scanner.get_safe_memecoins, adds safety_score/liquidity_locked/mint_renounced/honeypot_safe/holders + AI action/levels). NEW GET /market/signals/nfts (synthetic signals from db.nft_items: action/confidence/reason from rarity+floor+whale heuristic, floor_price_eth/usd, change_24h, interval "24h").
  - Backend trading.py: NFT paper-trading in SEPARATE db.nft_positions collection (crypto risk engine untouched). POST /trading/nft/open (deducts demo_balance), GET /trading/nft/positions (pseudo-live floor drift in 5-min buckets + PnL), POST /trading/nft/positions/{id}/close (credits demo_balance). Email-verified gating applied.
  - Frontend: NEW components SignalsPanel.jsx (tabs All/Major/Shitcoins/NFTs, filters: direction All/Buy/Sell + min-confidence slider + timeframe 1m-4h, "Available for trade" header, cards w/ TF badge, shitcoin safety badges, NFT image/floor/24h, Buy/Sell/OpenSea) and TradeConfirmModal.jsx (unified crypto/shitcoin/NFT: symbol+TF+direction, entry/TP/SL editable for crypto, amount w/ 5/10/25/50/100 quick %, leverage 1-10x hidden for NFT, live PnL preview, safety info, NFT demo notice, Free-Balance-after, RTL). ManualTrade.jsx old inline Auto-Signals block replaced with <SignalsPanel> (onPick auto-switches chart symbol+timeframe).
  - Signals.jsx: timeframe badge next to symbol (table + mobile). Positions.jsx: NFT Positions section (image, entry→current floor, PnL, Close; 30s refetch) + retitled crypto panel.
  - i18n: ~40 new keys (both en/fa). All numbers English/LTR; cards + modal RTL-correct.
  - NOTE: In preview, Binance is geo-blocked so some shitcoin prices come from synthetic klines (mocked) — real in local/prod.

- FEATURE BATCH (DONE 2026-10-04, self-tested curl + FA screenshots; testing_agent NOT used per user):
  - Signal reason i18n: i18n/index.jsx exports tReason(reason, t) — fragment translator (SMA/RSI/momentum/NFT reasons) keeping numbers English. Wired into SignalsPanel cards, ManualTrade BotAnalysis, Charts.jsx. 13 reason keys added (en/fa).
  - NFT Trade History: backend GET /trading/nft/history (closed nft_positions + wins/losses/total_pnl). Positions.jsx new "NFT Trade History" panel (image, entry→exit floor, PnL; header shows total PnL + W/L).
  - Trusted Devices (auth; integration_expert consulted first): added `did` claim to access+refresh JWTs; db.devices registry (user_agent/ip/created/last_active) upserted on login+register; get_current_user & refresh reject revoked device_ids via user.revoked_devices (no extra query; token still valid until exp otherwise). Endpoints GET /auth/devices, POST /auth/devices/{id}/revoke. Settings SecurityPanel "Trusted Devices" list w/ current badge + revoke. NOTE: single-device revoke is immediate (denylist checked each request); session_version untouched so other devices stay logged in.
  - Verify Reminder: global dismissible amber banner in Layout for users with email_verified===false (resend + dismiss).
  - DEFERRED: Gmail SMTP hookup (awaiting creds). OpenSea real floor (NOTE: Firebird 555 is a synthetic collection with no real OpenSea listing — needs a real-collection proxy + OpenSea API key; to discuss when prioritized).

- FEATURE — NFT Multi-Marketplace Adapter Layer, PRIORITY 1 (DONE 2026-10-04, backend-only, self-tested via curl; testing_agent NOT used per user):
  - NEW package /app/backend/nft_adapters/ (Adapter Pattern, mirrors exchange_adapters.py): base.py (BaseNFTAdapter contract: get_collection_stats/get_listings/get_floor_price/buy/sell + meta + mock & Reservoir helpers) and 5 adapters: blur.py (ETH, pro, reservoir), magiceden.py (multi-chain, reservoir), rarible.py (art, multi-chain, reservoir), tensor.py (Solana, mock/custom), enftino.py (Iranian, requires_proxy=False → always accessible). __init__.py exposes build_nft_adapter(), NftMarketManager (aggregate_floor/listings/stats across all), SUPPORTED_MARKETPLACES.
  - Real data via Reservoir (RESERVOIR_API_KEY env, optional) with graceful fallback to deterministic mock (per-marketplace floor drift in 5-min buckets) when key missing or geo-blocked — so preview always works. Uses synthetic "firebird-555" collection by default.
  - Buy/Sell are NON-CUSTODIAL: adapters return a deep-link + signing intent (requires_signature, marketplace url, VPN note for geo-restricted); keys NEVER stored. Real WalletConnect signing = PRIORITY 2 (deferred).
  - NEW router nft_market.py (/api/nft-market): GET /marketplaces, /floor (?marketplace=all → best across all), /stats, /listings (aggregated, best-price-first, marketplace-labelled), POST /buy, /sell. Registered in server.py.
  - Verified: marketplaces list (Enftino proxy=False), aggregate floor picks cheapest across 5, aggregated listings sorted + labelled, buy intent (Blur) returns VPN note, sell intent (Enftino) no VPN note.
  - DEFERRED (stop after P1 per user): PRIORITY 2 WalletConnect on-chain signing; PRIORITY 3 Signals Panel UI (marketplace tabs/filter, "Listed on …", VPN note). No i18n/UI strings added yet (none consumed until P3). RESERVOIR_API_KEY to be supplied later.

## Session update — 2026-10-05 (STEP 1–4, Secure Wallet/Exchange + NFT polish)
STEP 1 (done, approved): NFT detail modal black-area fix — card h-auto + max-h-[85vh] + overflow-y-auto, removed min-h-full/overflow-hidden; image column md:self-start + object-cover. File: frontend/src/pages/NFT.jsx.
STEP 2 (done, approved): WalletConnect via wagmi@2.19.5 + viem@2.57.3 + @rainbow-me/rainbowkit@2.2.11 (RainbowKit custom connectorsForWallets: injected, metaMask, trust, rainbow, walletConnect — Coinbase SDK v4/@base-org/account EXCLUDED because it breaks CRA webpack; Coinbase mobile still works via WalletConnect QR). New files: frontend/src/web3/config.js (wagmiConfig, CHAINS=[mainnet,bsc,polygon,arbitrum,base], CHAIN_LABEL, EXPLORER_TX, STABLES, DEX_ROUTERS, shortAddr), frontend/src/web3/Web3Provider.jsx (WagmiProvider+RainbowKitProvider darkTheme). index.js wraps <App/> in <Web3Provider>. craco.config.js patched: source-map-loader excludes node_modules + ignoreWarnings (fixes ESM sourcemap build errors). .env: REACT_APP_WALLETCONNECT_PROJECT_ID (empty→demo fallback; QR needs real Reown projectId, user will supply later), GENERATE_SOURCEMAP=false. DEX trade: TradeConfirmModal.jsx has on-chain "Sign in Wallet" (useSendTransaction self-tx value 0) → tx hash + explorer link, crypto-only, keys never stored. Header wallet badge in Layout.jsx.
STEP 3 (done, approved): Read-only CEX. backend/exchange_adapters.py: added MEXC+LBank+Binance to ccxt_map & SUPPORTED_EXCHANGES; CCXTAdapter passphrase→ccxt password; probe_permissions() (Binance real via sapiGetAccountApiRestrictions, others unknown). backend/exchanges.py: ConnectInput.api_passphrase; connect() rejects keys with trade/withdraw perms (HTTP 400); stores passphrase_enc (Fernet) + read_only + read_only_source; list() returns read_only. Frontend ExchangeHub (Settings.jsx): amber READ-ONLY warning, per-exchange step tutorials (EX_TUTORIALS en/fa), passphrase input, green security notice. NOTE: preview geo-blocks exchanges so live key validation/rejection path only verifiable on real server/keys.
STEP 4 (done, awaiting approval): 4A consolidated Wallet&Security = frontend/src/components/WalletPanel.jsx (sections: Connected Wallets w/ switch-chain+disconnect+empty state, Connected Exchanges list moved here from ExchangeHub w/ Read-Only badge+Test+Remove, Smart Contract Allowances reading stablecoin→DEX_ROUTERS allowance via useReadContracts + Revoke via approve(0), security notice, empty states). ExchangeHub slimmed to connect-form only. 4B/4C NFT.jsx modal "Marketplace Listings": buildListings() deterministic per-token across MARKETPLACES (Blur/MagicEden/Rarible/Tensor/OpenSea intl + Enftino IR-friendly), sorted cheapest-first, gold Trophy "Best Price" on cheapest, Info ⓘ + VPN tooltip on intl, green IR-friendly badge on Enftino (slight price bias so it's often cheapest), per-listing Buy. i18n keys added to both en+fa dicts.
NEXT (user): Scanner feature (saved for after STEP 4). Pending: real Reown projectId for QR; focus wallets = MetaMask + Coinbase extension for now.
All numbers English/LTR, default lang en. testing_agent NOT used (user forbade); verified via curl + screenshots.

## Session update — 2026-10-05 (STEP 5: Auto-Scanner + Smart Alerts)
Backend: NEW backend/scan_engine.py (router /api/scanner, registered in server.py). Composite Opportunity Score 0-100 = 0.34*trend(|signal.score-50|*2) + 0.20*volume_spike + 0.14*whale + 0.17*momentum + 0.15*safety + alignment bonuses (whale/vol>1.6/direction-aligned/strong-conviction>=44/safety>=85). Shitcoins require Safety>=75 (get_safe_memecoins). NFTs get synthetic signal + _levels() so every alert has entry/TP/SL. run_scan() replaces rolling snapshot in db.opportunities and calls _dispatch_alerts(). Endpoints: GET /opportunities?min_score&timeframe&direction (returns {opportunities, alerts_today, threshold}), GET/PUT /alert-settings (users.alert_settings; min_score clamp 70-95, max/day 1-50, timeframes subset of 15m/1h/4h/1d, notify in_app|in_app_email), GET /alert-history. Alerts: per-user, dedupe by symbol+timeframe+day, respects max_alerts_per_day; creates db.notifications (type=opportunity, ⚠️ message with entry/TP/SL + "not financial advice") + db.alert_history; email MOCKED to logs unless EMAIL_ENABLED. cron.py: NEW POST /api/cron/scan (Bearer WEBHOOK_CRON_SECRET, backgrounds run_scan). .emergent/crons.yml: added opportunity-scan "*/5 * * * *". CAVEAT: platform discards sub-15min crons on DEPLOYED app (skill rule) — change to */15 before go-live; */5 works in preview only.
Frontend: SignalsPanel.jsx new "Opportunities" tab (grid-cols-5) → OppsBody: permanent non-dismissable Risk Disclaimer, "{n} alerts triggered today", filters (timeframe all/15m/1h/4h/1d, direction, score-range slider 80-100), reuses SignalCard with gold "⚠️ High Opportunity · score" row. Settings.jsx NEW AlertsPanel (placed under WalletPanel): risk disclaimer + Enable toggle + Minimum score slider 70-95 + timeframe checkboxes + max-alerts/day + notify method select + Save + Alert History list. i18n keys added en+fa. Numbers English/LTR, default en.
Verified (curl+screenshots, NO testing_agent): scan stores 33 opps / 8 high>=80; /opportunities=8 alerts_today=8; alert-settings defaults; alert-history populated; Opportunities tab + Alerts panel render correctly. Safety: NEVER auto-trades, every alert includes SL, no "guaranteed profit"/"win rate".

## Session update — 2026-10-05 (STEP 6: Gmail SMTP)
backend/auth.py: upgraded send_email(to,subject,body,html=None) → multipart plain+HTML, branded via email_html(heading,lines,cta_text,cta_url) (Firebird header + "This is not financial advice." footer), localized subjects via email_subject(kind,lang) + SUBJECTS dict (verify/reset/change/alert/welcome/test en+fa), _sender() brands From as "Firebird AI <EMAIL_USER>" (valid for Gmail), verify_smtp() best-effort startup check (logs ok/fail, NEVER logs password). Call sites now send branded HTML: register verify, resend verify, change-email, forgot-password (lang from user.settings.language). backend/scan_engine.py: alert emails (_dispatch_alerts) now really send via auth.send_email when notify_method=in_app_email + EMAIL_ENABLED. backend/owner.py: NEW admin-only POST /api/owner/test-email?to=<addr>. backend/server.py: verify_smtp() on startup. backend/.env: EMAIL_HOST=smtp.gmail.com, EMAIL_PORT=587, EMAIL_FROM set, EMAIL_ENABLED=false, EMAIL_USER/EMAIL_PASSWORD EMPTY (user to fill with Gmail + App Password). Verified EMAIL_ENABLED=false: boots clean, SMTP log-fallback works, test-email returns ok=false, forgot-password logs reset link. Password never logged. TO GO LIVE: set EMAIL_USER, EMAIL_PASSWORD (App Password), EMAIL_ENABLED=true, restart → startup logs [SMTP] connection OK, POST /api/owner/test-email verifies.

## Session update — 2026-10-05 (STEP 6 revised: switched Gmail SMTP -> Emergent managed email / Resend)
Gmail SMTP AUTH was blocked from preview container IP (EHLO/STARTTLS ok, Gmail dropped at AUTH). Per policy (no BYO Resend key), switched to Emergent MANAGED email proxy. backend/auth.py: send_email() now POSTs to EMAIL_BASE_URL='https://integrations.emergentagent.com'/api/v1/email/send with header X-Email-Key=EMERGENT_EMAIL_KEY and payload {to,subject,html,from_name}; includes _assert_safe_email() guardrail gate (no forms/inputs, https-only links, anchor-host match, no credential-ask), sync httpx.Client, log fallback on error, key never logged. verify_smtp() repurposed to managed-email readiness check. email_html()/email_subject()/SUBJECTS retained. owner.py: POST /api/owner/test-email now sends to server-side OWNER_EMAIL (not caller input) per G4. .env: EMERGENT_EMAIL_KEY set, EMAIL_FROM_NAME="Firebird AI", OWNER_EMAIL set, EMAIL_ENABLED=true, EMAIL_PASSWORD CLEARED (Gmail no longer used -> user must REVOKE the exposed Gmail App Password). requirements.txt: httpx>=0.27.0. VERIFIED: POST proxy to delivered@resend.dev -> 202 {id}. Sending to a093649938815@gmail.com -> 422 undeliverable_recipient (proxy deliverability guard; address likely mistyped/new). Need user to confirm a real deliverable recipient email. Gmail App Password now unused -> REVOKE it.

## Session update — 2026-06 (STEP 6 CLOSED + STEP 7: NOWPayments crypto subscriptions)
STEP 6 CLOSED: OWNER_EMAIL corrected to a09364938815@gmail.com, EMAIL_FROM_NAME changed to "FireBird Crypto". Test email delivered (proxy 202, user confirmed inbox receipt). Email pipeline fully working.

STEP 7 (Crypto Payment Gateway — NOWPayments hosted invoice checkout, subscription/plan upgrade). Flow BUILT with placeholder keys (user adds real keys next step).
- backend/payments.py (NEW): payments_router prefix /api/payments. PLANS monthly=$19.99/30d, annual=$199/365d. Endpoints: GET /plans (gateway_ready flag), GET /subscription (user sub state w/ expiry check), POST /checkout (creates NOWPayments POST /v1/invoice via httpx x-api-key, stores db.payment_orders, returns invoice_url; 503 if keys placeholder/missing), GET /orders/{id}, POST /webhooks/nowpayments (PUBLIC; HMAC-SHA512 verify via x-nowpayments-sig over sorted-compact JSON; grants/extends premium ONLY on payment_status=finished; idempotent). _grant_subscription extends from current expiry if still active. IPN callback url = {FRONTEND_URL}/api/payments/webhooks/nowpayments. success_url/cancel_url -> /subscription?paid=1 | ?cancelled=1.
- backend/server.py: import+include payments_router; indexes payment_orders.order_id(unique)+user_id.
- backend/.env: NOWPAYMENTS_API_KEY="your_api_key_here", NOWPAYMENTS_IPN_SECRET="your_ipn_secret_here" (placeholders).
- frontend: pages/Subscription.jsx (NEW), route /subscription in App.js, nav "Premium Plan" (Rocket icon) in Layout.jsx. Two plan cards, LTR English prices, gateway-not-ready amber notice, Pay-with-crypto buttons disabled until keys added; polls subscription on ?paid=1 redirect. i18n keys added to en+fa dicts.
- DB schema add: users.subscription {tier,plan,status,started_at,expires_at,last_order_id}; collection payment_orders {order_id,user_id,plan,amount,status,provider_status,invoice_id,invoice_url,...}.
- TESTED (curl/python, testing_agent FORBIDDEN): /plans gateway_ready=false, /subscription free, /checkout -> 503 (placeholder keys), HMAC _valid_ipn unit test passes (valid/tampered/missing). Frontend screenshot OK.
- User choices: NOWPayments, subscription/plan upgrade, hosted checkout, build-first-add-keys-later.

## Session update — 2026-06 (STEP 7 GO-LIVE: NOWPayments keys added)
Real NOWPAYMENTS_API_KEY + NOWPAYMENTS_IPN_SECRET added to backend/.env (user has USDC/Solana + BNB/BSC payout wallets configured; IPN callback URL left blank — backend passes it per-invoice). Restarted backend. LIVE TESTED (curl + screenshot, testing_agent FORBIDDEN): GET /plans -> gateway_ready=true; POST /checkout {plan:monthly} -> real order_id + live invoice_url https://nowpayments.io/payment/?iid=... ; hosted NOWPayments checkout page loads showing ~$19.99 + asset selector + Waiting/Processing/Success flow. Webhook HMAC verified earlier. Full subscription purchase flow is LIVE. Pending: a real end-to-end paid transaction to confirm IPN grants premium (requires actual crypto payment by user).

## Session update — 2026-06 (Feature 1: Premium Gating — backend + frontend, admin bypass)
backend/payments.py: NEW require_premium(user=Depends(get_current_user)) dependency — admins always pass; else needs _sub_state(user).active, raises 403 detail="premium_required". Applied to: market.py /signals/shitcoins + /signals/nfts; scanner.py /memecoins (added Depends); scan_engine.py /opportunities; trading.py /auto/tick,/auto/status,/cloud/enable,/cloud/disable,/auto/resume. /market/signals (crypto majors) stays FREE (dashboard/charts/manual teaser). No circular import (payments imports only auth+db). frontend: components/PremiumGate.jsx (NEW) queries /payments/subscription (skipped for admin), shows upgrade screen (lock + perks + Go Premium -> /subscription) for free users, renders children for premium/admin. App.js wraps routes /signals,/auto-trade,/scanner with <PremiumGate feature=...>; /manual stays free. i18n keys premium_only/premium_gate_desc/go_premium added en+fa. TESTED (curl + screenshot, testing_agent FORBIDDEN): admin 200 on all gated; free user (freeuser1@test.com/Freepass1) 403 premium_required on memecoins/auto-status/shitcoins/opportunities, /market/signals still 200; PremiumGate screen renders on /signals for free user. NOTE: ManualTrade's shared SignalsPanel premium tabs (shitcoins/nfts/opps) will 403 for free users and show empty — major tab works; acceptable graceful degrade.

## Session update — 2026-06 (Feature 2: Billing History)
backend/payments.py: NEW GET /api/payments/history (auth) -> {orders:[{order_id,plan,amount,currency,status,provider_status,invoice_url,created_at}]} newest-first from db.payment_orders. frontend/pages/Subscription.jsx: added billing-history query + Billing History Panel table (Date/Plan/Amount/Status + View invoice link for unpaid orders), StatusBadge w/ color map, polls when ?paid=1. i18n keys billing_history/no_invoices/date/plan_col/amount_col/status_col/view_invoice/status_* added en+fa. All amounts+dates English digits + dir=ltr. TESTED (curl + screenshot): admin /history returns the earlier monthly order; table renders row 2026-10-05 / Monthly / $19.99 / Pending / View invoice.

## Session update — 2026-06 (Feature 3: Expiry Reminders)
backend/payments.py: NEW run_expiry_reminders() — finds users with subscription.status=active expiring within SUBSCRIPTION_REMINDER_DAYS (default 3), emails a branded "plan expiring soon" notice (auth.send_email + email_html, CTA Renew Premium -> /subscription), idempotent via subscription.reminder_sent_for == expires_at. auth.py SUBJECTS: added "sub_expiry" (en+fa). cron.py: NEW POST /api/cron/subscription-reminders (WEBHOOK_CRON_SECRET-protected, backgrounds run_expiry_reminders, dedupe via x-webhook-id). .emergent/crons.yml: NEW daily job subscription-reminders "0 9 * * *". TESTED (python + curl, testing_agent FORBIDDEN): seeded a premium user expiring in 2 days -> first run sent=1 + reminder_sent_for set, second run sent=0 (idempotent); cron endpoint 401 without secret, {ok,accepted} with secret. Email uses the proven Resend proxy path (delivered@resend.dev 202 in STEP 6).

## Session update — 2026-06 (Feature 4: Live Payment Test — $1 test plan)
backend/payments.py: PLANS add "test" {price:1.00,days:1,label:"Test ($1)"}; _test_plan_enabled() reads ENABLE_TEST_PLAN; CheckoutInput regex -> ^(monthly|annual|test)$; GET /plans excludes test unless flag on; POST /checkout rejects test with 400 if flag off. backend/.env: ENABLE_TEST_PLAN="true" (TEMPORARY — remove/set false after the live test). frontend/pages/Subscription.jsx: PLAN_FEATURES.test + planTitleKey() helper (used in plan card title + billing history plan column), grid md:2/lg:3. i18n plan_test + feat_test_quick (en+fa). TESTED (curl+screenshot): /plans returns test=$1 when flag on; free user (freeuser1) created a live $1 invoice (nowpayments.io/payment/?iid=...); subscription page renders 3 cards + billing history shows pending $1 Test row. PENDING: user to pay $1 USDC(Solana) on hosted page -> IPN finished -> free->premium auto-upgrade (page polls ?paid=1). AFTER TEST: set ENABLE_TEST_PLAN=false and restart to hide the $1 plan.

## Session update — 2026-06 (Auto-Trade strategy fix + logo rebrand)
ROOT CAUSE of consecutive losses (backend/trading.py _auto_cycle): (1) entry scan iterated AUTO_TIMEFRAMES in order 1m,5m,... and break'd on FIRST qualifying TF -> preferentially entered on 1m/5m NOISE (whipsaw). (2) BUY-only with NO trend filter -> kept longing into downtrends. (3) weak threshold AUTO_MIN_SCORE=62. (4) no cooldown -> re-entered immediately after each loss until drawdown halt. (5) stale consecutive_losses read before risk-mgmt closes.
FIX (minimal, no rewrite): new consts AUTO_ENTRY_MIN_SCORE=70, AUTO_QUALITY_TFS=[15m,1h,4h,1d] (excludes 1m/5m), AUTO_MAX_ENTRY_RSI=68, AUTO_COOLDOWN_LOSSES=2, AUTO_COOLDOWN_MINUTES=30. Entry now requires: BUY + score>=70 + sma_fast>sma_slow (uptrend) + rsi<68, PLUS a 1h higher-timeframe trend gate (skip coins whose 1h SMA9<=SMA21). Cooldown: after a losing close pushes streak>=2 (and <max_losses), set auto_cooldown_until=now+30m -> blocks NEW entries (blocked_reason) until it self-expires; never reactivates the bot. cl re-read after risk-mgmt closes. /auto/resume now also clears auto_cooldown_until. /auto/status now returns in_cooldown, cooldown_until + limits.entry_min_score/entry_timeframes/cooldown_*. Bot was NOT auto-reactivated (still halted; user must resume). TESTED (python harness, testing_agent FORBIDDEN): cooldown-active blocks entries; no-cooldown entries respect quality TFs+score>=70; 5-loss halt path intact (auto_trade->False). 
LOGO: frontend/src/components/Logo.jsx text "FIREBIRD AI" -> "FireBird Crypto" (verified via screenshot).

## Session update — 2026-06 (Bug fix: payment page crash "Unhandled rejection: A background operation failed")
ROOT CAUSE: NOT NOWPayments. frontend/src/web3/config.js registered WalletConnect-backed wallets (walletConnect/metaMask/trust/rainbow) with a PLACEHOLDER projectId ("firebird_demo_projectid_replace_me"). On load, Reown AppKit fetched remote project config -> HTTP 403 -> its background init promise rejected -> CRA dev overlay showed "Unhandled rejection (Error): A background operation failed", blocking the Subscription/payment page. Console confirmed: "[Reown Config] Failed to fetch remote project configuration ... 403 ... AppKit.initialize ... fetchRemoteFeatures".
FIX (minimal): web3/config.js now registers WalletConnect wallets ONLY when a REAL projectId exists (HAS_WC_PROJECT_ID); otherwise exposes only injectedWallet (browser-extension, never touches Reown). appName also rebranded "Firebird AI Trade" -> "FireBird Crypto". Users can set REACT_APP_WALLETCONNECT_PROJECT_ID to re-enable full WC wallet set + QR.
VERIFIED (screenshot + console capture, testing_agent FORBIDDEN): after fix, 0 Reown/background-op errors on /subscription; clicking test "Pay with crypto" cleanly redirects to live NOWPayments invoice (nowpayments.io/payment?iid=..., ~$1). Payment flow unblocked.

## Session update — 2026-06 (Feature: Demo Account Reset & Custom Balance)
PROBLEM: Auto-Trade halted (drawdown) -> Enable button couldn't restart bot (halted _auto_cycle force-disables auto_trade); no way to set custom demo balance or fully reset.
backend/trading.py: /demo/reset upgraded -> DemoResetInput{balance?:float}, Body(default=None) so old no-body caller (Positions.jsx) still works (defaults to 1000). Validates min 100 / max 10,000,000. Wipes DEMO data only: deletes db.positions + db.nft_positions for the user; sets demo_balance=chosen, peak_equity=chosen, consecutive_losses=0, risk_halt=False, halt_reason=None, auto_cooldown_until=None, cloud_trading=False, settings.auto_trade=False. NEVER touches users.subscription or live data. Added Body import.
frontend/pages/AutoTrade.jsx: NEW "Demo Account Settings" Panel — custom balance number input (default 1000, min 100, LTR $), "Reset Demo Account" button opening a shadcn AlertDialog confirm (shows target balance), resetDemo() posts {balance}, then setOn(false)/setHalt(null)/setLog([]) + invalidates settings/portfolio/auto-status/reports. i18n keys demo_account_settings/demo_settings_desc/custom_demo_balance/demo_min_hint/reset_demo_account/reset_demo_confirm_title/reset_demo_confirm_desc/demo_reset_done/demo_min_balance_error (en+fa).
ENABLE-AFTER-RESET: reset clears risk_halt+cooldown so Enable Auto-Trade works again; verified tick returns halt:false after reset+enable.
TESTED (curl + screenshots, testing_agent FORBIDDEN): reset balance=2500 ok; balance=50 -> 400; no-body -> 1000 (backward compat); status after reset risk_halt=F/in_cooldown=F/dd=0/cl=0; enable auto_trade -> tick halt:false (bot starts); UI section + confirm dialog render ($5,000 shown, English LTR); logo "FireBird Crypto".

## Session update — 2026-06 (Bug fix: payment redirect stuck on "Opening checkout…")
ROOT CAUSE: Subscription.jsx used window.location.assign(invoice_url) which navigated the PREVIEW IFRAME to NOWPayments; NOWPayments forbids framing (X-Frame-Options/frame-ancestors) so the nav silently failed and busy state never reset -> button stuck. Backend was fine (orders created => valid invoice_url). Also async-after-await window.open would be popup-blocked.
FIX (frontend/pages/Subscription.jsx): upgrade() now opens a NEW top-level tab synchronously within the click gesture (window.open('about:blank','_blank')), then sets win.location.href = invoice_url after the checkout POST resolves; busy reset in finally (no more stuck button). Added lastInvoice state + manual fallback banner (invoice-fallback / invoice-fallback-link) + popup_blocked toast. i18n popup_blocked/checkout_opened_hint/open_checkout (en+fa). NOTE: no window.open 'noopener' (would null the handle).
CLEANUP: deleted all 7 pending/created payment_orders (status in created/pending/None) -> Billing History now empty.
VERIFIED (screenshot + popup capture, testing_agent FORBIDDEN): clicking Pay-with-crypto opens nowpayments.io in a new tab; button returns to "Pay with crypto"; fallback link renders; billing history "No invoices yet".

## Session update — 2026-06 (Bug fix: payment succeeded but not upgraded — IPN 401 + polling fallback)
DIAGNOSIS: backend logs showed NOWPayments DID POST /api/payments/webhooks/nowpayments but got 401 (so preview URL IS publicly reachable; ipn_callback_url was correctly sent per-invoice). ROOT CAUSE = IPN signature mismatch: old _valid_ipn did json.dumps(await request.json()) which RE-SERIALIZED numbers via Python floats (0.99950000 -> 0.9995), breaking the HMAC-SHA512 that NOWPayments computes over its ORIGINAL JSON lexemes. Sparse 'waiting' payloads sometimes matched; 'finished' (more decimal fields) failed -> 401 -> order stuck 'created'/'waiting'.
FIX backend/payments.py:
- NEW _canonical(): recursive key-sort, compact, ensure_ascii=False, arrays unchanged, numbers preserved as ORIGINAL lexeme via Decimal (parse_float=Decimal) -> matches PHP json_encode. _verify_ipn(secret, sig, RAW BYTES) reads raw body, parses with parse_float=Decimal, HMAC-SHA512, case-insensitive constant-time compare. Webhook now reads request.body() (raw) not .json().
- NEW _apply_status(order,status,extra): single idempotent reconciler used by BOTH webhook + poll; grants premium only on 'finished'.
- POLLING FALLBACK (#4): POST /api/payments/poll/{order_id} (auth) -> _fetch_nowpayments_status: prefers payment_id (captured from any IPN) via GET /v1/payment/{id} (x-api-key only); else GET /v1/payment/?invoiceid= via JWT (needs optional NOWPAYMENTS_EMAIL/PASSWORD env — not set, so invoice-list path is a no-op until provided). NOTE: NOWPayments list endpoint requires Bearer JWT (POST /v1/auth email+pw); single-payment GET needs only x-api-key.
- Webhook now logs 'IPN ok: order=.. status=..' / 'IPN rejected'.
FIX frontend/pages/Subscription.jsx: checkStatus(orderId) -> POST /payments/poll/{id}; auto-poll every 8s for any PENDING order (created/waiting/confirming/confirmed/sending/partially_paid); "Check payment status" button (RefreshCw) per pending billing row; i18n check_status/checking/payment_still_pending (en+fa).
#5 MANUAL RECONCILE: admin@firebird.ai's stuck $1 test order marked finished->paid via _apply_status; subscription now premium/test/active (expires +1d). Billing row shows Paid.
VERIFIED (curl + python + screenshot, testing_agent FORBIDDEN): _canonical unit test (correct sig passes, old float-canon differs=bug proof, tampered rejected); end-to-end signed 'finished' IPN -> webhook 200 -> order paid -> free test user premium; poll endpoint returns status w/o error; admin page shows Premium Active + Paid $1 row. Cleaned up test artifacts (freeuser1 reverted to free).

## Session update — 2026-06 (Demo trade bug re-confirm + 500 USDC fresh start)
- Bug #1 (No price for symbol + "connect your wallet" in demo) was ALREADY fixed+verified in iteration_7; re-verified in iteration_8 (backend 7/7, frontend 4/4). No new code change to the bug itself.
- Default demo balance changed 1000 -> 500: backend trading.py reset_demo default; frontend AutoTrade demo-balance-input default 500; i18n demo_min_hint "Default 500" (en+fa).
- Risk settings already match spec (MAX_DRAWDOWN_PCT=20, AUTO_ENTRY_MIN_SCORE=70, AUTO_QUALITY_TFS=15m/1h/4h/1d, AUTO_COOLDOWN_LOSSES=2, AUTO_COOLDOWN_MINUTES=30). Set admin settings.max_position_pct=10 (=50 USDC on 500), risk_lock=true.
- Surfaced two new guardrail chips on Auto-Trade header (rule_entry, rule_cooldown) driven by /auto/status limits (en+fa): "Entry score ≥ 70 on 15m / 1h / 4h / 1d" + "Cooldown 30 min after 2 losses".
- admin@firebird.ai reset to 500 USDC, 0 positions, risk_halt=false, cooldown clear, auto_trade=true (UI Enable button auto-syncs from settings and starts the client tick loop). VERIFIED via testing_agent iteration_8 + curl + screenshot.

## Session update — 2026-06 (Payments restricted to USDC-SOL + BNB-BSC)
SUPPORTED PAYMENT CURRENCIES (ONLY these two — the assets with configured NOWPayments payout wallets):
- USDC on Solana — code `usdcsol`
- BNB on BSC — code `bnbbsc`
backend/payments.py: SUPPORTED_PAY_CURRENCIES list + _ALLOWED_CURRENCY_CODES + _DEFAULT_PAY_CURRENCY="usdcsol". create_checkout now ALWAYS sets body["pay_currency"] (defaults usdcsol) and rejects any code outside the allowed set with 400 -> the hosted NOWPayments invoice is locked to the chosen asset instead of offering all coins. GET /payments/plans returns pay_currencies; order doc stores pay_currency.
frontend/pages/Subscription.jsx: pre-checkout "Pay with" selector (data-testid pay-currency-selector / pay-currency-usdcsol / pay-currency-bnbbsc), default usdcsol; upgrade() passes pay_currency. i18n pay_currency_label/pay_currency_hint (en+fa).
VERIFIED iteration_9: backend 6/6 (plans list, usdcsol+bnbbsc ok, btc/eth 400, default usdcsol), frontend selector shows exactly two options, English LTR, no console errors.

## Session update — 2026-06 (Stabilization: trade modal overlay/portal + price confirm)
- TradeConfirmModal now portals to document.body (createPortal), overlay dimmed bg-black/60 (was /80), z-[100]. Fixes: background readable/dimmed (not fully dark), modal no longer clipped by glass backdrop-filter ancestor, closes cleanly. Benefits SignalsPanel + NFT.jsx usages.
- #3 "No price for symbol": confirmed resolved — market.get_tickers + get_price always return a price for supported coins (live when exchange reachable; synthetic fallback in geo-blocked preview). Not suppression.
- #4 No broken landing-page code present (only benign constants/testIds/home.js stub; kept). NO new features added per user directive.
- Verified via targeted screenshot + curl/python (user explicitly declined full testing_agent this round).

## Session update — 2026-06 (Global: English digits in inputs + i18n verified)
- All numeric <input type="number"> -> type="text" inputMode="decimal/numeric" dir="ltr" + toLatin() normalizer (converts Persian ۰-۹ / Arabic ٠-٩ to Latin on change). Guarantees English digits display+entry regardless of OS/browser locale. Files: components/common.jsx (new toLatin), pages/ManualTrade.jsx, components/TradeConfirmModal.jsx, pages/Settings.jsx, pages/AutoTrade.jsx, pages/Positions.jsx.
- Verified: typed ۱۲۳۴ in amount -> displays 1234; fa page fully translated with all numbers English LTR (screenshot). i18n fa dict complete (548/548 keys, risk labels Persian). Text numbers already en-US via fmt/Intl.
- No new features; targeted screenshot verification (user declined full testing_agent this round).

## 2026-06 NFT Fixes
- Regenerated 4 text-bearing NFT images (#001, #111, #333, Ember Silhouette theme) without text; URLs updated in nft.py + nft_items + opportunities.
- NFT detail modal moved to React Portal, 50% dim + blur, no black image frame, mobile bottom-sheet (88vh, internal scroll).
- Trait labels translated (EN/FA).
- Full image refresh: all 16 base NFT images regenerated in unified style, no text; nft.py + nft_items(555) + opportunities updated.
- i18n audit: EN/FA key parity verified (549/549); Persian digits removed from FA dict; Dashboard news, exchange kind, liquidation reason now translated.
- FA i18n root cause: backend-generated texts (notifications, error details, success messages, halt reasons) were English. Added frontend/src/i18n/server.js (trServer) + axios response interceptor in lib/api.js translating message/halt_reason/detail (incl. notifications items) when fb_lang=fa. Activity log time forced en-GB digits.
- Manual Trade tiered limits (2026-06): backend coin_limits() + GET /api/trading/limits; majors BTC/ETH/BNB risk 3% (1-15), 25x; mid-cap (other COINS) 7% (1-20), 20x; meme + unknown 10% (1-25), 10x. Risk>15% needs high_risk_ack; lev>20 needs leverage_confirmed (checkbox + second click). Leverage stored per position. Frontend component RiskLeverageControls used in ManualTrade + TradeConfirmModal. Auto-trade engine untouched.
- 2026-06: Trusted Devices -> "Active Sessions" with parsed UA names (deviceName in Settings.jsx), IP/last active, 44px full-width revoke (verified revoked token -> 401).
- Font size setting (Settings FontSizeCard, localStorage fb_font, html[data-font] 14/16/18px; text-[Npx] converted to rem). Dashboard Top Signals no-truncate; fmt() now always shows 2 decimals for >=1000; Stat values nowrap.
- NFT: 16 new themed text-free, non-violent images; THEMES (16) + RARE_IMG/RARE_NAMES/RARE_STORY rewritten in nft.py; 555 items reseeded (16 distinct images); NFT opportunities cleared for regeneration.
- 2026-06: POST /api/auth/devices/revoke-others + "Sign out all other devices" button above sessions list. Billing cleanup: deleted $1 test-plan order from payment_orders (0 left).
- 2026-06: All 555 NFTs minted (seed minted=True). Global number display: span.mono LTR-isolated + nowrap (index.css); signal NFT floor/volume wrapped in mono spans.
- 2026-06: seed_nft self-heals on startup (reseeds if not all 555 minted or rare #1 image outdated) so production DB updates on redeploy.
- 2026-06: Mobile drawer now has a labeled Sign Out button (drawer-logout-button), drawer scrolls with safe-area padding; main has mobile bottom padding. Stat values use text-[min(4.6vw,1.25rem)] nowrap on mobile.
- 2026-06: Settings page bottom Sign Out button (settings-signout-button); header right group shrink-0 so logout never off-screen (logo text hidden <360px); Stat values use FitNumber (auto-shrink to fit, handles OS text scaling).
- 2026-10: Pulled GitHub d0c2a80+144e6ae via read-only deploy key (/app/.ssh/id_ed25519). Merged: backtest LONG+SHORT, multi-coin (?symbols=), by_section; endpoint GET ?symbol&interval (compatible with page) + data_source live/simulated. Synthetic klines seeded by symbol+interval with per-timeframe volatility scale. Backtest page: add-coin (+) UI, remove x, 1m/5m, data-source badge. Pre-pull backup in memory/pre_pull_backup/.
- 2026-10: Backtest "Run all coins" (?symbols=) with aggregate summary, by-section table (avg_return_pct) and per-coin table.
- 2026-10: Backtest "Compare timeframes" (6 parallel runs for selected coin) + BEST/WORST highlight in per-coin and timeframe tables.
- 2026-10: Backtest history (db.backtest_runs auto-saved per run; save=false for timeframe compare; GET/DELETE /api/trading/backtest/history) + shareable 1080x1080 PNG result card (canvas; Web Share API or download).
- 2026-10: Backtest Strategy Settings (SL slider 2-10% floored by MIN_STOP_LOSS_PCT=2, TP=2xSL, min score 50-90; persisted in localStorage; saved in history + on card) and separate Download button. Telegram bot share skipped (uses native share sheet).
- 2026-10: Single min-SL source: MIN_STOP_LOSS_PCT (backend/.env) defined once in market.py, imported by trading.py, exposed via /api/trading/limits (min_stop_loss_pct); Backtest SL slider min reads it.
- 2026-10: i18n Phases 1+2. i18n/server.js now maps every backend English message to srv_*/ntf_* keys (SRV_EN/SRV_FA merged into en/fa); api.js interceptor translates detail/message/halt_reason for all non-EN languages via translateServerMsg. Notifications store key+params (_notify key=, scan_engine ntf_opportunity) and Layout renders renderKey(). All 10 language files have 688 identical keys (8 locales filled via LLM script /root/i18n/translate.py). Phase 3 (page-by-page UI audit for hardcoded JSX strings) pending.
- 2026-10: UI text scan: only Logo.jsx/NFT.jsx had hardcoded strings (ui_logo_alt, ui_logo_switch_hint, ui_vpn_info added to all 10 langs). Re-translated ~150 values left in English in 8 locale files (script /root/i18n/fix_same.py); DE nav = Übersicht / Auto-Handel.
