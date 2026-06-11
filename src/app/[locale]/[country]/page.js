import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../../i18n/navigation.js";
import Breadcrumbs from "../../../components/Breadcrumbs.js";
import CountryMiniMap from "../../../components/CountryMiniMap.js";
import { routing } from "../../../i18n/routing.js";
import { site, jsonLdSafe } from "../../../lib/site.js";
import { listCountries, countryBySlug } from "../../../lib/data.js";
import { relatedPostsForCountry } from "../../../lib/blog.js";

// Place deep-link into the full map (reuses the LocationCard share format).
function mapHref(name, country) {
  const q = new URLSearchParams({ name });
  if (country) q.set("country", country);
  return `/map?${q.toString()}`;
}

export async function generateStaticParams() {
  const countries = await listCountries();
  return countries.map((c) => ({ country: c.slug }));
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export async function generateMetadata({ params }) {
  const { locale, country } = await params;
  const data = await countryBySlug(country);
  if (!data) return {};
  const niche = cap(site.mappedNoun);
  const x = data.count.toLocaleString();
  const title = `${niche} in ${data.name} — ${x} locations on the map`;
  // Per-country + per-niche description, naming the country's most notable
  // places (highest popularity score first, falling back to the alphabetical
  // order) so each country page has a distinct, specific meta description.
  const sample = [...(data.places || [])]
    .sort((a, b) => (b.pop || 0) - (a.pop || 0))
    .slice(0, 3)
    .map((p) => p.name)
    .filter(Boolean)
    .join(", ");
  const description = sample
    ? `Explore ${x} ${site.mappedNoun} in ${data.name} on an interactive map — including ${sample}. Photos, ratings and details for every location.`
    : `Explore ${x} ${site.mappedNoun} in ${data.name} on an interactive map. Photos, ratings and details for every location.`;
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/${country}`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/${country}`;
  return {
    title,
    description,
    alternates: { canonical: `/${locale}/${country}`, languages },
    openGraph: { title, description, type: "website" },
  };
}

export default async function CountryPage({ params }) {
  const { locale, country } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("country");
  const nav = await getTranslations("nav");
  const data = await countryBySlug(country);
  if (!data) notFound();

  const places = data.places || [];
  // "Most popular" — sort a copy by the popularity score baked into the index
  // (Google reviews/rating/website). Falls back to alphabetical when no place
  // carries a score. Only worth a separate section when the list is long.
  const top =
    places.length > 12
      ? [...places].sort((a, b) => (b.pop || 0) - (a.pop || 0)).slice(0, 10)
      : [];
  const relatedReading = await relatedPostsForCountry(
    locale,
    country,
    data.name,
    4
  );

  // Mini-stats: the most-represented place type, derived from the sampled
  // places (the index caps `places`, but the distribution is representative).
  const typeCounts = new Map();
  for (const pl of places) {
    if (pl.type) typeCounts.set(pl.type, (typeCounts.get(pl.type) || 0) + 1);
  }
  let topType = null;
  for (const [type, n] of typeCounts) {
    if (!topType || n > topType.n) topType = { type, n };
  }

  // Related countries: the three with the closest total count to this one
  // (similar coverage), plus whether this country has an /explore landing page
  // (only the top-20 best-covered countries do — see explore route).
  const allCountries = await listCountries();
  const rank = allCountries.findIndex((c) => c.slug === country);
  const hasExplore = rank > -1 && rank < 20;
  const related = allCountries
    .filter((c) => c.slug !== country)
    .map((c) => ({ ...c, diff: Math.abs(c.count - data.count) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3);

  // Place / ItemList structured data (capped to keep the HTML lean).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cap(site.mappedNoun)} in ${data.name}`,
    numberOfItems: data.count,
    itemListElement: places.slice(0, 200).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Place",
        name: p.name,
        address: { "@type": "PostalAddress", addressCountry: data.name },
        geo: {
          "@type": "GeoCoordinates",
          latitude: p.lat,
          longitude: p.lon,
        },
      },
    })),
  };

  return (
    <main className="container prose">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />
      <Breadcrumbs
        locale={locale}
        items={[
          { name: nav("home"), href: "/" },
          { name: nav("countries"), href: "/#countries" },
          { name: data.name },
        ]}
      />
      <Link href="/">{t("back")}</Link>
      <h1>{t("heading", { noun: cap(site.mappedNoun), country: data.name })}</h1>
      <p>
        <strong>
          {t("count", { count: data.count, noun: site.mappedNoun })}
        </strong>
      </p>
      <p>{t("intro", { country: data.name })}</p>

      {/* Mini-stats: total mapped places + most-represented type. */}
      <div className="country-stats">
        <div className="cstat">
          <span className="cstat-v">{data.count.toLocaleString()}</span>
          <span className="cstat-l">
            {t("statPlaces", { noun: site.mappedNoun })}
          </span>
        </div>
        {topType && (
          <div className="cstat">
            <span className="cstat-v">{topType.type}</span>
            <span className="cstat-l">{t("statTopType")}</span>
          </div>
        )}
      </div>

      <p className="country-cta-row">
        <Link className="btn btn-primary" href="/map">
          {site.emoji} {t("openOnMap")}
        </Link>
        {hasExplore && (
          <Link className="btn btn-outline" href={`/explore/${country}`}>
            {t("exploreCta", { country: data.name })}
          </Link>
        )}
      </p>

      {places.length > 0 && (
        <CountryMiniMap points={places} country={data.name} locale={locale} />
      )}

      {top.length > 0 && (
        <>
          <h2>{t("topHeading", { noun: cap(site.mappedNoun) })}</h2>
          <ol className="top-places">
            {top.map((p, i) => (
              <li key={i}>
                <Link href={mapHref(p.name, data.name)}>{p.name}</Link>
                {p.type && <span className="ptype">{p.type}</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      {places.length > 0 && (
        <>
          <h2>
            {t("listHeading", {
              noun: cap(site.mappedNoun),
              country: data.name,
            })}
          </h2>
          <ul className="country-places">
            {places.map((p, i) => (
              <li key={i}>
                <Link href={mapHref(p.name, data.name)}>{p.name}</Link>{" "}
                {p.type ? (
                  <span className="ptype">{p.type}</span>
                ) : (
                  <span className="coords">
                    ({p.lat.toFixed(4)}, {p.lon.toFixed(4)})
                  </span>
                )}
              </li>
            ))}
          </ul>
          {data.count > places.length && (
            <p className="more-note">
              {t("moreNote", { shown: places.length, total: data.count })}
            </p>
          )}
        </>
      )}

      {related.length > 0 && (
        <section className="related-countries">
          <h2>{t("relatedCountries")}</h2>
          <div className="related-countries-row">
            {related.map((c) => (
              <Link key={c.slug} href={`/${c.slug}`} className="related-country">
                <span className="rc-name">{c.name}</span>
                <span className="rc-count">
                  {t("count", { count: c.count, noun: site.mappedNoun })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {relatedReading.length > 0 && (
        <aside className="related-posts">
          <h2>{t("relatedReading")}</h2>
          <ul>
            {relatedReading.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
                {p.date && <span className="post-meta"> · {p.date}</span>}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
