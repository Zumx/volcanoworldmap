import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation.js";
import { site, author } from "../../lib/site.js";
import { listCountries, listFeatured } from "../../lib/data.js";
import { listPosts } from "../../lib/blog.js";
import MapClient from "../../components/MapClient.js";
import EmailSignup from "../../components/EmailSignup.js";
import FeaturedDestinations from "../../components/FeaturedDestinations.js";

// The home page surfaces "latest posts" + live totals, so refresh hourly.
// Vercel maps this to s-maxage=3600 + stale-while-revalidate on the CDN.
export const revalidate = 3600;

// Home-page meta description: localized and data-driven (live place/country
// counts). Only `description` is returned so the layout's openGraph/title
// metadata is inherited rather than clobbered (Next replaces nested keys).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  const allCountries = await listCountries();
  const total = allCountries.reduce((s, c) => s + c.count, 0);
  return {
    description: t("metaDescription", {
      total,
      countries: allCountries.length,
      noun: site.mappedNoun,
    }),
  };
}

export default async function Home({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const nav = await getTranslations("nav");
  const allCountries = await listCountries();
  const countries = allCountries.slice(0, 60);
  // listCountries() is ordered by count desc, so the first few are the
  // best-covered countries for this niche.
  const topCountries = allCountries.slice(0, 8);
  const featured = await listFeatured();
  const latestPosts = (await listPosts(locale)).slice(0, 3);
  const total = allCountries.reduce((s, c) => s + c.count, 0);
  const base = `https://${site.domain}`;

  // "How it works" — three steps, paired with the same emoji vocabulary used
  // across the UI. Body copy is interpolated with the site's mapped-noun.
  const steps = [
    { icon: "🗺️", title: t("step1Title"), body: t("step1Body", { noun: site.mappedNoun }) },
    { icon: "📍", title: t("step2Title"), body: t("step2Body", { noun: site.mappedNoun }) },
    { icon: "🎟️", title: t("step3Title"), body: t("step3Body", { noun: site.mappedNoun }) },
  ];

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

  // Organization — the publisher behind the site, with logo + contact point so
  // Google can build a knowledge-panel entity for the brand.
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: base,
    logo: `${base}/brandmark.svg`,
    founder: {
      "@type": "Person",
      name: author.name,
      url: `${base}/${locale}/about`,
    },
    ...(site.contactEmail
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            email: site.contactEmail,
            contactType: "customer support",
            availableLanguage: site.locales || ["en"],
          },
        }
      : {}),
  };

  // WebSite + SearchAction — makes the home page eligible for Google's
  // sitelinks searchbox, wired to the map's place search (?name=…).
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: `${base}/${locale}`,
    inLanguage: locale,
    publisher: { "@type": "Organization", name: site.name, url: base },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/${locale}/map?name={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main className="page-fade-in">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      {/* Compact hero: brand + tagline on a single ≤80px strip. The CTAs
          moved to the navbar and the map now dominates the viewport. */}
      <section className="hero">
        <div className="hero-brand">
          <span className="hero-emoji">{site.emoji}</span>
          <span className="hero-name">{site.name}</span>
          <span className="hero-tagline">
            {t("tagline", { total, noun: site.mappedNoun })}
          </span>
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

      <p className="home-statslink">
        <Link className="btn btn-sm btn-outline" href="/stats">
          📊 {nav("stats")}
        </Link>
      </p>

      {/* How it works — Explore → Discover → Book */}
      <section className="container how-it-works">
        <h2 className="prose">{t("howHeading")}</h2>
        <p className="section-sub">{t("howSub")}</p>
        <ol className="how-steps">
          {steps.map((s, i) => (
            <li className="how-step" key={i}>
              <span className="how-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="how-step-icon" aria-hidden="true">
                {s.icon}
              </span>
              <h3 className="how-step-title">{s.title}</h3>
              <p className="how-step-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

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

      {latestPosts.length > 0 && (
        <section className="container latest-posts">
          <h2 className="prose">{t("latestHeading")}</h2>
          <div className="latest-grid">
            {latestPosts.map((post) => (
              <article className="latest-card" key={post.slug}>
                <h3>
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h3>
                {post.date && (
                  <div className="latest-meta">
                    <time dateTime={post.date}>{post.date}</time>
                  </div>
                )}
                {post.excerpt && (
                  <p className="latest-excerpt">{post.excerpt}</p>
                )}
                <Link className="latest-readmore" href={`/blog/${post.slug}`}>
                  {t("readMore")}
                </Link>
              </article>
            ))}
          </div>
          <p className="latest-all">
            <Link className="btn btn-sm btn-outline" href="/blog">
              {t("viewAllPosts")}
            </Link>
          </p>
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
