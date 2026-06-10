import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";
import Breadcrumbs from "../../../components/Breadcrumbs.js";

// Bump when the cookie-policy text in messages/*.json changes.
const LAST_UPDATED = "2026-06-10";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("cookiePolicy");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/cookie-policy`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/cookie-policy`;
  return {
    title: t("heading"),
    description: t("intro", { name: site.name }),
    alternates: { canonical: `/${locale}/cookie-policy`, languages },
  };
}

export default async function CookiePolicy({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cookiePolicy");
  const nav = await getTranslations("nav");

  return (
    <main className="container prose">
      <Breadcrumbs
        locale={locale}
        items={[{ name: nav("home"), href: "/" }, { name: t("heading") }]}
      />
      <h1>{t("heading")}</h1>
      <p className="post-meta">{t("updated", { date: LAST_UPDATED })}</p>
      <p>{t("intro", { name: site.name })}</p>

      <h2>{t("whichTitle")}</h2>
      <ul>
        <li>{t("whichAnalytics")}</li>
        <li>{t("whichConsent")}</li>
      </ul>

      <h2>{t("changeTitle")}</h2>
      <p>{t("changeBody")}</p>

      <h2>{t("contactTitle")}</h2>
      <p>
        {t("contactBody")}{" "}
        {site.contactEmail && (
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        )}
      </p>
    </main>
  );
}
