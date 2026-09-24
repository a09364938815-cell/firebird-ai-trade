import React, { createContext, useContext, useEffect, useState } from "react";

export const LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fa", label: "فارسی", dir: "rtl" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" },
  { code: "ja", label: "日本語", dir: "ltr" },
  { code: "ru", label: "Русский", dir: "ltr" },
  { code: "pt", label: "Português", dir: "ltr" },
  { code: "tr", label: "Türkçe", dir: "ltr" },
];

const en = {
  app_name: "FIREBIRD AI",
  tagline: "AI Crypto & NFT Trading",
  login: "Log In",
  register: "Sign Up",
  logout: "Log Out",
  email: "Email",
  password: "Password",
  name: "Name",
  welcome_back: "Welcome back, trader",
  create_account: "Create your account",
  no_account: "No account yet?",
  have_account: "Already have an account?",
  demo_mode: "Demo Mode",
  demo_balance: "Demo Balance",
  nav_dashboard: "Dashboard",
  nav_charts: "Live Charts",
  nav_signals: "AI Signals",
  nav_autotrade: "Auto-Trade",
  nav_manual: "Manual Trade",
  nav_scanner: "Memecoin Scanner",
  nav_backtest: "5×5 Backtest",
  nav_positions: "Positions & Reports",
  nav_nft: "NFT Collection",
  nav_assistant: "AI Assistant",
  nav_settings: "Exchange & Settings",
  nav_guide: "Beginner Guide",
  total_value: "Total Value",
  cash: "Cash",
  holdings: "Holdings",
  unrealized_pnl: "Unrealized PnL",
  top_signals: "Top AI Signals",
  market_overview: "Market Overview",
  whale_activity: "Whale & Smart Money",
  market_pulse: "Market Pulse",
  price: "Price",
  change_24h: "24h",
  score: "Score",
  action: "Action",
  buy: "Buy",
  sell: "Sell",
  hold: "Hold",
  timeframe: "Timeframe",
  symbol: "Symbol",
  amount_usd: "Amount (USD)",
  open_position: "Open Position",
  close: "Close",
  no_positions: "No open positions",
  entry: "Entry",
  current: "Current",
  pnl: "PnL",
  win_rate: "Win Rate",
  total_trades: "Total Trades",
  total_pnl: "Total PnL",
  run_backtest: "Run Backtest",
  auto_trade_on: "Auto-Trade Active",
  auto_trade_off: "Auto-Trade Off",
  enable_autotrade: "Enable Auto-Trade (Demo)",
  reset_demo: "Reset Demo ($100)",
  safety: "Safety",
  opportunity: "Opportunity",
  holders: "Holders",
  verdict: "Verdict",
  ask_ai: "Ask Firebird AI...",
  send: "Send",
  score_coin: "Score This Coin",
  collection: "Firebird 555 Collection",
  rares: "Legendary Rares",
  floor_price: "Floor Price",
  minted: "Minted",
  all: "All",
  save: "Save",
  risk_lock: "Risk Lock",
  max_position: "Max Position %",
  trailing_stop: "Trailing Stop %",
  take_profit: "Take Profit %",
  stop_loss: "Stop Loss %",
  exchanges: "Exchange Connections",
  connected: "Connected (Demo)",
  disconnected: "Not Connected",
  disclaimer:
    "Demo/sandbox mode. Nothing here is financial advice. No system can guarantee future win rates.",
  guide_intro:
    "Welcome to Firebird AI Trade. Follow these steps to get started safely.",
};

const fa = {
  app_name: "فایربرد AI",
  tagline: "ترید هوشمند کریپتو و NFT",
  login: "ورود",
  register: "ثبت‌نام",
  logout: "خروج",
  email: "ایمیل",
  password: "رمز عبور",
  name: "نام",
  welcome_back: "خوش آمدی، تریدر",
  create_account: "ساخت حساب کاربری",
  no_account: "هنوز حساب نداری؟",
  have_account: "قبلاً حساب ساخته‌ای؟",
  demo_mode: "حالت دمو",
  demo_balance: "موجودی دمو",
  nav_dashboard: "داشبورد",
  nav_charts: "چارت زنده",
  nav_signals: "سیگنال‌های AI",
  nav_autotrade: "ترید خودکار",
  nav_manual: "ترید دستی",
  nav_scanner: "اسکنر میم‌کوین",
  nav_backtest: "بک‌تست ۵×۵",
  nav_positions: "پوزیشن‌ها و گزارش‌ها",
  nav_nft: "کالکشن NFT",
  nav_assistant: "دستیار هوش مصنوعی",
  nav_settings: "صرافی و تنظیمات",
  nav_guide: "راهنمای تازه‌واردها",
  total_value: "ارزش کل",
  cash: "نقد",
  holdings: "دارایی‌ها",
  unrealized_pnl: "سود/زیان باز",
  top_signals: "برترین سیگنال‌های AI",
  market_overview: "نمای بازار",
  whale_activity: "نهنگ‌ها و پول هوشمند",
  market_pulse: "نبض بازار",
  price: "قیمت",
  change_24h: "۲۴ساعت",
  score: "امتیاز",
  action: "اقدام",
  buy: "خرید",
  sell: "فروش",
  hold: "نگه‌داری",
  timeframe: "تایم‌فریم",
  symbol: "نماد",
  amount_usd: "مبلغ (دلار)",
  open_position: "باز کردن پوزیشن",
  close: "بستن",
  no_positions: "پوزیشن بازی وجود ندارد",
  entry: "ورود",
  current: "فعلی",
  pnl: "سود/زیان",
  win_rate: "نرخ برد",
  total_trades: "کل معاملات",
  total_pnl: "سود/زیان کل",
  run_backtest: "اجرای بک‌تست",
  auto_trade_on: "ترید خودکار فعال",
  auto_trade_off: "ترید خودکار خاموش",
  enable_autotrade: "فعال‌سازی ترید خودکار (دمو)",
  reset_demo: "ریست دمو ($100)",
  safety: "امنیت",
  opportunity: "فرصت",
  holders: "هولدرها",
  verdict: "نتیجه",
  ask_ai: "از فایربرد AI بپرس...",
  send: "ارسال",
  score_coin: "امتیازدهی این کوین",
  collection: "کالکشن فایربرد ۵۵۵",
  rares: "نایاب‌های افسانه‌ای",
  floor_price: "کف قیمت",
  minted: "مینت‌شده",
  all: "همه",
  save: "ذخیره",
  risk_lock: "قفل ریسک",
  max_position: "حداکثر پوزیشن ٪",
  trailing_stop: "حد ضرر شناور ٪",
  take_profit: "حد سود ٪",
  stop_loss: "حد ضرر ٪",
  exchanges: "اتصال صرافی‌ها",
  connected: "متصل (دمو)",
  disconnected: "متصل نیست",
  disclaimer:
    "حالت دمو/سندباکس. هیچ‌چیز اینجا توصیه مالی نیست. هیچ سیستمی نرخ برد آینده را تضمین نمی‌کند.",
  guide_intro:
    "به فایربرد AI ترید خوش آمدی. برای شروع امن این مراحل را دنبال کن.",
};

const TRANSLATIONS = { en, fa };

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("fb_lang") || "en");

  useEffect(() => {
    localStorage.setItem("fb_lang", lang);
    const meta = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
    document.documentElement.dir = meta.dir;
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("font-fa", lang === "fa");
  }, [lang]);

  const t = (key) => {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  };

  const dir = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).dir;

  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
