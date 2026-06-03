"use client";

import { useTranslations } from "next-intl";
import { Link } from "../i18n/navigation.js";
import { site } from "../lib/site.js";
import LanguageSwitcher from "./LanguageSwitcher.js";

export default function Header() {
  const t = useTranslations("nav");

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <span>{site.emoji}</span>
        <span>{site.name}</span>
      </Link>
      <nav>
        <div className="nav-links">
          <Link href="/">{t("home")}</Link>
          <Link href="/about">{t("about")}</Link>
        </div>
        {/* Primary CTAs live in the navbar now (moved out of the hero so the
            hero can stay a compact brand+tagline strip). */}
        <Link className="btn btn-sm btn-ghost" href="/blog">
          {t("blog")}
        </Link>
        <Link className="btn btn-sm btn-primary" href="/map">
          {t("map")}
        </Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
