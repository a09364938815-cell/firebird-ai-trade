import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n";
import { Logo } from "@/components/Logo";

export default function Login() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@firebird.ai");
  const [password, setPassword] = useState("Firebird#2026");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      toast.success(t("welcome_back"));
      navigate("/");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grain flex items-center justify-center p-4">
      <div className="w-full max-w-md glass fire-glow rounded-3xl p-8 fade-up">
        <div className="flex justify-center mb-6">
          <Logo size={56} />
        </div>
        <h1 className="font-head font-extrabold text-2xl text-center mb-1">{t("welcome_back")}</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">{t("tagline")}</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="login-email-input"
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="login-password-input"
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit-button"
            className="fire-btn w-full py-2.5 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "..." : t("login")}
          </button>
        </form>
        <p className="text-sm text-center mt-5 text-muted-foreground">
          {t("no_account")}{" "}
          <Link to="/register" className="text-primary hover:underline" data-testid="go-register">
            {t("register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
