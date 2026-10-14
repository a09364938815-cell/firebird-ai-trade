// Backend messages -> translation keys (srv_* / ntf_*). English text is the canonical backend output.
// Each entry: [english backend text, key, persian]. Other languages live in locales/*.js.
const SRV = [
  ["Something went wrong. Please try again.", "srv_general_unknown", "مشکلی پیش آمد. لطفاً دوباره تلاش کنید."],
  ["Network error. Please check your connection.", "srv_general_network", "خطای شبکه. اتصال اینترنت خود را بررسی کنید."],
  ["Request timed out. Please try again.", "srv_general_timeout", "زمان درخواست تمام شد. دوباره تلاش کنید."],
  ["Not found", "srv_general_not_found", "پیدا نشد"],
  ["Invalid id", "srv_general_invalid_id", "شناسه نامعتبر است"],
  ["Invalid JSON", "srv_general_invalid_json", "داده نامعتبر است"],
  ["Admin only", "srv_auth_admin_only", "فقط مدیر"],
  ["Owner access only", "srv_auth_owner_only", "فقط دسترسی مالک"],
  ["Unauthorized", "srv_auth_unauthorized", "دسترسی غیرمجاز"],
  ["Not authenticated", "srv_auth_not_authenticated", "وارد حساب نشده‌اید"],
  ["Invalid token", "srv_auth_invalid_token", "توکن نامعتبر است"],
  ["Invalid token type", "srv_auth_invalid_token", "توکن نامعتبر است"],
  ["Invalid refresh token", "srv_auth_invalid_token", "توکن نامعتبر است"],
  ["No refresh token", "srv_auth_session_expired", "نشست منقضی شد، لطفاً دوباره وارد شوید"],
  ["Token expired", "srv_auth_token_expired", "توکن منقضی شده است"],
  ["Token not found", "srv_auth_invalid_token", "توکن نامعتبر است"],
  ["Session expired, please sign in again", "srv_auth_session_expired", "نشست منقضی شد، لطفاً دوباره وارد شوید"],
  ["This device has been signed out", "srv_auth_device_signed_out", "این دستگاه از حساب خارج شده است"],
  ["Invalid username/email or password", "srv_auth_invalid_login", "نام کاربری/ایمیل یا رمز عبور نادرست است"],
  ["Invalid email or password", "srv_auth_invalid_login", "نام کاربری/ایمیل یا رمز عبور نادرست است"],
  ["Current password is incorrect", "srv_auth_wrong_password", "رمز عبور فعلی نادرست است"],
  ["Email already registered", "srv_auth_email_already_exists", "این ایمیل قبلاً ثبت شده است"],
  ["That email is already in use", "srv_auth_email_already_exists", "این ایمیل قبلاً ثبت شده است"],
  ["That email is now in use by another account", "srv_auth_email_taken_other", "این ایمیل اکنون توسط حساب دیگری استفاده می‌شود"],
  ["That is already your email", "srv_auth_same_email", "این همین ایمیل فعلی شماست"],
  ["That is already your username", "srv_auth_same_username", "این همین نام کاربری فعلی شماست"],
  ["Username already taken", "srv_auth_username_taken", "این نام کاربری قبلاً گرفته شده است"],
  ["Username must be 3-20 letters, numbers or underscore", "srv_auth_username_invalid", "نام کاربری باید 3 تا 20 حرف، عدد یا _ باشد"],
  ["User not found", "srv_auth_user_not_found", "کاربر پیدا نشد"],
  ["No such account", "srv_auth_user_not_found", "کاربر پیدا نشد"],
  ["Passwords do not match", "srv_auth_password_mismatch", "رمزهای عبور یکسان نیستند"],
  ["New password and confirmation do not match", "srv_auth_password_mismatch", "رمزهای عبور یکسان نیستند"],
  ["New password must be at least 8 characters and include a letter and a number", "srv_auth_password_weak", "رمز جدید باید حداقل 8 کاراکتر و شامل حرف و عدد باشد"],
  ["New password must be different from the current password", "srv_auth_password_same", "رمز جدید باید با رمز فعلی متفاوت باشد"],
  ["Too many attempts. Try again later.", "srv_auth_rate_limited", "تلاش‌های زیاد. بعداً دوباره امتحان کنید."],
  ["Too many reset requests. Please try again later.", "srv_auth_rate_limited", "تلاش‌های زیاد. بعداً دوباره امتحان کنید."],
  ["Too many sign-ups from this network. Try later.", "srv_auth_signup_rate_limited", "ثبت‌نام‌های زیاد از این شبکه. بعداً امتحان کنید."],
  ["Invalid or already-used verification link", "srv_auth_verify_link_invalid", "لینک تأیید نامعتبر است یا قبلاً استفاده شده"],
  ["Verification link expired. Please request a new one.", "srv_auth_verify_link_expired", "لینک تأیید منقضی شده است. لینک جدید درخواست کنید."],
  ["No active verification token", "srv_auth_verify_link_invalid", "لینک تأیید نامعتبر است یا قبلاً استفاده شده"],
  ["Email already verified.", "srv_auth_email_already_verified", "ایمیل قبلاً تأیید شده است."],
  ["Verification email sent.", "srv_auth_verification_sent", "ایمیل تأیید ارسال شد."],
  ["Verification link sent to the new email. Confirm it to complete the change.", "srv_auth_email_change_sent", "لینک تأیید به ایمیل جدید ارسال شد. برای تکمیل تغییر آن را تأیید کنید."],
  ["Invalid or expired reset link", "srv_auth_reset_link_invalid", "لینک بازیابی نامعتبر یا منقضی شده است"],
  ["Reset link has expired", "srv_auth_reset_link_invalid", "لینک بازیابی نامعتبر یا منقضی شده است"],
  ["No active reset token — call /forgot-password first", "srv_auth_reset_link_invalid", "لینک بازیابی نامعتبر یا منقضی شده است"],
  ["If the account exists, a reset link has been sent.", "srv_auth_reset_sent", "اگر حساب وجود داشته باشد، لینک بازیابی ارسال شده است."],
  ["Password updated. Please sign in with your new password.", "srv_auth_password_updated", "رمز عبور به‌روز شد. با رمز جدید وارد شوید."],
  ["Password changed. Please sign in again on your other devices.", "srv_auth_password_changed", "رمز عبور تغییر کرد. در دستگاه‌های دیگر دوباره وارد شوید."],
  ["Signed out from all devices", "srv_auth_signed_out_all", "از همه دستگاه‌ها خارج شدید"],
  ["Signed out from all other devices", "srv_auth_signed_out_others", "از همه دستگاه‌های دیگر خارج شدید"],
  ["Device signed out", "srv_auth_device_revoked", "دستگاه از حساب خارج شد"],
  ["premium_required", "srv_subscription_required", "این بخش برای اعضای پریمیوم است"],
  ["Test plan is not available.", "srv_subscription_plan_unavailable", "این پلن در دسترس نیست."],
  ["Order not found", "srv_subscription_order_not_found", "سفارش پیدا نشد"],
  ["Could not reach the payment provider. Try again.", "srv_payment_provider_unreachable", "اتصال به درگاه پرداخت ممکن نشد. دوباره تلاش کنید."],
  ["Payment provider could not create the invoice. Try again.", "srv_payment_invoice_failed", "درگاه پرداخت نتوانست فاکتور بسازد. دوباره تلاش کنید."],
  ["Crypto payment gateway is not configured yet. Please add NOWPayments API keys.", "srv_payment_not_configured", "درگاه پرداخت کریپتو هنوز پیکربندی نشده است."],
  ["IPN secret not configured", "srv_payment_not_configured", "درگاه پرداخت کریپتو هنوز پیکربندی نشده است."],
  ["Invalid signature", "srv_payment_invalid_signature", "امضای پرداخت نامعتبر است"],
  ["Connection not found", "srv_exchange_connection_not_found", "اتصال پیدا نشد"],
  ["Unsupported exchange", "srv_exchange_unsupported", "صرافی پشتیبانی نمی‌شود"],
  ["Exchange unreachable from server", "srv_exchange_unreachable", "صرافی از سرور در دسترس نیست"],
  ["This API key has trade/withdraw permissions. Create a READ-ONLY key (disable Trade and Withdraw).", "srv_exchange_key_not_readonly", "این کلید API دسترسی معامله/برداشت دارد. یک کلید فقط‌خواندنی (READ-ONLY) بسازید."],
  ["Verify the connection before enabling live trading", "srv_exchange_verify_first", "قبل از فعال‌سازی ترید واقعی، اتصال را تأیید کنید"],
  ["Amount exceeds your free balance", "srv_insufficient_balance", "مبلغ بیشتر از موجودی آزاد شماست"],
  ["Insufficient demo balance", "srv_insufficient_balance", "مبلغ بیشتر از موجودی آزاد شماست"],
  ["Amount must be greater than 0", "srv_trade_amount_positive", "مبلغ باید بیشتر از 0 باشد"],
  ["Amount must be positive", "srv_trade_amount_positive", "مبلغ باید بیشتر از 0 باشد"],
  ["Invalid withdrawal amount", "srv_trade_invalid_withdrawal", "مبلغ برداشت نامعتبر است"],
  ["Bot requires both Stop Loss and Take Profit", "srv_trade_bot_needs_tp_sl", "ربات به حد ضرر و حد سود نیاز دارد"],
  ["No open position to sell", "srv_trade_no_position", "پوزیشن بازی برای فروش وجود ندارد"],
  ["Position not found", "srv_trade_position_not_found", "پوزیشن پیدا نشد"],
  ["Symbol is required", "srv_trade_symbol_required", "نماد الزامی است"],
  ["Invalid symbol", "srv_trade_invalid_symbol", "نماد نامعتبر است"],
  ["Invalid interval", "srv_trade_invalid_interval", "بازه زمانی نامعتبر است"],
  ["Please verify your email before opening trades.", "srv_trade_verify_email", "لطفاً قبل از باز کردن معامله ایمیل خود را تأیید کنید."],
  ["Please verify your email before enabling auto-trade.", "srv_trade_verify_email_auto", "لطفاً قبل از فعال‌سازی ترید خودکار ایمیل خود را تأیید کنید."],
  ["Minimum demo balance is 100", "srv_trade_demo_min", "حداقل موجودی دمو 100 است"],
  ["Demo balance is too large (max 10,000,000)", "srv_trade_demo_max", "موجودی دمو بیش از حد مجاز است (حداکثر 10,000,000)"],
  ["Leverage above 20x requires double confirmation", "srv_trade_leverage_confirm", "اهرم بالای 20x نیاز به تأیید دوباره دارد"],
  ["Risk above 15% requires High Risk confirmation", "srv_trade_high_risk_confirm", "ریسک بالای 15% نیاز به تأیید معامله پرریسک دارد"],
  ["High liquidation risk", "srv_trade_high_liquidation_risk", "ریسک بالای لیکویید شدن"],
  ["No fee (held 7+ days).", "srv_trade_no_fee", "بدون کارمزد (نگهداری 7+ روز)."],
  ["Not enough candle data for this backtest", "srv_insufficient_data", "داده کندل کافی برای این بک‌تست وجود ندارد"],
  ["Notification not found", "srv_notification_not_found", "اعلان پیدا نشد"],
  ["Image generation failed", "srv_nft_image_failed", "ساخت تصویر ناموفق بود"],
  ["Cloud trading enabled — bot runs 24/7.", "ntf_cloud_enabled", "ترید ابری فعال شد — ربات به‌صورت 24/7 اجرا می‌شود."],
  ["Cloud trading disabled.", "ntf_cloud_disabled", "ترید ابری غیرفعال شد."],
];

// [regex on English backend text, key, param names, english template, persian template]
const RULES = [
  [/^No price available for (.+)$/, "srv_trade_no_price", ["symbol"], "No price available for {symbol}", "قیمتی برای {symbol} موجود نیست"],
  [/^Risk lock: max (.+)% of balance per trade$/, "srv_trade_risk_lock", ["pct"], "Risk lock: max {pct}% of balance per trade", "قفل ریسک: حداکثر {pct}% موجودی در هر معامله"],
  [/^Max leverage for (\S+) is (\d+)x$/, "srv_trade_max_leverage", ["symbol", "max"], "Max leverage for {symbol} is {max}x", "حداکثر اهرم برای {symbol} برابر {max}x است"],
  [/^Risk for (\S+) must be between 1% and (\S+)%$/, "srv_trade_risk_range", ["symbol", "max"], "Risk for {symbol} must be between 1% and {max}%", "ریسک برای {symbol} باید بین 1% و {max}% باشد"],
  [/^Unsupported currency\. Choose one of: (.+)$/, "srv_payment_unsupported_currency", ["list"], "Unsupported currency. Choose one of: {list}", "ارز پشتیبانی نمی‌شود. یکی را انتخاب کنید: {list}"],
  [/^Unsupported exchange: (.+)$/, "srv_exchange_unsupported_named", ["name"], "Unsupported exchange: {name}", "صرافی پشتیبانی نمی‌شود: {name}"],
  [/^Username can be changed again in (\d+) day\(s\)$/, "srv_auth_username_cooldown", ["days"], "Username can be changed again in {days} day(s)", "نام کاربری را می‌توانید {days} روز دیگر تغییر دهید"],
  [/^Connection error: (.+)$/, "srv_exchange_connection_error", ["error"], "Connection error: {error}", "خطای اتصال: {error}"],
  [/^Early-withdrawal fee of 5% \((.+)\) applied\.$/, "srv_trade_early_fee", ["fee"], "Early-withdrawal fee of 5% ({fee}) applied.", "کارمزد برداشت زودهنگام 5% ({fee}) اعمال شد."],
  [/^Max drawdown (\d+)% reached the (\d+)% limit\. All positions closed\. Bot halted\.$/, "ntf_risk_drawdown", ["dd", "limit"], "Max drawdown {dd}% reached the {limit}% limit. All positions closed. Bot halted.", "افت سرمایه {dd}% به سقف {limit}% رسید. همه پوزیشن‌ها بسته شد. ربات متوقف شد."],
  [/^(\d+) consecutive losses\. Bot halted\. Confirm to resume\.$/, "ntf_risk_losses", ["count"], "{count} consecutive losses. Bot halted. Confirm to resume.", "{count} ضرر متوالی. ربات متوقف شد. برای ادامه تأیید کنید."],
  [/^Cooling down after (\d+) consecutive losses — new entries paused for (\d+) min\.$/, "ntf_cooldown", ["count", "minutes"], "Cooling down after {count} consecutive losses — new entries paused for {minutes} min.", "استراحت پس از {count} ضرر متوالی — ورود جدید به مدت {minutes} دقیقه متوقف شد."],
  [/^Opened (\S+) (\S+) · score (\S+) · (\S+)$/, "ntf_trade_opened", ["symbol", "timeframe", "score", "leverage"], "Trade opened: {symbol} {timeframe} · score {score} · {leverage}", "معامله باز شد: {symbol} {timeframe} · امتیاز {score} · {leverage}"],
  [/^NFT position opened \(Demo\): (.+)$/, "ntf_nft_opened", ["name"], "NFT position opened (Demo): {name}", "پوزیشن NFT باز شد (دمو): {name}"],
  [/^NFT position closed \(Demo\): PnL (.+)$/, "ntf_nft_closed", ["pnl"], "NFT position closed (Demo): P&L {pnl}", "پوزیشن NFT بسته شد (دمو): سود/زیان {pnl}"],
  [/^([a-z_]+): (\S+) closed · PnL (.+)$/, "ntf_trade_closed", ["reason", "symbol", "pnl"], "{reason}: {symbol} closed · P&L {pnl}", "{reason}: {symbol} بسته شد · سود/زیان {pnl}"],
  [/^⚠️ (.+?) · (\S+) · (\S+) · Score (\S+)\. Entry \$?(\S+) \/ TP \$?(\S+) \/ SL \$?(\S+)\. Informational only — not financial advice\.$/, "ntf_opportunity",
    ["symbol", "timeframe", "action", "score", "entry", "tp", "sl"],
    "⚠️ {symbol} · {timeframe} · {action} · Score {score}. Entry ${entry} / TP ${tp} / SL ${sl}. Informational only — not financial advice.",
    "⚠️ {symbol} · {timeframe} · {action} · امتیاز {score}. ورود ${entry} / TP ${tp} / SL ${sl}. فقط جنبه اطلاع‌رسانی دارد — توصیه مالی نیست."],
];

export const SRV_EN = {};
export const SRV_FA = {};
for (const [en, key, fa] of SRV) { if (!SRV_EN[key]) { SRV_EN[key] = en; SRV_FA[key] = fa; } }
for (const [, key, , en, fa] of RULES) { SRV_EN[key] = en; SRV_FA[key] = fa; }
SRV_EN.srv_subscription_required = "This feature is for Premium members";

const EXACT = Object.fromEntries(SRV.map(([en, key]) => [en, key]));
const REASON_KEYS = { liquidation: "reason_liquidation", stop_loss: "reason_stop_loss", take_profit: "reason_take_profit",
  trailing_take_profit: "reason_take_profit", drawdown_halt: "reason_drawdown_halt" };

// Renders a key with params, translating enum-like params (reason/action) first.
export function renderKey(key, params, t, tv) {
  const p = { ...(params || {}) };
  if (p.reason && REASON_KEYS[p.reason]) p.reason = t(REASON_KEYS[p.reason]);
  if (p.action) p.action = tv ? tv(p.action) : p.action;
  return t(key, p);
}

// Maps an English backend message to {key, params}; null if unknown.
export function matchServer(msg) {
  if (typeof msg !== "string") return null;
  if (EXACT[msg]) return { key: EXACT[msg], params: {} };
  for (const [re, key, names] of RULES) {
    const m = msg.match(re);
    if (m) return { key, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}
