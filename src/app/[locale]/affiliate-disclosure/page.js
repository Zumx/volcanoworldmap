import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";
import Breadcrumbs from "../../../components/Breadcrumbs.js";

// Bump when the disclosure text in messages/*.json changes.
const LAST_UPDATED = "2026-06-10";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("affiliate");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/affiliate-disclosure`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/affiliate-disclosure`;
  return {
    title: t("heading"),
    description: t("p1", { name: site.name }),
    alternates: { canonical: `/${locale}/affiliate-disclosure`, languages },
  };
}

export default async function AffiliateDisclosure({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("affiliate");
  const nav = await getTranslations("nav");

  return (
    <main className="container prose">
      <Breadcrumbs
        locale={locale}
        items={[{ name: nav("home"), href: "/" }, { name: t("heading") }]}
      />
      <h1>{t("heading")}</h1>
      <p className="post-meta">{t("updated", { date: LAST_UPDATED })}</p>
      <p>{t("p1", { name: site.name })}</p>
      <p>{t("p2")}</p>
      <p>{t("p3")}</p>
      <p>
        {t("contactBody")}{" "}
        {site.contactEmail && (
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        )}
      </p>
    </main>
  );
}
