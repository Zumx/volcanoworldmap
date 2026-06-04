import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../../../i18n/navigation.js";
import Breadcrumbs from "../../../../components/Breadcrumbs.js";
import { routing } from "../../../../i18n/routing.js";
import { site } from "../../../../lib/site.js";
import { listCountries, countryBySlug } from "../../../../lib/data.js";

// SEO landing pages for the best-covered countries. A static `explore` segment
// sibling to the dynamic `[country]` route, so the two never collide.
const TOP_N = 20;
export const dynamicParams = false; // only the top-N countries exist
export const revalidate = 86400;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Deep link into the full map (same format the LocationCard share button uses).
function mapHref(name, country) {
  const q = new URLSearchParams({ name });
  if (country) q.set("country", country);
  return `/map?${q.toString()}`;
}

export async function generateStaticParams() {
  // listCountries() is ordered by place count desc → the first 20 are the
  // most-covered countries for this niche.
  const countries = await listCountries();
  return countries.slice(0, TOP_N).map((c) => ({ country: c.slug }));
}

export async function generateMetadata({ params }) {
  const { locale, country } = await params;
  const data = await countryBySlug(country);
  if (!data) return {};
  const niche = cap(site.mappedNoun);
  const x = data.count.toLocaleString();
  const title = `Best ${niche} in ${data.name} — ${x} locations mapped`;
  const sample = [...(data.places || [])]
    .sort((a, b) => (b.pop || 0) - (a.pop || 0))
    .slice(0, 3)
    .map((p) => p.name)
    .filter(Boolean)
    .join(", ");
  const description = sample
    ? `Discover the best ${site.mappedNoun} in ${data.name}: ${x} locations mapped from OpenStreetMap, including ${sample}. Interactive map, top picks and direct links.`
    : `Discover the best ${site.mappedNoun} in ${data.name}: ${x} locations mapped from OpenStreetMap. Interactive map, top picks and direct links.`;
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/explore/${country}`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/explore/${country}`;
  return {
    title,
    description,
    alternates: { canonical: `/${locale}/explore/${country}`, languages },
    openGraph: { title, description, type: "website" },
  };
}

export default async function ExploreCountry({ params }) {
  const { locale, country } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("explore");
  const nav = await getTranslations("nav");
  const data = await countryBySlug(country);
  if (!data) notFound();

  const niche = cap(site.mappedNoun);
  const places = data.places || [];
  const top = [...places]
    .sort((a, b) => (b.pop || 0) - (a.pop || 0))
    .slice(0, 10);

  // Centroid of the country's places for the TouristDestination geo.
  let sumLat = 0;
  let sumLon = 0;
  let n = 0;
  for (const p of places) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      sumLat += p.lat;
      sumLon += p.lon;
      n++;
    }
  }
  const geo = n
    ? {
        latitude: Math.round((sumLat / n) * 1e5) / 1e5,
        longitude: Math.round((sumLon / n) * 1e5) / 1e5,
      }
    : null;

  const url = `https://${site.domain}/${locale}/explore/${country}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: `${niche} in ${data.name}`,
    description: `Explore ${data.count.toLocaleString()} ${site.mappedNoun} in ${data.name} on an interactive map.`,
    url,
    touristType: site.mappedNoun,
    ...(geo ? { geo: { "@type": "GeoCoordinates", ...geo } } : {}),
    containedInPlace: { "@type": "Country", name: data.name },
    includesAttraction: top.map((p) => ({
      "@type": "TouristAttraction",
      name: p.name,
    })),
  };

  const cta = (
    <Link className="btn btn-primary" href="/map">
      {t("cta", { count: data.count, noun: site.mappedNoun, country: data.name })}
    </Link>
  );

  return (
    <main className="container prose explore">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumbs
        locale={locale}
        items={[
          { name: nav("home"), href: "/" },
          { name: nav("countries"), href: "/#countries" },
          { name: data.name },
        ]}
      />

      <header className="explore-hero">
        <p className="explore-eyebrow">
          {site.emoji} {niche} · {data.name}
        </p>
        <h1>{t("title", { niche, country: data.name })}</h1>
        <p className="explore-count">
          {t("count", { count: data.count, noun: site.mappedNoun })}
        </p>
        <p>{cta}</p>
      </header>

      {top.length > 0 && (
        <section>
          <h2>{t("topHeading", { noun: niche, country: data.name })}</h2>
          <ol className="top-places">
            {top.map((p, i) => (
              <li key={i}>
                <Link href={mapHref(p.name, data.name)}>{p.name}</Link>
                {p.type && <span className="ptype">{p.type}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p>{cta}</p>
    </main>
  );
}
