import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";
import Breadcrumbs from "../../../components/Breadcrumbs.js";

// Bump when the policy text in messages/*.json changes.
const LAST_UPDATED = "2026-06-10";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("privacy");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/privacy`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/privacy`;
  return {
    title: t("heading"),
    description: t("intro", { name: site.name }),
    alternates: { canonical: `/${locale}/privacy`, languages },
  };
}

export default async function Privacy({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");
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

      <h2>{t("collectTitle")}</h2>
      <p>{t("collectBody")}</p>

      <h2>{t("cookiesTitle")}</h2>
      <p>{t("cookiesBody")}</p>

      <h2>{t("thirdTitle")}</h2>
      <p>{t("thirdBody")}</p>
      <ul>
        <li>{t("thirdAnalytics")}</li>
        <li>{t("thirdWiki")}</li>
        <li>{t("thirdOsm")}</li>
      </ul>

      <h2>{t("rightsTitle")}</h2>
      <p>{t("rightsBody")}</p>
      <ul>
        <li>{t("rightsAccess")}</li>
        <li>{t("rightsErasure")}</li>
        <li>{t("rightsObjection")}</li>
        <li>{t("rightsComplaint")}</li>
      </ul>

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
