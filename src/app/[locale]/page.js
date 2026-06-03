import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation.js";
import { site } from "../../lib/site.js";
import { listCountries, listFeatured } from "../../lib/data.js";
import MapClient from "../../components/MapClient.js";
import EmailSignup from "../../components/EmailSignup.js";
import FeaturedDestinations from "../../components/FeaturedDestinations.js";

export default async function Home({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const allCountries = await listCountries();
  const countries = allCountries.slice(0, 60);
  // listCountries() is ordered by count desc, so the first few are the
  // best-covered countries for this niche.
  const topCountries = allCountries.slice(0, 8);
  const featured = await listFeatured();
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
      {/* Compact hero: brand + tagline on a single ≤80px strip. The CTAs
          moved to the navbar and the map now dominates the viewport. */}
      <section className="hero">
        <div className="hero-brand">
          <span className="hero-emoji">{site.emoji}</span>
          <span className="hero-name">{site.name}</span>
          <span className="hero-tagline">{t("tagline")}</span>
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

      {featured.length > 0 && (
        <section className="container featured">
          <h2 className="prose">{t("featuredHeading")}</h2>
          <FeaturedDestinations items={featured} locale={locale} />
        </section>
      )}

      {topCountries.length > 0 && (
        <section className="container top-countries">
          <h2 className="prose">{t("popularCountries")}</h2>
          <div className="top-countries-row">
            {topCountries.map((c) => (
              <Link
                key={c.slug}
                href={`/explore/${c.slug}`}
                className="top-country"
              >
                <span className="tc-name">{c.name}</span>
                <span className="tc-count">
                  {c.count.toLocaleString()} {site.mappedNoun}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <EmailSignup />

      {countries.length > 0 && (
        <section className="container" id="countries">
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
