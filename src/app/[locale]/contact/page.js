import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";
import Breadcrumbs from "../../../components/Breadcrumbs.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("contact");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/contact`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/contact`;
  return {
    title: t("heading"),
    description: t("intro", { name: site.name }),
    alternates: { canonical: `/${locale}/contact`, languages },
  };
}

export default async function Contact({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  const nav = await getTranslations("nav");
  const email = site.contactEmail;

  return (
    <main className="container prose">
      <Breadcrumbs
        locale={locale}
        items={[{ name: nav("home"), href: "/" }, { name: t("heading") }]}
      />
      <h1>{t("heading")}</h1>
      <p>{t("intro", { name: site.name })}</p>

      <h2>{t("emailTitle")}</h2>
      <p>{t("emailBody")}</p>
      {email && (
        <p>
          <a className="btn btn-primary" href={`mailto:${email}`}>
            {email}
          </a>
        </p>
      )}
      <p>{t("responseBody")}</p>

      <h2>{t("dataTitle")}</h2>
      <p>{t("dataBody", { noun: site.mappedNoun })}</p>
      <p>
        <a
          className="btn btn-primary"
          href="https://www.openstreetmap.org/note/new"
          target="_blank"
          rel="noreferrer"
        >
          {t("dataCta")}
        </a>
      </p>

      <h2>{t("faqTitle")}</h2>
      <p>
        {t("faqBody")} <a href={`/${locale}/faq`}>{t("faqCta")}</a>
      </p>
    </main>
  );
}
