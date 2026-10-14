
## Payment page crash — "Unhandled rejection: A background operation failed" (2026-06)
- Symptom: app shows CRA overlay crash when opening payment page / clicking pay.
- CAUSE: wagmi/RainbowKit WalletConnect wallets + placeholder Reown projectId -> AppKit remote-config fetch 403 -> unhandled promise rejection.
- FIX: only register WalletConnect-backed wallets when a real REACT_APP_WALLETCONNECT_PROJECT_ID is set; else injectedWallet only. File: frontend/src/web3/config.js (walletList ternary gated by HAS_WC_PROJECT_ID).
- Lesson: never ship WalletConnect/Reown with a fake projectId; it rejects in the background and crashes CRA dev overlay even on unrelated pages.

## NOWPayments IPN returns 401 (payment succeeded but not upgraded) (2026-06)
- Webhook WAS reachable (preview URL public) but every real IPN -> 401 signature mismatch.
- CAUSE: verifying over json.dumps(await request.json()) re-serializes crypto amounts via Python floats (0.99950000 -> 0.9995), so HMAC != NOWPayments' hash of its original JSON lexemes.
- FIX: verify over RAW body; parse with json.loads(raw, parse_float=Decimal); canonical = recursive key-sort + compact + ensure_ascii=False + numbers as original Decimal lexeme (format 'f'); HMAC-SHA512; case-insensitive compare. File: backend/payments.py _canonical/_verify_ipn.
- NOWPayments read APIs: GET /v1/payment/{id} needs only x-api-key; GET /v1/payment/ (list, by invoiceid) needs Bearer JWT from POST /v1/auth (account email+password). Invoice create only returns invoice id (not payment_id) -> capture payment_id from IPN to enable single-payment polling.
- Always add a server-side polling fallback that reconciles via _apply_status (shared with webhook, idempotent).

## Trade modal "background goes completely dark" + layout break (2026-06)
- CAUSE: TradeConfirmModal used position:fixed but was rendered INSIDE a `glass` panel using backdrop-filter. A backdrop-filter/transform/filter ancestor becomes the containing block for fixed children -> modal clipped, overlay mis-dimmed (looked fully dark), layout broke.
- FIX: render modal via createPortal(document.body); overlay bg-black/80 -> bg-black/60; z-50 -> z-[100]. File: frontend/src/components/TradeConfirmModal.jsx.
- Lesson: always portal full-screen modals to body; never rely on position:fixed inside a backdrop-filter/transform ancestor.

## Persian digits in number inputs + translation (2026-06)
- Plain-text numbers were ALREADY English (fmt/common.jsx + i18n fmtNum use Intl 'en-US'); fa dict was complete (0 missing keys) and labels translated.
- REAL bug: <input type="number"> renders digits using the BROWSER/OS locale, so a Persian-locale user saw ۱۲۳. Element lang doesn't reliably override in Chrome.
- FIX: converted all numeric inputs to type="text" inputMode="decimal"/"numeric" dir="ltr" + toLatin() normalizer (common.jsx) in onChange, so display is the raw ASCII state and any Persian/Arabic digits typed are converted to 0-9. Files: common.jsx (toLatin), ManualTrade.jsx (amount/entry/tp/sl), TradeConfirmModal.jsx (amount/tp/sl), Settings.jsx (risk num() + alerts cap), AutoTrade.jsx (demo balance), Positions.jsx (withdraw).
- Lesson: never use <input type=number> when digits must stay Latin across locales; use type=text + inputMode + explicit digit normalization.
