import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CandlestickChart, Radar, Bot, Hand, ScanSearch,
  FlaskConical, Wallet, Gem, Sparkles, Settings as SettingsIcon,
  BookOpen, LogOut, Menu, X, Globe, Crown,
} from "lucide-react";
import { Logo } from "./Logo";
import { useI18n, LANGUAGES } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
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
  { to: "/guide", key: "nav_guide", icon: BookOpen },
];

export default function Layout() {
  const { t, lang, setLang, dir } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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
      <header className="fixed top-0 inset-x-0 h-16 z-40 glass flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-secondary"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/30"
            data-testid="demo-mode-toggle"
          >
            <span className="w-2 h-2 rounded-full bg-success ember-pulse" />
            {t("demo_mode")} · ${Number(user?.demo_balance ?? 100).toFixed(0)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm hover:bg-secondary border border-border"
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
        <div className="p-4 mt-2 text-[10px] text-muted-foreground leading-relaxed">
          {t("disclaimer")}
        </div>
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="lg:hidden fixed inset-0 top-16 z-30">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside
            className={`absolute top-0 bottom-0 w-72 glass overflow-y-auto ${
              dir === "rtl" ? "right-0" : "left-0"
            }`}
          >
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <main
        className={`pt-20 pb-10 px-4 md:px-8 ${dir === "rtl" ? "lg:pr-72" : "lg:pl-72"}`}
      >
        <div className="max-w-7xl mx-auto fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
