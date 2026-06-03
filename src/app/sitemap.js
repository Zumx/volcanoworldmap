import { site } from "../lib/site.js";
import { routing } from "../i18n/routing.js";
import { listCountries } from "../lib/data.js";
import { listPosts } from "../lib/blog.js";

// ISR: refresh the sitemap daily so newly drip-published posts get picked
// up by crawlers without a rebuild.
export const revalidate = 86400;

export default async function sitemap() {
  const base = `https://${site.domain}`;
  const countries = await listCountries();

  // Per-locale post sets so we only emit URLs that actually exist, and so
  // hreflang alternates point at sibling URLs that 200, not at 404s.
  const postsByLocale = {};
  for (const locale of routing.locales) {
    postsByLocale[locale] = await listPosts(locale);
  }

  // slug -> { locales: [...], canonical: string } so we can attach
  // alternates.languages to each per-locale entry.
  const slugLocales = {};
  for (const locale of routing.locales) {
    for (const p of postsByLocale[locale]) {
      if (!slugLocales[p.slug]) slugLocales[p.slug] = [];
      slugLocales[p.slug].push(locale);
    }
  }

  const urls = [];

  for (const locale of routing.locales) {
    const prefix = `/${locale}`;

    // Locale-shared site sections — alternates are the same set for every
    // section page on every locale.
    const sectionLanguages = Object.fromEntries(
      routing.locales.map((l) => [l, `${base}/${l}`])
    );
    sectionLanguages["x-default"] = `${base}/${routing.defaultLocale}`;
    urls.push({
      url: `${base}${prefix}`,
      changeFrequency: "daily",
      priority: 1,
      alternates: { languages: sectionLanguages },
    });

    for (const section of ["map", "blog", "about"]) {
      const langs = Object.fromEntries(
        routing.locales.map((l) => [l, `${base}/${l}/${section}`])
      );
      langs["x-default"] = `${base}/${routing.defaultLocale}/${section}`;
      urls.push({
        url: `${base}${prefix}/${section}`,
        changeFrequency:
          section === "map" ? "weekly" : section === "about" ? "yearly" : "monthly",
        priority: section === "map" ? 0.9 : section === "blog" ? 0.6 : 0.4,
        alternates: { languages: langs },
      });
    }

    for (const c of countries) {
      const langs = Object.fromEntries(
        routing.locales.map((l) => [l, `${base}/${l}/${c.slug}`])
      );
      langs["x-default"] = `${base}/${routing.defaultLocale}/${c.slug}`;
      urls.push({
        url: `${base}${prefix}/${c.slug}`,
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: { languages: langs },
      });
    }

    for (const p of postsByLocale[locale]) {
      const presentIn = slugLocales[p.slug] || [locale];
      const langs = Object.fromEntries(
        presentIn.map((l) => [l, `${base}/${l}/blog/${p.slug}`])
      );
      if (presentIn.includes(routing.defaultLocale)) {
        langs["x-default"] = `${base}/${routing.defaultLocale}/blog/${p.slug}`;
      }
      urls.push({
        url: `${base}${prefix}/blog/${p.slug}`,
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages: langs },
      });
    }
  }

  return urls;
}
