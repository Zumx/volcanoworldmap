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
        <Link href="/">{t("home")}</Link>
        <Link href="/map">{t("map")}</Link>
        <Link href="/blog">{t("blog")}</Link>
        <Link href="/about">{t("about")}</Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
