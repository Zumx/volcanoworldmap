"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../i18n/navigation.js";

const PAGE_SIZE = 20;

function PostCard({ post, t }) {
  return (
    <li>
      <h2>
        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
      </h2>
      <div className="post-meta">
        {post.date && <span>{post.date}</span>}
        {post.date && post.readTime ? <span> · </span> : null}
        {post.readTime ? (
          <span>{t("readTime", { min: post.readTime })}</span>
        ) : null}
      </div>
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

export default function BlogList({ posts }) {
  const t = useTranslations("blog");
  const [tag, setTag] = useState(null);
  const [page, setPage] = useState(0);

  const featured = useMemo(() => posts.filter((p) => p.featured), [posts]);
  const rest = useMemo(() => posts.filter((p) => !p.featured), [posts]);

  const tags = useMemo(() => {
    const s = new Set();
    for (const p of posts) for (const tg of p.tags || []) s.add(tg);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const filtered = useMemo(
    () => (tag ? rest.filter((p) => (p.tags || []).includes(tag)) : rest),
    [rest, tag]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE
  );

  const choose = (next) => {
    setTag(next);
    setPage(0);
  };

  return (
    <>
      {featured.length > 0 && (
        <section className="featured-posts">
          <h2>{t("featured")}</h2>
          <ul className="post-list">
            {featured.map((p) => (
              <PostCard key={p.slug} post={p} t={t} />
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && (
        <div className="tag-filter" role="group" aria-label={t("featured")}>
          <button
            type="button"
            className={`tag-chip${tag === null ? " is-active" : ""}`}
            onClick={() => choose(null)}
          >
            {t("all")}
          </button>
          {tags.map((tg) => (
            <button
              key={tg}
              type="button"
              className={`tag-chip${tag === tg ? " is-active" : ""}`}
              onClick={() => choose(tg)}
            >
              {tg}
            </button>
          ))}
        </div>
      )}

      <ul className="post-list">
        {pageItems.map((p) => (
          <PostCard key={p.slug} post={p} t={t} />
        ))}
      </ul>

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
