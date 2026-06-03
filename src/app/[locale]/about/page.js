import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("about");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/about`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/about`;
  return {
    title: t("heading"),
    description: `About ${site.name} — an interactive world map of every ${site.mappedNoun}, sourced from OpenStreetMap.`,
    alternates: { canonical: `/${locale}/about`, languages },
  };
}

// OSM tag wiki page for this site's feature — the natural place for a
// contributor to learn how to add a missing one correctly.
const osmTagWiki = `https://wiki.openstreetmap.org/wiki/Tag:${site.osm.key}=${site.osm.value}`;

export default async function About({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  // Per-site override: site.config.json may set "aboutText" (string or
  // array of paragraphs) to replace the generic intro. Falls back to a
  // sensible generic description otherwise.
  const custom = site.aboutText;
  const intro = Array.isArray(custom)
    ? custom
    : custom
    ? [custom]
    : null;

  return (
    <main className="container prose">
      <h1>
        {t("heading")} {site.name} {site.emoji}
      </h1>

      {intro ? (
        intro.map((p, i) => <p key={i}>{p}</p>)
      ) : (
        <p>
          {site.name} is an interactive world map of every {site.mappedNoun},
          sourced live from{" "}
          <a
            href="https://www.openstreetmap.org"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>{" "}
          (the{" "}
          <a href={osmTagWiki} target="_blank" rel="noreferrer">
            <code>
              {site.osm.key}={site.osm.value}
            </code>
          </a>{" "}
          tag).
        </p>
      )}

      <h2>{t("howHeading")}</h2>
      <p>
        Every point is fetched from the OpenStreetMap Overpass API,
        deduplicated, tagged by country and stored as a static GeoJSON file —
        no database, instant to load. Click any point to see a description from
        Wikipedia, a photo from Wikimedia Commons (or Mapillary as a fallback)
        and, where available, its Google rating.
      </p>

      <h2>{t("freshHeading")}</h2>
      <p>
        The dataset is automatically refreshed once a month from OpenStreetMap
        via a scheduled GitHub Action, so the map stays current as the world is
        mapped.
      </p>

      <h2>{t("contributeHeading")}</h2>
      <p>{t("contributeBody", { noun: site.mappedNoun })}</p>
      <p>
        <a
          className="btn btn-primary"
          href="https://www.openstreetmap.org/edit"
          target="_blank"
          rel="noreferrer"
        >
          {t("contributeCta")}
        </a>
      </p>
      <p>
        New to OpenStreetMap? See the{" "}
        <a href={osmTagWiki} target="_blank" rel="noreferrer">
          how-to-tag guide for {site.mappedNoun}
        </a>
        . Edits show up here at the next monthly refresh.
      </p>

      <h2>{t("reportHeading")}</h2>
      <p>{t("reportBody", { noun: site.mappedNoun })}</p>
      <p>
        <a
          className="btn btn-primary"
          href="https://www.openstreetmap.org/note/new"
          target="_blank"
          rel="noreferrer"
        >
          {t("reportCta")}
        </a>
      </p>

      <h2>{t("contactHeading")}</h2>
      <p>
        {t("contactBody")}
        {site.contactEmail && (
          <>
            {" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </>
        )}
      </p>

      <h2>{t("creditsHeading")}</h2>
      <ul>
        <li>Map data © OpenStreetMap contributors (ODbL)</li>
        <li>Descriptions &amp; images: Wikipedia / Wikimedia Commons</li>
        <li>Street-level photos: Mapillary</li>
        <li>Ratings: Google Places</li>
      </ul>
    </main>
  );
}
