"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { site } from "../lib/site.js";

// Backend-free newsletter signup: on submit we open a prefilled mailto to the
// site's contact address with the name + email in the body, so the owner can
// collect subscribers without any server or database yet. Swap onSubmit for a
// fetch() to a route handler when a real list is wired up.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSignup() {
  const t = useTranslations("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans never see it
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  const to = site.contactEmail || `hello@${site.domain}`;

  const onSubmit = (e) => {
    e.preventDefault();
    // Honeypot: a filled hidden field means a bot — pretend success, do nothing.
    if (company) {
      setSent(true);
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError(true);
      return;
    }
    setError(false);
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
          <>
            <form className="signup-form" onSubmit={onSubmit} noValidate>
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(false);
                }}
                placeholder={t("emailPlaceholder")}
                aria-label={t("emailPlaceholder")}
                aria-invalid={error || undefined}
              />
              {/* Honeypot: off-screen, not tab-reachable, ignored by humans. */}
              <input
                type="text"
                className="signup-hp"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                {t("button")}
              </button>
            </form>
            {error && <p className="signup-error">{t("invalid")}</p>}
            <p className="signup-social">{t("social", { count: 1200 })}</p>
          </>
        )}
      </div>
    </section>
  );
}
