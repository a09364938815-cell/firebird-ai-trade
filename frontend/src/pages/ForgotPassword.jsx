import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/i18n";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { identifier });
      setSent(true);
      toast.success(data.message || t("forgot_sent_toast"));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grain flex items-center justify-center p-4">
      <div className="w-full max-w-md glass fire-glow rounded-3xl p-8 fade-up">
        <div className="flex justify-center mb-6"><Logo size={56} /></div>
        <h1 className="font-head font-extrabold text-2xl text-center mb-1">{t("forgot_password")}</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {t("forgot_subtitle")}
        </p>
        {sent ? (
          <div className="text-center space-y-4" data-testid="forgot-sent">
            <p className="text-sm text-success">{t("forgot_sent_full")}</p>
            <Link to="/login" className="inline-block text-primary hover:underline text-sm" data-testid="back-to-login">{t("back_to_login")}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">{t("username_or_email")}</label>
              <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required
                autoCapitalize="none" autoCorrect="off" data-testid="forgot-identifier-input"
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none transition-colors" />
            </div>
            <button type="submit" disabled={loading} data-testid="forgot-submit-button"
              className="fire-btn w-full py-2.5 rounded-lg font-semibold disabled:opacity-60">
              {loading ? "..." : t("send_reset_link")}
            </button>
          </form>
        )}
        <p className="text-sm text-center mt-5 text-muted-foreground">
          {t("remembered_it")} <Link to="/login" className="text-primary hover:underline" data-testid="go-login">{t("login")}</Link>
        </p>
      </div>
    </div>
  );
}
