import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation.js";
import { site } from "../../lib/site.js";
import { listCountries } from "../../lib/data.js";
import MapClient from "../../components/MapClient.js";

export default async function Home({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const allCountries = await listCountries();
  const countries = allCountries.slice(0, 60);
  const total = allCountries.reduce((s, c) => s + c.count, 0);
  const base = `https://${site.domain}`;

  // schema.org Dataset — tells search engines this is a structured,
  // open-licensed geographic dataset rather than just a web page.
  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${site.name} — ${site.mappedNoun} of the world`,
    description: `A continuously updated open dataset of ${total.toLocaleString()} ${site.mappedNoun} worldwide, derived from OpenStreetMap (${site.osm.key}=${site.osm.value}) across ${allCountries.length} countries.`,
    url: base,
    license: "https://opendatacommons.org/licenses/odbl/1-0/",
    isAccessibleForFree: true,
    keywords: [site.mappedNoun, "map", "OpenStreetMap", "geodata"],
    creator: {
      "@type": "Organization",
      name: "OpenStreetMap contributors",
      url: "https://www.openstreetmap.org",
    },
    spatialCoverage: { "@type": "Place", name: "Worldwide" },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/geo+json",
      contentUrl: `${base}/data/points.geojson`,
    },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }}
      />
      <section className="hero">
        <div className="hero-brand">
          <span className="hero-emoji">{site.emoji}</span>
          <span className="hero-name">{site.name}</span>
          <span className="hero-tagline">{t("tagline")}</span>
        </div>
        <div className="hero-actions">
          <Link className="btn btn-sm btn-primary" href="/map">
            {t("ctaMap")}
          </Link>
          <Link className="btn btn-sm btn-ghost" href="/blog">
            {t("ctaBlog")}
          </Link>
        </div>
      </section>

      <div className="home-map">
        <MapClient embedded />
        <div className="home-stats" aria-hidden="false">
          <span className="stat">
            <strong>{total.toLocaleString()}</strong> {site.mappedNoun}
          </span>
          <span className="stat">
            <strong>{allCountries.length}</strong> {t("statsCountries")}
          </span>
        </div>
      </div>

      {countries.length > 0 && (
        <section className="container">
          <h2 className="prose">{t("countriesHeading")}</h2>
          <div className="country-grid">
            {countries.map((c) => (
              <Link key={c.slug} href={`/${c.slug}`}>
                <span className="c-name">{c.name}</span>
                <span className="c-count">
                  {c.count.toLocaleString()} {site.mappedNoun}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
