"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../../i18n/navigation.js";
import { site } from "../../lib/site.js";

// Error boundary for everything under [locale]. It is rendered INSIDE
// [locale]/layout (which provides NextIntlClientProvider), so useTranslations
// works and the page keeps the header/footer/locale chrome. Must be a client
// component and receives { error, reset } — reset() re-renders the segment to
// retry. Reuses the 404 page's layout classes for a consistent, tidy look.
export default function Error({ error, reset }) {
  const t = useTranslations("error");
  const nav = useTranslations("nav");

  useEffect(() => {
    // Surface to the console for debugging (no user data logged).
    console.error(error);
  }, [error]);

  return (
    <main className="container notfound">
      <div className="notfound-emoji" aria-hidden="true">
        {site.emoji}
      </div>
      <h1>{t("title")}</h1>
      <p className="notfound-body">{t("body")}</p>
      <div className="notfound-actions">
        <button className="btn btn-primary" onClick={() => reset()}>
          {t("retry")}
        </button>
        <Link className="btn btn-outline" href="/">
          {nav("home")}
        </Link>
      </div>
    </main>
  );
}
