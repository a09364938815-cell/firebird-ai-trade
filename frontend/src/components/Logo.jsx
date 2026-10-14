import React, { useState } from "react";

// Original Firebird / Simorgh dual logo (preserved from the legacy app),
// served locally from /public/logos so it ships inside the build.
export const LOGO_A = "/logos/firebird-logo-a.png";
export const LOGO_B = "/logos/firebird-logo-b.png";
export const FIREBIRD_LOGO = LOGO_A;

export function Logo({ size = 40, withText = true }) {
  const [which, setWhich] = useState(() => localStorage.getItem("fb_logo") || "a");
  const src = which === "b" ? LOGO_B : LOGO_A;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = which === "a" ? "b" : "a";
    setWhich(next);
    localStorage.setItem("fb_logo", next);
  };

  return (
    <div className="flex items-center gap-3" data-testid="firebird-logo">
      <img
        src={src}
        alt="Firebird / Simorgh Trade"
        width={size}
        height={size}
        onClick={toggle}
        title="Tap to switch logo"
        data-testid="logo-toggle"
        className="rounded-lg ember-pulse cursor-pointer select-none"
        style={{ objectFit: "contain" }}
      />
      {withText && (
        <div className="leading-tight">
          <div className="font-head font-extrabold text-[18px] fire-text tracking-tight max-[359px]:hidden">
            FireBird Crypto
          </div>
        </div>
      )}
    </div>
  );
}
