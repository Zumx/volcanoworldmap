import { useTranslations } from "next-intl";
import { Link } from "../i18n/navigation.js";
import { site } from "../lib/site.js";

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
          <Link href="/stats">{nav("stats")}</Link>
          <Link href="/blog">{nav("blog")}</Link>
          <Link href="/about">{nav("about")}</Link>
          <Link href="/faq">{nav("faq")}</Link>
          {email && <a href={`mailto:${email}`}>{t("contact")}</a>}
        </nav>
      </div>

      <div className="footer-bottom">
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
