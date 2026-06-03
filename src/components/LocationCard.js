"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { enrichLocation } from "../lib/enrich.js";
import { site, metaFieldsFor } from "../lib/site.js";

// The blog search index (public/data/blog-index.json, written by
// scripts/build-index.mjs) is fetched at most once per page and shared across
// every card via this module-level promise.
let blogIndexPromise = null;
function loadBlogIndex() {
  if (!blogIndexPromise) {
    blogIndexPromise = fetch("/data/blog-index.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return blogIndexPromise;
}

// Up to `limit` blog posts that mention this place, searched against the
// prebuilt per-locale index (title + excerpt + headings + slug). Title hits
// rank above body hits; shorter titles win ties.
function findPosts(index, locale, name, limit = 2) {
  const term = String(name || "").toLowerCase().trim();
  if (term.length < 3) return [];
  const list = (index && index[locale]) || [];
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
  return hits.slice(0, limit);
}

// Build the affiliate "Book an experience" URL. site.affiliateUrl may contain
// a {q} placeholder which is replaced with the place name (so a generic
// search/affiliate link still lands on something relevant); otherwise the
// URL is used verbatim.
function affiliateHref(name) {
  const base = site.affiliateUrl;
  if (!base) return null;
  if (base.includes("{q}"))
    return base.replace("{q}", encodeURIComponent(name || site.name || ""));
  return base;
}

// Lazily mounted (next/dynamic) the first time a pin is clicked — so every
// network call below happens on click, never on page load. Presented as a
// slide-in side panel on desktop and a swipe-to-dismiss bottom sheet on mobile.
export default function LocationCard({
  feature,
  locale,
  features,
  onSelect,
  onClose,
}) {
  const t = useTranslations("card");
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry.coordinates;
  const [enriched, setEnriched] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false); // drives the slide-in / slide-out
  const [dragY, setDragY] = useState(0); // live offset while swiping the sheet
  const [blogPosts, setBlogPosts] = useState([]); // posts that mention this place
  const dragStart = useRef(null);

  const displayName = p.name || p.unnamed || site.unnamedLabel || "—";

  // Up to 5 named places within 50 km, nearest first — read from the same
  // in-memory GeoJSON the map already loaded. A coarse bounding-box prefilter
  // keeps this cheap on dense datasets before the exact haversine pass.
  const nearby = useMemo(() => {
    if (!features || !features.length) return [];
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const latRad = toRad(lat);
    const latWin = 0.55;
    const lonWin = 0.55 / Math.max(Math.cos(latRad), 0.05);
    const out = [];
    for (const f of features) {
      if (f === feature) continue;
      const fp = f.properties;
      if (!fp || !fp.name) continue;
      const c = f.geometry && f.geometry.coordinates;
      if (!c) continue;
      const flon = c[0];
      const flat = c[1];
      if (Math.abs(flat - lat) > latWin || Math.abs(flon - lon) > lonWin)
        continue;
      const dLat = toRad(flat - lat);
      const dLon = toRad(flon - lon);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(latRad) * Math.cos(toRad(flat)) * Math.sin(dLon / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      if (dist > 0 && dist <= 50) out.push({ f, dist });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, 5);
  }, [features, feature, lat, lon]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    enrichLocation({ name: p.name, country: p.country, lat, lon, locale }).then(
      (r) => {
        if (alive) {
          setEnriched(r);
          setLoading(false);
        }
      }
    );
    return () => {
      alive = false;
    };
  }, [p.name, p.country, lat, lon, locale]);

  // Find blog posts that mention this place (max 2). Only runs for named
  // places; the index fetch is shared and cached across cards.
  useEffect(() => {
    let alive = true;
    if (!p.name) {
      setBlogPosts([]);
      return;
    }
    loadBlogIndex().then((index) => {
      if (alive) setBlogPosts(findPosts(index, locale, p.name, 2));
    });
    return () => {
      alive = false;
    };
  }, [p.name, locale]);

  // Trigger the slide-in on the first paint after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Animated close: slide out, then unmount via onClose after the transition.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => onCloseRef.current && onCloseRef.current(), 280);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Swipe-to-dismiss (mobile bottom sheet) — handlers live on the drag header
  // so they never hijack scrolling inside the content area.
  const onTouchStart = (e) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (dragY > 90) close();
    else setDragY(0);
    dragStart.current = null;
  };

  // Common OSM tags carried through by scripts/fetch-data.mjs. Each row is
  // only shown when the underlying value exists ("om de finns").
  const rows = [];
  if (p.opening_hours) rows.push([t("openingHours"), p.opening_hours]);
  if (p.phone)
    rows.push([
      t("phone"),
      <a key="p" href={`tel:${String(p.phone).replace(/\s+/g, "")}`}>
        {p.phone}
      </a>,
    ]);
  if (p.website)
    rows.push([
      t("website"),
      <a key="w" href={p.website} target="_blank" rel="noreferrer">
        {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      </a>,
    ]);
  if (p.address) rows.push([t("address"), p.address]);
  if (p.capacity) rows.push([t("capacity"), p.capacity]);
  // Site-specific slot fields declared in site.json metaFields
  // (ski: elevation/activities, wine: grape/region, …) — rendered
  // automatically without touching this component.
  for (const f of metaFieldsFor(p)) rows.push([f.label, f.value]);

  const image = enriched && enriched.image;
  const bookUrl = affiliateHref(p.name);
  const typeLabel = (p.type && String(p.type)) || site.mappedNoun;
  const ratingPct =
    p.googleRating != null
      ? Math.max(0, Math.min(100, (Number(p.googleRating) / 5) * 100))
      : 0;

  // Share a deep link back to this place (/map?name=…&country=…). Uses the
  // native share sheet on mobile and falls back to copying the URL.
  const onShare = async () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("name", p.name || displayName);
    if (p.country) params.set("country", p.country);
    const url = `${window.location.origin}/${locale}/map?${params.toString()}`;
    const title = p.country ? `${displayName} — ${p.country}` : displayName;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* clipboard blocked */
      }
    }
  };

  const panelStyle = dragY
    ? { transform: `translateY(${dragY}px)`, transition: "none" }
    : undefined;

  return (
    <div
      className={`loc-backdrop${open ? " is-open" : ""}`}
      onClick={close}
    >
      <aside
        className={`loc-panel${open ? " is-open" : ""}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={displayName}
      >
        <div
          className="loc-drag"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="loc-handle" aria-hidden="true" />
        </div>

        <div className="loc-actions">
          <button
            className="loc-iconbtn"
            onClick={onShare}
            aria-label={t("share")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"
              />
            </svg>
          </button>
          <button
            className="loc-iconbtn"
            onClick={close}
            aria-label={t("close")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        </div>
        {copied && <span className="loc-copied">{t("copied")}</span>}

        <div className="loc-scroll">
          <div className="loc-hero">
            {image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="loc-hero-img"
                src={image}
                alt={displayName}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="loc-hero-ph">
                <span className="loc-hero-emoji" aria-hidden="true">
                  {site.emoji}
                </span>
              </div>
            )}
            {image && enriched.source && (
              <span className="loc-photo-credit">
                {t("photoVia", { source: enriched.source })}
              </span>
            )}
          </div>

          <div className="loc-content">
            <h2 className="loc-title">{displayName}</h2>
            {p.country && <div className="loc-subtitle">{p.country}</div>}

            <div className="loc-tags">
              <span className="loc-tag loc-tag--accent">{typeLabel}</span>
              {p.country && <span className="loc-tag">{p.country}</span>}
            </div>

            {p.googleRating != null && (
              <div className="loc-rating">
                <span
                  className="loc-stars"
                  style={{ "--pct": `${ratingPct}%` }}
                  aria-hidden="true"
                >
                  ★★★★★
                </span>
                <span className="loc-rating-text">
                  {t("googleRating", {
                    rating: p.googleRating,
                    count: p.googleReviews || 0,
                  })}
                </span>
              </div>
            )}

            {loading ? (
              <div className="loc-extract-box">
                <div className="loc-skeleton" style={{ width: "92%" }} />
                <div className="loc-skeleton" style={{ width: "78%" }} />
                <div className="loc-skeleton" style={{ width: "85%" }} />
              </div>
            ) : enriched && enriched.extract ? (
              <div className="loc-extract-box">
                <p>{enriched.extract}</p>
              </div>
            ) : (
              <div className="loc-extract-box loc-extract-box--empty">
                <p>{t("noDescription")}</p>
              </div>
            )}

            {rows.length > 0 && (
              <div className="loc-meta-grid">
                {rows.map(([k, v], i) => (
                  <div className="loc-meta" key={i}>
                    <span className="loc-meta-k">{k}</span>
                    <span className="loc-meta-v">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {((enriched && enriched.wikiUrl) || (p.osmType && p.osmId)) && (
              <div className="loc-links">
                {enriched && enriched.wikiUrl && (
                  <a href={enriched.wikiUrl} target="_blank" rel="noreferrer">
                    {t("wikipedia")}
                  </a>
                )}
                {p.osmType && p.osmId && (
                  <a
                    href={`https://www.openstreetmap.org/${p.osmType}/${p.osmId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("viewOnOsm")}
                  </a>
                )}
              </div>
            )}

            {blogPosts.length > 0 && (
              <div className="loc-blog">
                <h3>{t("inTheBlog")}</h3>
                <ul>
                  {blogPosts.map((post) => (
                    <li key={post.slug}>
                      <a href={`/${locale}/blog/${post.slug}`}>
                        <span className="loc-blog-icon" aria-hidden="true">
                          ✎
                        </span>
                        <span className="loc-blog-title">{post.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {nearby.length > 0 && (
              <div className="loc-nearby">
                <h3>{t("nearbyHeading")}</h3>
                <ul>
                  {nearby.map(({ f, dist }, i) => {
                    const np = f.properties || {};
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onSelect && onSelect(f)}
                        >
                          <span className="n-name">{np.name}</span>
                          <span className="n-dist">{Math.round(dist)} km</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Reviews — intentionally disabled for now. To activate later,
                remove the disabled note below and uncomment this scaffold:

            {enriched && enriched.reviews && enriched.reviews.length > 0 && (
              <div className="loc-reviews">
                <h3>{t("reviewsHeading")}</h3>
                <ul className="review-list">
                  {enriched.reviews.map((r, i) => (
                    <li key={i} className="review">
                      <div className="review-head">
                        <span className="review-author">{r.author}</span>
                        <span className="review-stars">{r.rating} ⭐</span>
                      </div>
                      <p className="review-text">{r.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            */}
            <div className="loc-reviews">
              <h3>{t("reviewsHeading")}</h3>
              <p className="disabled-note">{t("reviewsDisabled")}</p>
            </div>
          </div>
        </div>

        {bookUrl && (
          <div className="loc-cta-bar">
            <a
              className="loc-cta"
              href={bookUrl}
              target="_blank"
              rel="noreferrer nofollow sponsored"
            >
              {t("bookExperience")}
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}
