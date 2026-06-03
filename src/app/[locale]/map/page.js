import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "../../../i18n/routing.js";
import { site } from "../../../lib/site.js";
import { listCountries } from "../../../lib/data.js";
import MapClient from "../../../components/MapClient.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/map`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/map`;
  return {
    title: t("map"),
    alternates: { canonical: `/${locale}/map`, languages },
  };
}

export default async function MapPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Dataset size for the schema: total mapped places and how many countries
  // they span (read from the prebuilt country index, same source as the home
  // page stats).
  const countries = await listCountries();
  const countryCount = countries.length;
  const placeCount = countries.reduce((s, c) => s + c.count, 0);

  // schema.org Map — tells search engines this page IS an interactive map of
  // the site's subject, not just an article mentioning one. geo points at the
  // world-centred default view the map opens on; additionalProperty carries
  // the place/country counts.
  const base = `https://${site.domain}`;
  const mapLd = {
    "@context": "https://schema.org",
    "@type": "Map",
    name: `${site.name} — interactive map`,
    description: `An interactive world map of ${placeCount.toLocaleString()} ${site.mappedNoun} across ${countryCount} countries, sourced from OpenStreetMap.`,
    url: `${base}/${locale}/map`,
    inLanguage: locale,
    isAccessibleForFree: true,
    geo: {
      "@type": "GeoCoordinates",
      latitude: 0,
      longitude: 0,
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Mapped places",
        value: placeCount,
      },
      {
        "@type": "PropertyValue",
        name: "Countries",
        value: countryCount,
      },
    ],
  };

  return (
    <main
      style={{
        position: "relative",
        height: "calc(100vh - 57px)",
        width: "100%",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(mapLd) }}
      />
      <MapClient />
    </main>
  );
}
