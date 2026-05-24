"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "../i18n/navigation.js";
import { routing } from "../i18n/routing.js";

// Native-language label for each supported locale. Keep additions in sync
// with messages/<loc>.json files.
const LABEL = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  if (routing.locales.length < 2) return null;

  return (
    <div className="language-switcher" aria-label="Language">
      {routing.locales.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          hrefLang={l}
          className={l === locale ? "active" : ""}
          aria-current={l === locale ? "true" : undefined}
        >
          {LABEL[l] || l.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
