import React from "react";

export const FIREBIRD_LOGO =
  "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/0ee7d285bbcb5dd7991a4a433ae046eb1cfd40512c562a661a58c5ba67415080.jpeg";

export function Logo({ size = 40, withText = true }) {
  return (
    <div className="flex items-center gap-3" data-testid="firebird-logo">
      <img
        src={FIREBIRD_LOGO}
        alt="Firebird"
        width={size}
        height={size}
        className="rounded-lg ember-pulse"
        style={{ objectFit: "contain" }}
      />
      {withText && (
        <div className="leading-tight">
          <div className="font-head font-extrabold text-lg fire-text tracking-tight">
            FIREBIRD AI
          </div>
        </div>
      )}
    </div>
  );
}
