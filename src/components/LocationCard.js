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
export default function LocationCard({ feature, locale, onClose }) {
  const t = useTranslations("card");
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry.coordinates;
  const [enriched, setEnriched] = useState(null);
  const [loading, setLoading] = useState(true);

  const displayName = p.name || p.unnamed || site.unnamedLabel || "—";
  const initial = useMemo(
    () => (displayName.match(/[A-Za-z0-9]/) || ["•"])[0].toUpperCase(),
    [displayName]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    enrichLocation({ name: p.name, lat, lon, locale }).then((r) => {
      if (alive) {
        setEnriched(r);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [p.name, lat, lon, locale]);

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
