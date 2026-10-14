import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/i18n";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function Verify() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setStatus("error"); setMessage(t("missing_verify_token")); return; }
    api.get(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then((r) => { setStatus("ok"); setMessage(r.data.message || t("email_verified_msg")); })
      .catch((err) => { setStatus("error"); setMessage(formatApiErrorDetail(err.response?.data?.detail) || t("verification_failed")); });
  }, [token]);

  return (
    <div className="min-h-screen grain flex items-center justify-center p-4">
      <div className="w-full max-w-md glass fire-glow rounded-3xl p-8 text-center fade-up">
        <div className="flex justify-center mb-6"><Logo size={56} /></div>
        {status === "loading" && (
          <div data-testid="verify-loading"><Loader2 className="mx-auto animate-spin text-primary mb-3" size={40} /><p className="text-muted-foreground">{t("verifying_email")}</p></div>
        )}
        {status === "ok" && (
          <div data-testid="verify-success">
            <CheckCircle2 className="mx-auto text-success mb-3" size={48} />
            <h1 className="font-head font-bold text-xl mb-2">{t("email_verified_title")}</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Link to="/login" className="fire-btn inline-block px-6 py-2.5 rounded-lg font-semibold" data-testid="verify-login-link">{t("go_to_login")}</Link>
          </div>
        )}
        {status === "error" && (
          <div data-testid="verify-error">
            <XCircle className="mx-auto text-danger mb-3" size={48} />
            <h1 className="font-head font-bold text-xl mb-2">{t("verification_failed_title")}</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <p className="text-xs text-muted-foreground">{t("verify_expired_hint")}</p>
            <Link to="/login" className="inline-block mt-4 text-primary hover:underline text-sm" data-testid="verify-back-login">{t("back_to_login")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
