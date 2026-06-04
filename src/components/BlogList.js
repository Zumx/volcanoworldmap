"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../i18n/navigation.js";
import BlogImage from "./BlogImage.js";

const PAGE_SIZE = 12;
const FEATURED_COUNT = 3;

function PostMeta({ post, t }) {
  if (!post.date && !post.readTime) return null;
  return (
    <div className="post-meta">
      {post.date && <span>{post.date}</span>}
      {post.date && post.readTime ? <span> · </span> : null}
      {post.readTime ? <span>{t("readTime", { min: post.readTime })}</span> : null}
    </div>
  );
}

// Large hero card with a Wikimedia image — used for the latest posts.
function FeatureCard({ post, t }) {
  return (
    <Link className="blog-feature-card" href={`/blog/${post.slug}`}>
      <div className="blog-feature-img">
        <BlogImage post={post} eager />
      </div>
      <div className="blog-feature-body">
        {post.tags && post.tags.length > 0 && (
          <span className="post-tag">{post.tags[0]}</span>
        )}
        <h3>{post.title}</h3>
        <PostMeta post={post} t={t} />
        {post.excerpt && <p>{post.excerpt}</p>}
      </div>
    </Link>
  );
}

// Compact row in the paginated list below the hero.
function PostCard({ post, t }) {
  return (
    <li>
      <h2>
        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
      </h2>
      <PostMeta post={post} t={t} />
      {post.tags && post.tags.length > 0 && (
        <div className="post-tags">
          {post.tags.map((tg) => (
            <span key={tg} className="post-tag">
              {tg}
            </span>
          ))}
        </div>
      )}
      {post.excerpt && <p>{post.excerpt}</p>}
      <Link href={`/blog/${post.slug}`}>{t("readMore")}</Link>
    </li>
  );
}

export default function BlogList({ posts, locale, title }) {
  const t = useTranslations("blog");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState(null);
  const [page, setPage] = useState(0);

  // Attach the locale to each post so the featured cards know which Wikipedia
  // edition to query for their hero image.
  const withLocale = useMemo(
    () => posts.map((p) => ({ ...p, locale })),
    [posts, locale]
  );

  // Latest three power the hero; the rest feed the filterable list.
  const featured = useMemo(
    () => withLocale.slice(0, FEATURED_COUNT),
    [withLocale]
  );
  const rest = useMemo(() => withLocale.slice(FEATURED_COUNT), [withLocale]);

  const categories = useMemo(() => {
    const s = new Set();
    for (const p of posts) for (const tg of p.tags || []) s.add(tg);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [posts]);

  // Defer the search term so typing stays smooth even with many posts.
  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim().toLowerCase();
  const searching = q.length > 0;

  // Search spans every post (title, excerpt, tags); category browsing applies
  // only to the non-featured remainder so the hero stays stable.
  const list = useMemo(() => {
    if (searching) {
      return withLocale.filter((p) => {
        const hay = `${p.title} ${p.excerpt} ${(p.tags || []).join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return tag ? rest.filter((p) => (p.tags || []).includes(tag)) : rest;
  }, [searching, q, withLocale, rest, tag]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageItems = list.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const showHero = !searching && tag === null && current === 0;

  const onSearch = (e) => {
    setQuery(e.target.value);
    setPage(0);
  };
  const chooseTag = (next) => {
    setTag(next);
    setPage(0);
  };

  return (
    <>
      <section className="blog-hero">
        <h1>{title}</h1>
        <p className="blog-hero-tagline">{t("heroTagline")}</p>
        <div className="blog-search">
          <input
            type="search"
            value={query}
            onChange={onSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="blog-search-input"
          />
        </div>
      </section>

      {showHero && featured.length > 0 && (
        <section className="blog-featured">
          <h2 className="blog-section-title">{t("latest")}</h2>
          <div className="blog-featured-grid">
            {featured.map((p) => (
              <FeatureCard key={p.slug} post={p} t={t} />
            ))}
          </div>
        </section>
      )}

      {!searching && categories.length > 0 && (
        <nav className="tag-filter" aria-label={t("categories")}>
          <button
            type="button"
            className={`tag-chip${tag === null ? " is-active" : ""}`}
            onClick={() => chooseTag(null)}
          >
            {t("all")}
          </button>
          {categories.map((tg) => (
            <button
              key={tg}
              type="button"
              className={`tag-chip${tag === tg ? " is-active" : ""}`}
              onClick={() => chooseTag(tg)}
            >
              {tg}
            </button>
          ))}
        </nav>
      )}

      {searching && (
        <p className="blog-results-count">
          {t("results", { count: list.length })}
        </p>
      )}

      {pageItems.length === 0 ? (
        <p className="blog-no-results">{t("noResults")}</p>
      ) : (
        <ul className="post-list">
          {pageItems.map((p) => (
            <PostCard key={p.slug} post={p} t={t} />
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="pagination" aria-label="Pagination">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
          >
            {t("prev")}
          </button>
          <span className="page-info">
            {t("page", { page: current + 1, total: pageCount })}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
          >
            {t("next")}
          </button>
        </nav>
      )}
    </>
  );
}
