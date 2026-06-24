"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getConsent, isPreviewHost, setConsent } from "../lib/consent.js";

// Cookie banner shown only when there is something to consent to: it is mounted
// (from layout) only when a GA4 id is configured, and self-suppresses on Vercel
// preview hosts. The choice is persisted + reflected into Consent Mode by
// setConsent(), which the GA4 loader listens for to inject gtag.js on accept.
export default function CookieConsent() {
  const t = useTranslations("cookie");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isPreviewHost()) return;
    const v = getConsent();
    // Re-affirm a prior "granted" into Consent Mode; prompt only if no choice
    // has been made yet. A prior "denied" stays denied without re-prompting.
    if (v === "granted") setConsent(true);
    else if (v == null) setShow(true);
  }, []);

  const choose = (granted) => {
    setConsent(granted);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookies">
      <p className="cookie-text">{t("message")}</p>
      <div className="cookie-actions">
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => choose(false)}
        >
          {t("reject")}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => choose(true)}
        >
          {t("accept")}
        </button>
      </div>
    </div>
  );
}
