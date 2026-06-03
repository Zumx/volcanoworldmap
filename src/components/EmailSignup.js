"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { site } from "../lib/site.js";

// Backend-free newsletter signup: on submit we open a prefilled mailto to the
// site's contact address with the name + email in the body, so the owner can
// collect subscribers without any server or database yet. Swap onSubmit for a
// fetch() to a route handler when a real list is wired up.
export default function EmailSignup() {
  const t = useTranslations("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const to = site.contactEmail || `hello@${site.domain}`;

  const onSubmit = (e) => {
    e.preventDefault();
    if (!email) return;
    const subject = encodeURIComponent(`Newsletter signup — ${site.name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nPlease add me to the monthly ${site.name} newsletter.`
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <section className="signup">
      <div className="signup-inner">
        <h2>{t("heading")}</h2>
        <p className="signup-sub">{t("sub")}</p>
        {sent ? (
          <p className="signup-thanks">{t("thanks")}</p>
        ) : (
          <form className="signup-form" onSubmit={onSubmit}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              aria-label={t("namePlaceholder")}
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              aria-label={t("emailPlaceholder")}
            />
            <button type="submit" className="btn btn-primary btn-sm">
              {t("button")}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
