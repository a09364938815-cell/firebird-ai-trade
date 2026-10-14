import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/i18n";

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

  const submit = async (e) => {
    e.preventDefault();
    if (!token) { toast.error(t("missing_reset_token")); return; }
    if (password !== confirm) { toast.error(t("pw_mismatch")); return; }
    if (!valid) { toast.error(t("pw_requirement")); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, password, confirm_password: confirm });
      toast.success(data.message || t("password_updated"));
      navigate("/login");
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
        <h1 className="font-head font-extrabold text-2xl text-center mb-1">{t("reset_password")}</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">{t("reset_subtitle")}</p>
        {!token ? (
          <div className="text-center space-y-4" data-testid="reset-no-token">
            <p className="text-sm text-danger">{t("reset_invalid")}</p>
            <Link to="/forgot-password" className="inline-block text-primary hover:underline text-sm">{t("request_reset_link")}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">{t("new_password_label")}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                data-testid="reset-password-input"
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none" />
              <p className={`text-[0.6875rem] mt-1 ${valid ? "text-success" : "text-muted-foreground"}`}>
                {t("pw_hint2")}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("confirm_new_password")}</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                data-testid="reset-confirm-input"
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none" />
            </div>
            <button type="submit" disabled={loading} data-testid="reset-submit-button"
              className="fire-btn w-full py-2.5 rounded-lg font-semibold disabled:opacity-60">
              {loading ? "..." : t("update_password_btn")}
            </button>
          </form>
        )}
        <p className="text-sm text-center mt-5 text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline" data-testid="go-login">{t("back_to_login")}</Link>
        </p>
      </div>
    </div>
  );
}
