import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";
import Breadcrumbs from "../../../components/Breadcrumbs.js";

// Bump when the terms text in messages/*.json changes.
const LAST_UPDATED = "2026-06-10";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("terms");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/terms`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/terms`;
  return {
    title: t("heading"),
    description: t("intro", { name: site.name }),
    alternates: { canonical: `/${locale}/terms`, languages },
  };
}

export default async function Terms({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("terms");
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

      <h2>{t("asIsTitle")}</h2>
      <p>{t("asIsBody")}</p>

      <h2>{t("dataTitle")}</h2>
      <p>
        {t("dataBody")}{" "}
        <a
          href="https://opendatacommons.org/licenses/odbl/1-0/"
          target="_blank"
          rel="noreferrer"
        >
          ODbL
        </a>
        {" · "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA
        </a>
      </p>

      <h2>{t("accuracyTitle")}</h2>
      <p>{t("accuracyBody")}</p>

      <h2>{t("liabilityTitle")}</h2>
      <p>{t("liabilityBody")}</p>

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
