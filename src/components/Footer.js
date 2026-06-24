import { useTranslations } from "next-intl";
import { Link } from "../i18n/navigation.js";
import { site, author } from "../lib/site.js";

export default function Footer() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  // Rendered at build / ISR-revalidate time — refreshes with each deploy.
  const year = new Date().getFullYear();
  const email = site.contactEmail;

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="footer-name">
            {site.emoji} {site.name}
          </span>
          <span className="footer-tagline">{t("tagline")}</span>
        </div>

        <nav className="footer-links" aria-label={t("navLabel")}>
          <Link href="/map">{nav("map")}</Link>
          <Link href="/search">{nav("search")}</Link>
          <Link href="/stats">{nav("stats")}</Link>
          <Link href="/blog">{nav("blog")}</Link>
          <Link href="/about">{nav("about")}</Link>
          <Link href="/faq">{nav("faq")}</Link>
          <Link href="/contact">{nav("contact")}</Link>
          {email && (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(
                `Unsubscribe — ${site.name}`
              )}`}
            >
              {t("unsubscribe")}
            </a>
          )}
        </nav>
      </div>

      <nav className="footer-legal" aria-label={t("legalLabel")}>
        <Link href="/privacy">{t("privacy")}</Link>
        <Link href="/terms">{t("terms")}</Link>
        <Link href="/affiliate-disclosure">{t("affiliateDisclosure")}</Link>
        <Link href="/cookie-policy">{t("cookiePolicy")}</Link>
      </nav>

      <div className="footer-bottom">
        <p className="footer-byline">{t("byline", { author: author.name })}</p>
        <p>
          © {year} {site.name} ·{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            {t("data")}
          </a>
        </p>
      </div>
    </footer>
  );
}
