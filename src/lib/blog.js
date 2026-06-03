// Reads MDX blog posts from src/content/blog/.
//
// Layout:
//   src/content/blog/welcome.mdx           legacy root posts (English fallback)
//   src/content/blog/en/<slug>.mdx         English posts
//   src/content/blog/de/<slug>.mdx         German posts
//   src/content/blog/fr/<slug>.mdx         French posts
//   src/content/blog/it/<slug>.mdx         Italian posts
//
// Drip publishing: posts with a frontmatter `date` later than today are
// treated as not-yet-published — hidden from listings, sitemap, hreflang,
// and direct URL access. Posts without a date are always published.
//
// Per-request deduplication: listPosts/getPost/getPostLocales are wrapped
// in React's `cache()` so multiple consumers (sitemap, generateMetadata,
// the page component, relatedPosts) hitting the same locale during one
// render share a single disk read + frontmatter-parse pass.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import { routing } from "../i18n/routing.js";

const DIR = join(process.cwd(), "src", "content", "blog");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isPublished(post) {
  return !post.date || post.date <= today();
}

async function readPostsFrom(dir) {
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".mdx"));
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(dir, file), "utf8");
      const { data, content } = matter(raw);
      const words = (content || "").trim().split(/\s+/).filter(Boolean).length;
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: data.title || file,
        date: data.date || "",
        excerpt: data.excerpt || data.description || "",
        // Optional frontmatter, all backward-compatible:
        //   tags: ["a","b"]   featured/pinned: true   country: "<slug>"
        tags: Array.isArray(data.tags)
          ? data.tags
          : data.tags
          ? [data.tags]
          : [],
        featured: !!(data.featured || data.pinned),
        country: data.country || "",
        // ~200 wpm reading estimate, floored at 1 minute.
        readTime: Math.max(1, Math.round(words / 200)),
      };
    })
  );
}

export const listPosts = cache(async (locale) => {
  const localePosts = await readPostsFrom(join(DIR, locale));
  const seen = new Set(localePosts.map((p) => p.slug));

  let rootPosts = [];
  if (locale === routing.defaultLocale) {
    const all = await readPostsFrom(DIR);
    rootPosts = all.filter((p) => !seen.has(p.slug));
  }

  return [...localePosts, ...rootPosts]
    .filter(isPublished)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
});

export const getPost = cache(async (locale, slug) => {
  const t = today();

  try {
    const raw = await readFile(join(DIR, locale, `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    if (data.date && data.date > t) return null;
    return { meta: data, content };
  } catch {}

  if (locale === routing.defaultLocale) {
    try {
      const raw = await readFile(join(DIR, `${slug}.mdx`), "utf8");
      const { data, content } = matter(raw);
      if (data.date && data.date > t) return null;
      return { meta: data, content };
    } catch {}
  }

  return null;
});

// Locales where <slug>.mdx is published. Reads only the candidate files
// directly (O(L) frontmatter parses) instead of scanning each locale's
// full directory — keeps hreflang generation cheap at build time.
export const getPostLocales = cache(async (slug) => {
  const t = today();
  const out = [];
  for (const locale of routing.locales) {
    try {
      const raw = await readFile(
        join(DIR, locale, `${slug}.mdx`),
        "utf8"
      );
      const { data } = matter(raw);
      if (!data.date || data.date <= t) {
        out.push(locale);
        continue;
      }
    } catch {}
    // Legacy root fallback applies to default locale only.
    if (locale === routing.defaultLocale) {
      try {
        const raw = await readFile(join(DIR, `${slug}.mdx`), "utf8");
        const { data } = matter(raw);
        if (!data.date || data.date <= t) out.push(locale);
      } catch {}
    }
  }
  return out;
});

// Deterministic "related" pick: posts in the same locale sharing the most
// kebab-cased slug tokens, then most recent. Stopwords and length-1 tokens
// are ignored so e.g. "in" doesn't dominate similarity.
const STOP = new Set([
  "a", "an", "the", "of", "in", "on", "to", "and", "or", "for", "at",
  "by", "with", "from", "10", "top", "vs", "is", "are", "be",
]);

function tokens(slug) {
  return slug
    .split("-")
    .filter((t) => t.length > 1 && !STOP.has(t.toLowerCase()));
}

// Posts tied to a country, for the cross-links on a country landing page.
// Primary match: frontmatter `country` equals the slug or the country name.
// Fallback: the country-name token appears in the post slug (so a post like
// "best-castles-in-france" links from /france even without frontmatter).
export async function relatedPostsForCountry(
  locale,
  countrySlug,
  countryName,
  limit = 4
) {
  const all = await listPosts(locale);
  const cs = String(countrySlug || "").toLowerCase();
  const cn = String(countryName || "").toLowerCase();
  const token = cn.replace(/\s+/g, "-");
  const out = [];
  for (const p of all) {
    const pc = String(p.country || "").toLowerCase();
    const byMeta = pc && (pc === cs || pc === cn);
    const bySlug = token.length > 2 && p.slug.toLowerCase().includes(token);
    if (byMeta || bySlug) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export async function relatedPosts(locale, slug, limit = 3) {
  const all = await listPosts(locale);
  const me = all.find((p) => p.slug === slug);
  const myTags = new Set((me && me.tags) || []);
  const mySet = new Set(tokens(slug));
  if (mySet.size === 0 && myTags.size === 0) {
    return all.filter((p) => p.slug !== slug).slice(0, limit);
  }
  const scored = all
    .filter((p) => p.slug !== slug)
    .map((p) => {
      let overlap = 0;
      // Shared frontmatter tags are a strong signal; weight them above the
      // incidental slug-token overlap used as a fallback for untagged posts.
      for (const tag of p.tags || []) if (myTags.has(tag)) overlap += 3;
      for (const w of tokens(p.slug)) if (mySet.has(w)) overlap += 1;
      return { ...p, _score: overlap };
    })
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return String(b.date).localeCompare(String(a.date));
    });
  return scored.slice(0, limit);
}
