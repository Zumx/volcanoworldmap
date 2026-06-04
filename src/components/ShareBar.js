"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Social share + utility row for an article. Share targets open a centred
// popup; "copy link" uses the async clipboard API with a graceful fallback and
// a transient confirmation; "print" triggers the browser dialog (a print
// stylesheet in globals.css strips chrome to just the article). The canonical
// `url` and `title` are computed server-side and passed down so this stays a
// thin client island.
export default function ShareBar({ url, title }) {
  const t = useTranslations("blog");
  const [copied, setCopied] = useState(false);

  const u = encodeURIComponent(url);
  const txt = encodeURIComponent(title);
  const targets = [
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${txt}` },
    { key: "fb", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "pin", label: "Pinterest", href: `https://pinterest.com/pin/create/button/?url=${u}&description=${txt}` },
  ];

  const openPopup = (e, href) => {
    e.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=520");
  };

  const copy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  };

  return (
    <div className="share-bar no-print" role="group" aria-label={t("share")}>
      <span className="share-label">{t("share")}</span>
      {targets.map((s) => (
        <a
          key={s.key}
          className="share-btn"
          href={s.href}
          onClick={(e) => openPopup(e, s.href)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
        >
          {s.label}
        </a>
      ))}
      <button type="button" className="share-btn" onClick={copy}>
        {copied ? t("copied") : t("copyLink")}
      </button>
      <button
        type="button"
        className="share-btn"
        onClick={() => window.print()}
      >
        {t("print")}
      </button>
    </div>
  );
}
