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
