import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Link } from "../../../../i18n/navigation.js";
import Breadcrumbs from "../../../../components/Breadcrumbs.js";
import ReadingProgress from "../../../../components/ReadingProgress.js";
import ShareBar from "../../../../components/ShareBar.js";
import { routing } from "../../../../i18n/routing.js";
import {
  listPosts,
  getPost,
  getPostLocales,
  relatedPosts,
  countriesInText,
} from "../../../../lib/blog.js";
import { listCountries } from "../../../../lib/data.js";
import { site, author } from "../../../../lib/site.js";
import { pingIndexNow, isFreshlyPublished } from "../../../../lib/indexnow.js";

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
  const nav = await getTranslations("nav");
  const post = await getPost(locale, slug);
  if (!post) notFound();

  const related = await relatedPosts(locale, slug, 3);
  // Internal links to the country guides for any country named in the post
  // (frontmatter `country` plus countries mentioned in the title/body). The
  // top-20 best-covered countries have a richer /explore landing page; the
  // rest fall back to their /[country] page. Both are strong topical links.
  const allCountries = await listCountries();
  const exploreSlugs = new Set(allCountries.slice(0, 20).map((c) => c.slug));
  const postCountries = countriesInText(
    { title: post.meta.title, content: post.content, country: post.meta.country },
    allCountries,
    4
  );

  const url = `https://${site.domain}/${locale}/blog/${slug}`;
  const headline = post.meta.title || slug;
  const description =
    post.meta.description || post.meta.excerpt || undefined;

  // IndexNow ping on ISR regeneration when the post just dripped live.
  // Fire-and-forget — errors are swallowed inside the helper.
  if (isFreshlyPublished(post.meta.date)) {
    pingIndexNow([url]);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    datePublished: post.meta.date,
    dateModified: post.meta.date,
    author: {
      "@type": "Person",
      name: author.name,
      url: `https://${site.domain}/${locale}/about`,
    },
    inLanguage: locale,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  return (
    <main className="container prose">
      <ReadingProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumbs
        locale={locale}
        items={[
          { name: nav("home"), href: "/" },
          { name: nav("blog"), href: "/blog" },
          { name: post.meta.title || slug },
        ]}
      />
      <Link className="back-to-blog no-print" href="/blog">
        {t("back")}
      </Link>
      <h1>{post.meta.title || slug}</h1>
      {(post.meta.date || post.readTime) && (
        <p className="post-meta">
          {post.meta.date && <span>{post.meta.date}</span>}
          {post.meta.date && post.readTime ? <span> · </span> : null}
          {post.readTime ? <span>{t("readTime", { min: post.readTime })}</span> : null}
        </p>
      )}
      <ShareBar url={url} title={headline} />
      {postCountries.length > 0 && (
        <nav className="post-countries" aria-label={t("exploreHeading")}>
          {postCountries.map((c) => (
            <Link
              key={c.slug}
              className="post-country-link"
              href={exploreSlugs.has(c.slug) ? `/explore/${c.slug}` : `/${c.slug}`}
            >
              {site.emoji} {t("exploreCountry", { country: c.name })}
            </Link>
          ))}
        </nav>
      )}
      <MDXRemote source={post.content} />
      <aside className="author-box">
        <div className="author-avatar" aria-hidden="true">
          {site.emoji}
        </div>
        <div className="author-meta">
          <p className="author-name">{t("writtenBy", { author: author.name })}</p>
          <p className="author-bio">{t("authorBio")}</p>
        </div>
      </aside>
      {related.length > 0 && (
        <aside className="related-posts">
          <h2>{t("alsoLike")}</h2>
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
