import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Link } from "../../../../i18n/navigation.js";
import { routing } from "../../../../i18n/routing.js";
import {
  listPosts,
  getPost,
  getPostLocales,
  relatedPosts,
} from "../../../../lib/blog.js";

// ISR: regenerate at most once per day so drip-scheduled posts go live
// (and future-dated 404s flip to content) without a rebuild.
export const revalidate = 86400;

export async function generateStaticParams() {
  // Union of slugs across all locales (incl. legacy root posts). Combinations
  // where the slug doesn't exist in the requested locale resolve to 404.
  const all = new Set();
  for (const locale of routing.locales) {
    const posts = await listPosts(locale);
    posts.forEach((p) => all.add(p.slug));
  }
  return [...all].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const post = await getPost(locale, slug);
  if (!post) return {};

  // hreflang: only point at locales that actually have this slug.
  const locales = await getPostLocales(slug);
  const languages = Object.fromEntries(
    locales.map((l) => [l, `/${l}/blog/${slug}`])
  );
  if (locales.includes(routing.defaultLocale)) {
    languages["x-default"] = `/${routing.defaultLocale}/blog/${slug}`;
  }

  const title = post.meta.title || slug;
  const description = post.meta.description || post.meta.excerpt || undefined;
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/blog/${slug}`,
      languages,
    },
    openGraph: { title, description, type: "article" },
  };
}

export default async function BlogPost({ params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("blog");
  const post = await getPost(locale, slug);
  if (!post) notFound();

  const related = await relatedPosts(locale, slug, 3);

  return (
    <main className="container prose">
      <Link href="/blog">{t("back")}</Link>
      <h1>{post.meta.title || slug}</h1>
      {post.meta.date && <p className="post-meta">{post.meta.date}</p>}
      <MDXRemote source={post.content} />
      {related.length > 0 && (
        <aside className="related-posts">
          <h2>{t("related")}</h2>
          <ul>
            {related.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
                {p.date && <span className="post-meta"> · {p.date}</span>}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
