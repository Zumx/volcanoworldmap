"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "../i18n/navigation.js";
import { routing } from "../i18n/routing.js";

// Native-language label + flag emoji for each supported locale. Keep additions
// in sync with messages/<loc>.json files. en → 🇬🇧 (UK) by convention here.
const LABEL = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  sv: "Svenska",
};
const FLAG = { en: "🇬🇧", de: "🇩🇪", fr: "🇫🇷", it: "🇮🇹", sv: "🇸🇪" };

const STORAGE_KEY = "preferredLocale";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname(); // locale-stripped → switching keeps the page
  const router = useRouter();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Honor a saved language preference: once per browser session, if the stored
  // locale differs from the one in the URL, switch to it on the *same* page.
  // Guarded by sessionStorage so a deliberately shared link isn't yanked around
  // repeatedly, and crawlers (no localStorage) always get the URL's locale.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let pref = null;
    try {
      pref = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    if (
      pref &&
      pref !== locale &&
      routing.locales.includes(pref) &&
      !sessionStorage.getItem("localeRedirected")
    ) {
      try {
        sessionStorage.setItem("localeRedirected", "1");
      } catch {
        /* ignore */
      }
      router.replace(pathname, { locale: pref });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (routing.locales.length < 2) return null;

  // Remember the choice so the next visit opens in this language.
  const choose = (l) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
      sessionStorage.setItem("localeRedirected", "1"); // don't re-redirect after an explicit pick
    } catch {
      /* storage blocked */
    }
    setOpen(false);
  };

  return (
    <div className="language-switcher" ref={rootRef}>
      <button
        type="button"
        className="lang-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lang-flag" aria-hidden="true">
          {FLAG[locale] || "🌐"}
        </span>
        <span className="lang-code">{locale.toUpperCase()}</span>
        <span className={`lang-caret${open ? " is-open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      <ul
        className={`lang-menu${open ? " is-open" : ""}`}
        role="listbox"
        aria-label={t("language")}
      >
        {routing.locales.map((l) => (
          <li key={l} role="option" aria-selected={l === locale}>
            <Link
              href={pathname}
              locale={l}
              hrefLang={l}
              className={l === locale ? "is-active" : ""}
              aria-current={l === locale ? "true" : undefined}
              onClick={() => choose(l)}
            >
              <span className="lang-flag" aria-hidden="true">
                {FLAG[l] || "🌐"}
              </span>
              <span className="lang-name">{LABEL[l] || l.toUpperCase()}</span>
              <span className="lang-code-sm">{l.toUpperCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
