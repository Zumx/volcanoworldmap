"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../i18n/navigation.js";
import { site } from "../lib/site.js";
import LanguageSwitcher from "./LanguageSwitcher.js";

export default function Header() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const headerRef = useRef(null);

  // Close the mobile menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target))
        setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="site-header" ref={headerRef}>
      <Link href="/" className="brand" onClick={close}>
        <span>{site.emoji}</span>
        <span>{site.name}</span>
      </Link>

      {/* Desktop nav */}
      <nav className="nav-desktop">
        <div className="nav-links">
          <Link href="/">{t("home")}</Link>
          <Link href="/about">{t("about")}</Link>
        </div>
        <Link className="btn btn-sm btn-ghost" href="/blog">
          {t("blog")}
        </Link>
        <Link className="btn btn-sm btn-primary" href="/map">
          {t("map")}
        </Link>
        <LanguageSwitcher />
      </nav>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="nav-toggle"
        aria-label={t("menu")}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`burger${open ? " is-open" : ""}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* Mobile drawer — all links + the language switcher */}
      <div id="mobile-nav" className={`nav-mobile${open ? " is-open" : ""}`}>
        <Link href="/" onClick={close}>
          {t("home")}
        </Link>
        <Link href="/map" onClick={close}>
          {t("map")}
        </Link>
        <Link href="/blog" onClick={close}>
          {t("blog")}
        </Link>
        <Link href="/about" onClick={close}>
          {t("about")}
        </Link>
        <Link href="/faq" onClick={close}>
          {t("faq")}
        </Link>
        <div className="nav-mobile-lang">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
