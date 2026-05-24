// Reads MDX blog posts from src/content/blog/.
//
// Layout:
//   src/content/blog/welcome.mdx           legacy root posts (English fallback)
//   src/content/blog/en/<slug>.mdx         English posts
//   src/content/blog/de/<slug>.mdx         German posts
//   src/content/blog/fr/<slug>.mdx         French posts
//   src/content/blog/it/<slug>.mdx         Italian posts
//
// listPosts(locale) returns posts in <locale>/, plus any legacy root posts
// when locale === defaultLocale (so existing English posts stay visible).
// Slug collisions resolve in favour of the locale-specific file.
import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { routing } from "../i18n/routing.js";

const DIR = join(process.cwd(), "src", "content", "blog");

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

  return [...localePosts, ...rootPosts].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
}

export async function getPost(locale, slug) {
  try {
    const raw = await readFile(join(DIR, locale, `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    return { meta: data, content };
  } catch {}

  if (locale === routing.defaultLocale) {
    try {
      const raw = await readFile(join(DIR, `${slug}.mdx`), "utf8");
      const { data, content } = matter(raw);
      return { meta: data, content };
    } catch {}
  }

  return null;
}

// Locales where <slug>.mdx actually exists. Used to emit hreflang alternates
// only for sibling locales that have the post, never pointing at a 404.
export async function getPostLocales(slug) {
  const out = [];
  for (const locale of routing.locales) {
    try {
      await access(join(DIR, locale, `${slug}.mdx`));
      out.push(locale);
      continue;
    } catch {}
    if (locale === routing.defaultLocale) {
      try {
        await access(join(DIR, `${slug}.mdx`));
        out.push(locale);
      } catch {}
    }
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
