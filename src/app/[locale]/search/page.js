import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Breadcrumbs from "../../../components/Breadcrumbs.js";
import SearchClient from "../../../components/SearchClient.js";
import { routing } from "../../../i18n/routing.js";
import { site } from "../../../lib/site.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("search");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/search`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/search`;
  return {
    title: t("title"),
    description: t("metaDescription", { name: site.name }),
    alternates: { canonical: `/${locale}/search`, languages },
  };
}

export default async function SearchPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("search");
  const nav = await getTranslations("nav");

  // SearchResultsPage structured data. The query itself is applied
  // client-side (?q=…), so the static document describes the search tool.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SearchResultsPage",
    name: `${t("title")} · ${site.name}`,
    url: `https://${site.domain}/${locale}/search`,
    isPartOf: {
      "@type": "WebSite",
      name: site.name,
      url: `https://${site.domain}`,
    },
  };

  return (
    <main className="container search-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumbs
        locale={locale}
        items={[{ name: nav("home"), href: "/" }, { name: t("title") }]}
      />
      <div className="prose">
        <h1>{t("heading")}</h1>
      </div>
      <Suspense fallback={null}>
        <SearchClient locale={locale} />
      </Suspense>
    </main>
  );
}
