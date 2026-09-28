import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n";
import { Logo } from "@/components/Logo";

export default function Register() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name: name || "Trader", email, password });
      setUser(data);
      toast.success(t("account_created"));
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
        <h1 className="font-head font-extrabold text-2xl text-center mb-6">{t("create_account")}</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="register-name-input"
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="register-email-input"
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              data-testid="register-password-input"
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            data-testid="register-submit-button"
            className="fire-btn w-full py-2.5 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "..." : t("register")}
          </button>
        </form>
        <p className="text-sm text-center mt-5 text-muted-foreground">
          {t("have_account")}{" "}
          <Link to="/login" className="text-primary hover:underline" data-testid="go-login">
            {t("login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
