"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { enrichLocation } from "../lib/enrich.js";
import { site, metaFieldsFor } from "../lib/site.js";

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
// network call below happens on click, never on page load.
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

  const displayName = p.name || p.unnamed || site.unnamedLabel || "—";
  const initial = useMemo(
    () => (displayName.match(/[A-Za-z0-9]/) || ["•"])[0].toUpperCase(),
    [displayName]
  );

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

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Common OSM tags carried through by scripts/fetch-data.mjs. Each row is
  // only shown when the underlying value exists ("om de finns").
  const rows = [];
  if (p.website)
    rows.push([
      t("website"),
      <a key="w" href={p.website} target="_blank" rel="noreferrer">
        {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      </a>,
    ]);
  if (p.opening_hours) rows.push([t("openingHours"), p.opening_hours]);
  if (p.phone)
    rows.push([
      t("phone"),
      <a key="p" href={`tel:${String(p.phone).replace(/\s+/g, "")}`}>
        {p.phone}
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

  return (
    <div className="loc-backdrop" onClick={onClose}>
      <div
        className="loc-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={displayName}
        style={{ position: "relative" }}
      >
        <button className="loc-close" onClick={onClose} aria-label={t("close")}>
          ×
        </button>
        <button className="loc-share" onClick={onShare} aria-label={t("share")}>
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
        {copied && <span className="loc-copied">{t("copied")}</span>}

        {image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="loc-img" src={image} alt={displayName} />
        ) : loading ? (
          <div className="loc-img loc-img--placeholder">
            <span className="loc-initial" aria-hidden="true">
              {initial}
            </span>
          </div>
        ) : (
          // Graceful fallback: no Wikimedia/Mapillary image found — show a
          // styled placeholder with the location's initial.
          <div className="loc-img loc-img--placeholder">
            <span className="loc-initial" aria-hidden="true">
              {initial}
            </span>
          </div>
        )}

        <div className="loc-body">
          <h2>{displayName}</h2>
          {p.country && <div className="loc-country">{p.country}</div>}

          {p.googleRating != null && (
            <div className="loc-rating">
              {t("googleRating", {
                rating: p.googleRating,
                count: p.googleReviews || 0,
              })}
            </div>
          )}

          {loading ? (
            <>
              <div className="loc-skeleton" style={{ width: "90%" }} />
              <div className="loc-skeleton" style={{ width: "75%" }} />
              <div className="loc-skeleton" style={{ width: "82%" }} />
            </>
          ) : (
            <p className="loc-extract">
              {(enriched && enriched.extract) || t("noDescription")}
            </p>
          )}

          {rows.length > 0 && (
            <ul className="loc-fields">
              {rows.map(([k, v], i) => (
                <li key={i}>
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                </li>
              ))}
            </ul>
          )}

          {bookUrl && (
            <a
              className="loc-cta"
              href={bookUrl}
              target="_blank"
              rel="noreferrer nofollow sponsored"
            >
              {t("bookExperience")}
            </a>
          )}

          <div className="loc-links">
            {enriched && enriched.wikiUrl && (
              <a href={enriched.wikiUrl} target="_blank" rel="noreferrer">
                {t("wikipedia")}
              </a>
            )}
            {p.osmType && p.osmId && (
              <>
                {enriched && enriched.wikiUrl ? " · " : ""}
                <a
                  href={`https://www.openstreetmap.org/${p.osmType}/${p.osmId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("viewOnOsm")}
                </a>
              </>
            )}
          </div>

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

        {image && enriched.source && (
          <div className="loc-photo-credit">
            {t("photoVia", { source: enriched.source })}
          </div>
        )}
      </div>
    </div>
  );
}
