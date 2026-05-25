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
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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
      const { data } = matter(raw);
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: data.title || file,
        date: data.date || "",
        excerpt: data.excerpt || data.description || "",
      };
    })
  );
}

export async function listPosts(locale) {
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
}

export async function getPost(locale, slug) {
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
}

// Locales where <slug>.mdx is published. Uses listPosts so drip filtering
// is consistent — hreflang only points at sibling locales that 200 today.
export async function getPostLocales(slug) {
  const out = [];
  for (const locale of routing.locales) {
    const posts = await listPosts(locale);
    if (posts.some((p) => p.slug === slug)) out.push(locale);
  }
  return out;
}

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

export async function relatedPosts(locale, slug, limit = 3) {
  const all = await listPosts(locale);
  const mySet = new Set(tokens(slug));
  if (mySet.size === 0) {
    return all.filter((p) => p.slug !== slug).slice(0, limit);
  }
  const scored = all
    .filter((p) => p.slug !== slug)
    .map((p) => {
      const t = tokens(p.slug);
      let overlap = 0;
      for (const w of t) if (mySet.has(w)) overlap++;
      return { ...p, _score: overlap };
    })
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return String(b.date).localeCompare(String(a.date));
    });
  return scored.slice(0, limit);
}
