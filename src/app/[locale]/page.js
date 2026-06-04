import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation.js";
import { site } from "../../lib/site.js";
import { listCountries, listFeatured } from "../../lib/data.js";
import { listPosts } from "../../lib/blog.js";
import MapClient from "../../components/MapClient.js";
import EmailSignup from "../../components/EmailSignup.js";
import FeaturedDestinations from "../../components/FeaturedDestinations.js";

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

  // Static social proof. Kept niche-agnostic so the same three reviews read
  // naturally on every site in the fleet.
  const testimonials = [
    { quote: t("t1Quote"), name: t("t1Name"), role: t("t1Role") },
    { quote: t("t2Quote"), name: t("t2Name"), role: t("t2Role") },
    { quote: t("t3Quote"), name: t("t3Name"), role: t("t3Role") },
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

  return (
    <main className="page-fade-in">
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

      {/* Testimonials — static social proof */}
      <section className="container testimonials">
        <h2 className="prose">{t("testimonialsHeading")}</h2>
        <div className="testimonial-grid">
          {testimonials.map((r, i) => (
            <figure className="testimonial" key={i}>
              <div className="testimonial-stars" aria-label="5 / 5">
                <span aria-hidden="true">★★★★★</span>
              </div>
              <blockquote>{r.quote}</blockquote>
              <figcaption>
                <span className="testimonial-name">{r.name}</span>
                <span className="testimonial-role">{r.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

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
