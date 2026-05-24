import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../../i18n/navigation.js";
import { routing } from "../../../i18n/routing.js";
import { site } from "../../../lib/site.js";
import { listCountries, countryBySlug } from "../../../lib/data.js";

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
  const description = `Explore ${x} ${site.mappedNoun} in ${data.name}. Interactive map with photos and information.`;
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
  const data = await countryBySlug(country);
  if (!data) notFound();

  const places = data.places || [];

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/">{t("back")}</Link>
      <h1>{t("heading", { noun: cap(site.mappedNoun), country: data.name })}</h1>
      <p>
        <strong>
          {t("count", { count: data.count, noun: site.mappedNoun })}
        </strong>
      </p>
      <p>{t("intro", { country: data.name })}</p>
      <p>
        <Link className="btn btn-primary" href="/map">
          {site.emoji} {t("openOnMap")}
        </Link>
      </p>

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
                <Link href="/map">{p.name}</Link>{" "}
                <span className="coords">
                  ({p.lat.toFixed(4)}, {p.lon.toFixed(4)})
                </span>
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
    </main>
  );
}
