import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation.js";
import { site } from "../../lib/site.js";

// Rendered inside [locale]/layout whenever notFound() is thrown (an unknown
// country slug, an unmatched localized path, a missing blog post), so it
// inherits the header, footer and locale context. getLocale()/getTranslations
// read that request context — no params are passed to not-found components.
export default async function NotFound() {
  const t = await getTranslations("notFound");
  const nav = await getTranslations("nav");
  const locale = await getLocale();

  return (
    <main className="container notfound">
      <div className="notfound-emoji" aria-hidden="true">
        {site.emoji}
      </div>
      <p className="notfound-code">404</p>
      <h1>{t("title")}</h1>
      <p className="notfound-body">{t("body")}</p>
      <div className="notfound-actions">
        <Link className="btn btn-primary" href="/" locale={locale}>
          {nav("home")}
        </Link>
        <Link className="btn btn-outline" href="/map" locale={locale}>
          {nav("map")}
        </Link>
      </div>
    </main>
  );
}
