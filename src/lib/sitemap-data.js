// Shared builders + XML serializers for the split sitemap. The single
// Next-convention sitemap was replaced by a sitemap index (/sitemap.xml) that
// points at four part files (pages, blog, countries, explore), each served by
// its own route handler. Splitting keeps every file well under the 50k-URL /
// 50MB limits and lets crawlers fetch only what changed.
import { site } from "./site.js";
import { routing } from "../i18n/routing.js";
import { listCountries } from "./data.js";
import { listPosts } from "./blog.js";

export const BASE = `https://${site.domain}`;

// Static, locale-shared sections. "" is the locale root. priority/changefreq
// mirror the previous single sitemap, with faq/stats/search added.
const SECTIONS = [
  { path: "", changefreq: "daily", priority: 1 },
  { path: "map", changefreq: "weekly", priority: 0.9 },
  { path: "blog", changefreq: "monthly", priority: 0.6 },
  { path: "search", changefreq: "monthly", priority: 0.5 },
  { path: "stats", changefreq: "weekly", priority: 0.5 },
  { path: "faq", changefreq: "yearly", priority: 0.4 },
  { path: "about", changefreq: "yearly", priority: 0.4 },
  { path: "privacy", changefreq: "yearly", priority: 0.2 },
  { path: "terms", changefreq: "yearly", priority: 0.2 },
  { path: "affiliate-disclosure", changefreq: "yearly", priority: 0.2 },
  { path: "cookie-policy", changefreq: "yearly", priority: 0.2 },
];

const EXPLORE_TOP_N = 20; // must match the explore route's TOP_N

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Build a <urlset> document, including xhtml:link hreflang alternates.
export function urlsetXml(entries) {
  const body = entries
    .map((e) => {
      const alts = (e.alternates || [])
        .map(
          (a) =>
            `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${xmlEscape(
              a.href
            )}"/>`
        )
        .join("");
      return (
        `<url><loc>${xmlEscape(e.loc)}</loc>` +
        (e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "") +
        (e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : "") +
        (e.priority != null ? `<priority>${e.priority}</priority>` : "") +
        alts +
        `</url>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`
  );
}

// Build the <sitemapindex> document.
export function sitemapIndexXml(parts) {
  const body = parts
    .map((p) => `<sitemap><loc>${xmlEscape(p)}</loc></sitemap>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
  );
}

function localesLanguages(suffix) {
  const langs = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE}/${l}${suffix}`])
  );
  langs["x-default"] = `${BASE}/${routing.defaultLocale}${suffix}`;
  return langs;
}

function altList(languages) {
  return Object.entries(languages).map(([hreflang, href]) => ({
    hreflang,
    href,
  }));
}

// ---- Per-part entry builders ----

export function buildPagesEntries() {
  const entries = [];
  for (const locale of routing.locales) {
    for (const s of SECTIONS) {
      const suffix = s.path ? `/${s.path}` : "";
      entries.push({
        loc: `${BASE}/${locale}${suffix}`,
        changefreq: s.changefreq,
        priority: s.priority,
        alternates: altList(localesLanguages(suffix)),
      });
    }
  }
  return entries;
}

export async function buildCountriesEntries() {
  const countries = await listCountries();
  const entries = [];
  for (const locale of routing.locales) {
    for (const c of countries) {
      entries.push({
        loc: `${BASE}/${locale}/${c.slug}`,
        changefreq: "monthly",
        priority: 0.6,
        alternates: altList(localesLanguages(`/${c.slug}`)),
      });
    }
  }
  return entries;
}

export async function buildExploreEntries() {
  const countries = await listCountries();
  const top = countries.slice(0, EXPLORE_TOP_N);
  const entries = [];
  for (const locale of routing.locales) {
    for (const c of top) {
      entries.push({
        loc: `${BASE}/${locale}/explore/${c.slug}`,
        changefreq: "weekly",
        priority: 0.7,
        alternates: altList(localesLanguages(`/explore/${c.slug}`)),
      });
    }
  }
  return entries;
}

export async function buildBlogEntries() {
  // Per-locale post sets, so alternates only point at sibling URLs that 200.
  const postsByLocale = {};
  const slugLocales = {};
  for (const locale of routing.locales) {
    postsByLocale[locale] = await listPosts(locale);
    for (const p of postsByLocale[locale]) {
      (slugLocales[p.slug] ||= []).push(locale);
    }
  }
  const entries = [];
  for (const locale of routing.locales) {
    for (const p of postsByLocale[locale]) {
      const presentIn = slugLocales[p.slug] || [locale];
      const languages = Object.fromEntries(
        presentIn.map((l) => [l, `${BASE}/${l}/blog/${p.slug}`])
      );
      if (presentIn.includes(routing.defaultLocale)) {
        languages["x-default"] = `${BASE}/${routing.defaultLocale}/blog/${p.slug}`;
      }
      entries.push({
        loc: `${BASE}/${locale}/blog/${p.slug}`,
        lastmod: p.date || undefined,
        changefreq: "monthly",
        priority: 0.7,
        alternates: altList(languages),
      });
    }
  }
  return entries;
}

export const SITEMAP_PARTS = [
  "sitemap-pages.xml",
  "sitemap-blog.xml",
  "sitemap-countries.xml",
  "sitemap-explore.xml",
];
