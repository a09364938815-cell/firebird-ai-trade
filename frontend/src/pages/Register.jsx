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
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) e.username = t("username_hint_short");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = t("invalid_email");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = t("pw_hint");
    if (password !== confirm) e.confirm = t("pw_mismatch");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        name: name || "Trader", username: username.toLowerCase(), email, password,
      });
      setUser(data);
      toast.success(t("account_created_verify"));
      navigate("/");
    } catch (err) {
      const detail = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      if (/username/i.test(detail)) setErrors((p) => ({ ...p, username: detail }));
      else if (/email/i.test(detail)) setErrors((p) => ({ ...p, email: detail }));
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, children, error, testid }) => (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
      {error && <p className="text-[0.6875rem] text-danger mt-1" data-testid={testid}>{error}</p>}
    </div>
  );

  const inputCls = "w-full mt-1 px-4 py-2.5 rounded-lg bg-input border border-border focus:border-primary outline-none";

  return (
    <div className="min-h-screen grain flex items-center justify-center p-4">
      <div className="w-full max-w-md glass fire-glow rounded-3xl p-8 fade-up">
        <div className="flex justify-center mb-6"><Logo size={56} /></div>
        <h1 className="font-head font-extrabold text-2xl text-center mb-6">{t("create_account")}</h1>
        <form onSubmit={submit} className="space-y-3.5">
          <Field label={t("display_name_optional")}>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="register-name-input" className={inputCls} />
          </Field>
          <Field label={t("username_label")} error={errors.username} testid="register-username-error">
            <input value={username} onChange={(e) => setUsername(e.target.value)} required
              autoCapitalize="none" autoCorrect="off" data-testid="register-username-input"
              className={inputCls} placeholder={t("username_example")} />
          </Field>
          <Field label={t("email")} error={errors.email} testid="register-email-error">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              data-testid="register-email-input" className={inputCls} />
          </Field>
          <Field label={t("password")} error={errors.password} testid="register-password-error">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              data-testid="register-password-input" className={inputCls} />
          </Field>
          <Field label={t("confirm_password_label")} error={errors.confirm} testid="register-confirm-error">
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              data-testid="register-confirm-input" className={inputCls} />
          </Field>
          <button type="submit" disabled={loading} data-testid="register-submit-button"
            className="fire-btn w-full py-2.5 rounded-lg font-semibold disabled:opacity-60">
            {loading ? "..." : t("register")}
          </button>
        </form>
        <p className="text-sm text-center mt-5 text-muted-foreground">
          {t("have_account")}{" "}
          <Link to="/login" className="text-primary hover:underline" data-testid="go-login">{t("login")}</Link>
        </p>
      </div>
    </div>
  );
}
