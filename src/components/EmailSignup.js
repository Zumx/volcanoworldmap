"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { site } from "../lib/site.js";

// Backend-free newsletter signup: on submit we open a prefilled mailto to the
// site's contact address with the name + email + chosen interests in the body,
// so the owner can collect subscribers without any server or database yet. Swap
// onSubmit for a fetch() to a route handler when a real list is wired up.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INTERESTS = ["locations", "blog", "tips"]; // i18n keys: interestLocations…

export default function EmailSignup() {
  const t = useTranslations("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans never see it
  const [interests, setInterests] = useState({
    locations: true,
    blog: true,
    tips: true,
  });
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  const to = site.contactEmail || `hello@${site.domain}`;

  const interestLabel = {
    locations: t("interestLocations"),
    blog: t("interestBlog"),
    tips: t("interestTips"),
  };
  const chosen = INTERESTS.filter((k) => interests[k]);

  const toggle = (k) =>
    setInterests((prev) => ({ ...prev, [k]: !prev[k] }));

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
    const interestList =
      chosen.map((k) => interestLabel[k]).join(", ") || "—";
    const subject = encodeURIComponent(`Newsletter signup — ${site.name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nInterests: ${interestList}\n\n` +
        `Please add me to the ${site.name} newsletter.`
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <section className="signup">
      <div className="signup-inner">
        {sent ? (
          // Confirmation "page": replaces the form with a clear acknowledgement
          // + a recap of the chosen interests.
          <div className="signup-confirm" role="status" aria-live="polite">
            <span className="signup-confirm-icon" aria-hidden="true">
              ✓
            </span>
            <h2>{t("confirmTitle")}</h2>
            <p className="signup-thanks">{t("thanks")}</p>
            {chosen.length > 0 && (
              <p className="signup-confirm-interests">
                {t("confirmInterests")}{" "}
                <strong>
                  {chosen.map((k) => interestLabel[k]).join(", ")}
                </strong>
              </p>
            )}
          </div>
        ) : (
          <>
            <h2>{t("heading")}</h2>
            <p className="signup-sub">{t("sub")}</p>
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

            {/* Interest picker — controls what the owner tags the subscriber with. */}
            <fieldset className="signup-interests">
              <legend>{t("interestsLabel")}</legend>
              {INTERESTS.map((k) => (
                <label key={k} className="signup-interest">
                  <input
                    type="checkbox"
                    checked={interests[k]}
                    onChange={() => toggle(k)}
                  />
                  <span>{interestLabel[k]}</span>
                </label>
              ))}
            </fieldset>

            {error && <p className="signup-error">{t("invalid")}</p>}
            <p className="signup-social">{t("social", { count: 1200 })}</p>
            <p className="signup-gdpr">{t("gdpr")}</p>
          </>
        )}
      </div>
    </section>
  );
}
