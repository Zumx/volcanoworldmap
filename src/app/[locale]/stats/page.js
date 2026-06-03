import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "../../../i18n/routing.js";
import { site } from "../../../lib/site.js";
import { listCountries, getDataMeta } from "../../../lib/data.js";
import { listPosts } from "../../../lib/blog.js";
import { continentOf, CONTINENTS } from "../../../lib/geo.js";
import AnimatedNumber from "../../../components/AnimatedNumber.js";

// Static, build-time stats. Refreshes daily so the "last updated" line and
// blog count track drip-published posts without a manual rebuild.
export const revalidate = 86400;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Distinct, theme-independent slice colours for the continent chart.
const PALETTE = [
  "#1f6feb",
  "#e94560",
  "#2ea043",
  "#f0883e",
  "#8957e5",
  "#0aa2c0",
  "#9aa0a6",
];

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const niche = cap(site.mappedNoun);
  const title = `${niche} in numbers — world statistics`;
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/stats`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/stats`;
  return {
    title,
    description: `Statistics for ${site.name}: how many ${site.mappedNoun} are mapped worldwide, the countries and continents covered, and how fresh the data is.`,
    alternates: { canonical: `/${locale}/stats`, languages },
    openGraph: { title, type: "website" },
  };
}

export default async function Stats({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("stats");
  const noun = site.mappedNoun;
  const niche = cap(noun);

  const allCountries = await listCountries();
  const meta = await getDataMeta();
  const posts = await listPosts(locale);

  const totalPlaces =
    meta.places || allCountries.reduce((s, c) => s + c.count, 0);
  const countryCount = meta.countries || allCountries.length;
  const postCount = posts.length;

  // Top 10 countries (already count-desc) for the bar chart.
  const top = allCountries.slice(0, 10);
  const maxCount = top.length ? top[0].count : 1;

  // Aggregate counts per continent for the pie chart.
  const byCont = {};
  for (const c of allCountries) {
    const cont = continentOf(c.name);
    byCont[cont] = (byCont[cont] || 0) + c.count;
  }
  const contTotal = Object.values(byCont).reduce((s, n) => s + n, 0) || 1;
  const contData = CONTINENTS.map((name) => ({ name, count: byCont[name] || 0 }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((d, i) => ({
      ...d,
      color: PALETTE[i % PALETTE.length],
      pct: (d.count / contTotal) * 100,
    }));

  // Build the conic-gradient slices (CSS-only pie, no chart library).
  let acc = 0;
  const slices = contData.map((d) => {
    const start = (acc / contTotal) * 100;
    acc += d.count;
    const end = (acc / contTotal) * 100;
    return `${d.color} ${start}% ${end}%`;
  });
  const pie = slices.length
    ? `conic-gradient(${slices.join(", ")})`
    : "var(--primary-light)";

  const base = `https://${site.domain}`;
  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${site.name} — ${noun} statistics`,
    description: `Aggregate statistics for ${totalPlaces.toLocaleString()} ${noun} across ${countryCount} countries, derived from OpenStreetMap.`,
    url: `${base}/${locale}/stats`,
    license: "https://opendatacommons.org/licenses/odbl/1-0/",
    isAccessibleForFree: true,
    creator: {
      "@type": "Organization",
      name: "OpenStreetMap contributors",
      url: "https://www.openstreetmap.org",
    },
    ...(meta.updated ? { dateModified: meta.updated } : {}),
    variableMeasured: [
      { "@type": "PropertyValue", name: "Mapped places", value: totalPlaces },
      { "@type": "PropertyValue", name: "Countries", value: countryCount },
    ],
  };

  const cards = [
    { value: totalPlaces, label: t("statPlaces", { noun }) },
    { value: countryCount, label: t("statCountries") },
    { value: postCount, label: t("statPosts") },
  ];

  return (
    <main className="container prose stats">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }}
      />

      <h1>{t("heading", { niche })}</h1>
      <p className="stats-intro">{t("intro", { noun, name: site.name })}</p>

      <section className="stat-cards" aria-label={t("heading", { niche })}>
        {cards.map((c, i) => (
          <div key={i} className="stat-card">
            <span className="stat-value">
              <AnimatedNumber value={c.value} />
            </span>
            <span className="stat-label">{c.label}</span>
          </div>
        ))}
        <div className="stat-card">
          <span className="stat-value stat-value--text">
            {meta.updated || "—"}
          </span>
          <span className="stat-label">{t("statUpdated")}</span>
        </div>
      </section>

      {top.length > 0 && (
        <section>
          <h2>{t("topCountries")}</h2>
          <ul className="bar-chart">
            {top.map((c) => (
              <li key={c.slug} className="bar-row">
                <span className="bar-label">{c.name}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(c.count / maxCount) * 100}%` }}
                  />
                </span>
                <span className="bar-value">{c.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contData.length > 0 && (
        <section>
          <h2>{t("byContinent")}</h2>
          <div className="continent-chart">
            <div
              className="continent-pie"
              style={{ background: pie }}
              role="img"
              aria-label={t("byContinent")}
            />
            <ul className="continent-legend">
              {contData.map((d) => (
                <li key={d.name}>
                  <span
                    className="legend-swatch"
                    style={{ background: d.color }}
                    aria-hidden="true"
                  />
                  <span className="legend-name">{d.name}</span>
                  <span className="legend-value">
                    {d.count.toLocaleString()} ({d.pct.toFixed(1)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
