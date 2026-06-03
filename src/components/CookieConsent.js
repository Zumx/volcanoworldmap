"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { site } from "../lib/site.js";

// Only mounted (from layout) when a GA4 id is configured, i.e. the only case
// where the site sets cookies at all. Choice is persisted in localStorage and
// reflected into Google Consent Mode via gtag('consent','update', …).
const KEY = `${site.slug}:consent`;

function updateConsent(granted) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
  });
}

export default function CookieConsent() {
  const t = useTranslations("cookie");
  const [show, setShow] = useState(false);

  useEffect(() => {
    let v = null;
    try {
      v = localStorage.getItem(KEY);
    } catch {
      /* storage blocked */
    }
    if (v === "granted") updateConsent(true);
    else if (v == null) setShow(true);
    // "denied" → leave the default denied, don't re-prompt.
  }, []);

  const choose = (granted) => {
    try {
      localStorage.setItem(KEY, granted ? "granted" : "denied");
    } catch {
      /* storage blocked */
    }
    updateConsent(granted);
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
