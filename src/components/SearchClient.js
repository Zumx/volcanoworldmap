"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter, usePathname } from "../i18n/navigation.js";
import { site } from "../lib/site.js";

// The two prebuilt indexes are fetched at most once and shared via module-level
// promises (a visitor may type many queries, but we only download once).
let countriesPromise = null;
let blogPromise = null;
function loadCountries() {
  if (!countriesPromise)
    countriesPromise = fetch("/data/countries.json")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  return countriesPromise;
}
function loadBlog() {
  if (!blogPromise)
    blogPromise = fetch("/data/blog-index.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  return blogPromise;
}

// Deep link into the full map (same format the LocationCard share button uses).
function mapHref(name, country) {
  const q = new URLSearchParams({ name });
  if (country) q.set("country", country);
  return `/map?${q.toString()}`;
}

const MAX_PER_COLUMN = 30;

// Search the country index: country-name matches first, then place-name matches
// (capped). Each entry carries the link target + a kind tag.
function searchPlaces(countries, term) {
  if (!term) return [];
  const out = [];
  // Countries whose name matches.
  for (const c of countries) {
    if (c.name && c.name.toLowerCase().includes(term)) {
      out.push({ kind: "country", name: c.name, href: `/${c.slug}` });
    }
  }
  // Individual places (from the per-country `places` sample).
  for (const c of countries) {
    for (const p of c.places || []) {
      if (out.length >= MAX_PER_COLUMN) break;
      if (p.name && p.name.toLowerCase().includes(term)) {
        out.push({
          kind: "place",
          name: p.name,
          country: c.name,
          href: mapHref(p.name, c.name),
        });
      }
    }
    if (out.length >= MAX_PER_COLUMN) break;
  }
  // Prefix matches first, then shorter names, so the best hit leads.
  out.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(term) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(term) ? 0 : 1;
    return ap - bp || a.name.length - b.name.length;
  });
  return out.slice(0, MAX_PER_COLUMN);
}

function searchArticles(blogIndex, locale, term) {
  if (!term) return [];
  const list = (blogIndex && (blogIndex[locale] || [])) || [];
  const hits = [];
  for (const post of list) {
    const title = (post.t || "").toLowerCase();
    let score = -1;
    if (title.includes(term)) score = 0;
    else if ((post.h || "").includes(term)) score = 1;
    if (score >= 0)
      hits.push({ slug: post.s, title: post.t, score, len: (post.t || "").length });
  }
  hits.sort((a, b) => a.score - b.score || a.len - b.len);
  return hits.slice(0, MAX_PER_COLUMN);
}

export default function SearchClient({ locale }) {
  const t = useTranslations("search");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialQ = params.get("q") || "";

  const [query, setQuery] = useState(initialQ);
  const [countries, setCountries] = useState(null);
  const [blog, setBlog] = useState(null);
  const inputRef = useRef(null);

  // Load both indexes once on mount.
  useEffect(() => {
    let alive = true;
    loadCountries().then((c) => alive && setCountries(c));
    loadBlog().then((b) => alive && setBlog(b));
    return () => {
      alive = false;
    };
  }, []);

  // Keep ?q= in sync (shareable URLs) without spamming history — replace, debounced.
  useEffect(() => {
    const id = setTimeout(() => {
      const q = query.trim();
      const next = q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname;
      router.replace(next, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const term = query.trim().toLowerCase();
  const loading = countries === null || blog === null;

  const places = useMemo(
    () => (countries ? searchPlaces(countries, term) : []),
    [countries, term]
  );
  const articles = useMemo(
    () => (blog ? searchArticles(blog, locale, term) : []),
    [blog, locale, term]
  );

  const hasQuery = term.length > 0;
  const hasResults = places.length > 0 || articles.length > 0;

  return (
    <div className="search">
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          autoFocus
        />
      </form>

      {!hasQuery && <p className="search-prompt">{t("prompt")}</p>}

      {hasQuery && (
        <p className="search-summary">{t("resultsFor", { q: query.trim() })}</p>
      )}

      {hasQuery && !loading && !hasResults && (
        <p className="search-empty">{t("noResults")}</p>
      )}

      {hasQuery && (
        <div className="search-columns">
          <section className="search-col" aria-label={t("places")}>
            <h2 className="search-col-h">
              {t("places")}{" "}
              {places.length > 0 && (
                <span className="search-count">{places.length}</span>
              )}
            </h2>
            {places.length > 0 ? (
              <ul className="search-results">
                {places.map((r, i) => (
                  <li key={`${r.href}-${i}`}>
                    <Link href={r.href}>
                      <span className="sr-name">{r.name}</span>
                      <span className="sr-tag">
                        {r.kind === "country"
                          ? t("tagCountry")
                          : r.country || t("tagPlace")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              !loading && <p className="search-none">{t("noResults")}</p>
            )}
          </section>

          <section className="search-col" aria-label={t("articles")}>
            <h2 className="search-col-h">
              {t("articles")}{" "}
              {articles.length > 0 && (
                <span className="search-count">{articles.length}</span>
              )}
            </h2>
            {articles.length > 0 ? (
              <ul className="search-results">
                {articles.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/blog/${r.slug}`}>
                      <span className="sr-name">{r.title}</span>
                      <span className="sr-tag">{site.emoji}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              !loading && <p className="search-none">{t("noResults")}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
