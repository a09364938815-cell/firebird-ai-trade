import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, CandlestickChart, Radar, Bot, Hand, ScanSearch,
  FlaskConical, Wallet, Gem, Sparkles, Settings as SettingsIcon,
  BookOpen, LogOut, Menu, X, Globe, Crown, Bell, AlertTriangle, Rocket,
} from "lucide-react";
import { Logo } from "./Logo";
import api from "@/lib/api";
import { renderKey, useI18n, LANGUAGES } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { useAccount } from "wagmi";
import { shortAddr } from "@/web3/config";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", key: "nav_dashboard", icon: LayoutDashboard, end: true },
  { to: "/charts", key: "nav_charts", icon: CandlestickChart },
  { to: "/signals", key: "nav_signals", icon: Radar },
  { to: "/auto-trade", key: "nav_autotrade", icon: Bot },
  { to: "/manual", key: "nav_manual", icon: Hand },
  { to: "/scanner", key: "nav_scanner", icon: ScanSearch },
  { to: "/backtest", key: "nav_backtest", icon: FlaskConical },
  { to: "/positions", key: "nav_positions", icon: Wallet },
  { to: "/nft", key: "nav_nft", icon: Gem },
  { to: "/assistant", key: "nav_assistant", icon: Sparkles },
  { to: "/settings", key: "nav_settings", icon: SettingsIcon },
  { to: "/subscription", key: "nav_subscription", icon: Rocket },
  { to: "/guide", key: "nav_guide", icon: BookOpen },
];

export default function Layout() {
  const { t, lang, setLang, dir } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const showVerify = user && user.email_verified === false && !verifyDismissed;

  const resendVerify = async () => {
    try { const { data } = await api.post("/auth/resend-verification"); toast.success(data.message || t("verification_sent")); }
    catch { toast.error(t("could_not_resend")); }
  };

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebar = (
    <nav className="flex flex-col gap-1 p-3" data-testid="fixed-nav-sidebar">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          data-testid={`nav-${item.key}`}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`
          }
        >
          <item.icon size={18} />
          <span>{t(item.key)}</span>
        </NavLink>
      ))}
      {user?.role === "admin" && (
        <NavLink
          to="/owner"
          onClick={() => setOpen(false)}
          data-testid="nav-owner"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              isActive
                ? "bg-gold/15 text-gold border border-gold/30"
                : "text-gold/80 hover:text-gold hover:bg-gold/10"
            }`
          }
        >
          <Crown size={18} />
          <span>{t("owner_console")}</span>
        </NavLink>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen grain" dir={dir}>
      {/* Header */}
      <header className="fixed top-0 inset-x-0 h-16 z-40 glass flex items-center justify-between gap-2 px-3 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-secondary"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
          <span className="hidden md:inline text-sm text-muted-foreground" data-testid="header-username">
            {t("welcome")}, <span className="text-foreground font-semibold">{user?.username || user?.name || t("trader")}</span>
          </span>
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/30"
            data-testid="demo-mode-toggle"
          >
            <span className="w-2 h-2 rounded-full bg-success ember-pulse" />
            {t("demo_mode")} · ${Number(user?.demo_balance ?? 100).toFixed(0)}
          </span>
          <WalletHeaderBadge />
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm hover:bg-secondary border border-border"
                data-testid="language-switcher-dropdown"
              >
                <Globe size={16} />
                <span className="uppercase">{lang}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass">
              {LANGUAGES.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  data-testid={`lang-${l.code}`}
                  className="cursor-pointer"
                >
                  {l.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={onLogout}
            data-testid="logout-button"
            className="p-2 rounded-md hover:bg-destructive/15 hover:text-destructive transition-colors"
            title={t("logout")}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:block fixed top-16 bottom-0 w-64 glass overflow-y-auto ${
          dir === "rtl" ? "right-0 border-l" : "left-0 border-r"
        } border-border`}
      >
        {sidebar}
        <div className="p-4 mt-2 text-[0.625rem] text-muted-foreground leading-relaxed">
          {t("disclaimer")}
        </div>
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="lg:hidden fixed inset-0 top-16 z-30">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside
            className={`absolute top-0 bottom-0 w-72 glass overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] ${
              dir === "rtl" ? "right-0" : "left-0"
            }`}
          >
            {sidebar}
            <div className="px-3">
              <button onClick={onLogout} data-testid="drawer-logout-button"
                className="w-full mb-6 flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-semibold text-danger border border-destructive/30 hover:bg-destructive/10">
                <LogOut size={18} />
                <span>{t("logout")}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <main
        className={`pt-20 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10 px-4 md:px-8 ${dir === "rtl" ? "lg:pr-72" : "lg:pl-72"}`}
      >
        <div className="max-w-7xl mx-auto fade-up">
          {showVerify && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm" data-testid="verify-reminder-banner">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="flex-1">{t("verify_reminder")}</span>
              <button onClick={resendVerify} data-testid="verify-reminder-resend"
                className="text-xs px-3 py-1 rounded-md border border-amber-500/40 hover:bg-amber-500/15 whitespace-nowrap">{t("verify_now")}</button>
              <button onClick={() => setVerifyDismissed(true)} data-testid="verify-reminder-dismiss"
                className="p-1 rounded hover:bg-amber-500/15" title={t("dismiss")}><X size={14} /></button>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}


function WalletHeaderBadge() {
  const { isConnected, address } = useAccount();
  if (!isConnected) return null;
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/30" data-testid="header-wallet-badge">
      <Wallet size={12} />
      <span className="mono" dir="ltr">{shortAddr(address)}</span>
    </span>
  );
}

function NotificationsBell() {
  const { t, tv, lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications", lang],
    queryFn: () => api.get("/notifications").then((r) => r.data),
    refetchInterval: 30000,
  });
  const unread = data?.unread || 0;
  const items = data?.items || [];

  const markRead = async () => {
    await api.post("/notifications/read");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <DropdownMenu onOpenChange={(o) => { setOpen(o); if (o && unread) markRead(); }}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-md hover:bg-secondary border border-border" data-testid="notifications-bell">
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[0.625rem] font-bold text-white flex items-center justify-center num" data-testid="notifications-badge">
              {unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass w-80 max-h-96 overflow-y-auto" data-testid="notifications-panel">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">{t("notifications")}</span>
          {items.length > 0 && (
            <button onClick={markRead} className="text-xs text-primary hover:underline" data-testid="mark-all-read">{t("mark_all_read")}</button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("no_notifications")}</div>
        ) : (
          items.slice(0, 15).map((n) => (
            <div key={n.id} className={`px-3 py-2 text-xs border-t border-border/40 ${n.read ? "text-muted-foreground" : "text-foreground"}`} data-testid={`notification-${n.id}`}>
              <div>{n.key ? renderKey(n.key, n.params, t, tv) : n.message}</div>
              <div className="mono text-[0.625rem] text-muted-foreground mt-0.5" dir="ltr">{(n.created_at || "").slice(0, 19).replace("T", " ")}</div>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
