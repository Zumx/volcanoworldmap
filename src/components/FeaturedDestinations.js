"use client";

import { useEffect, useState } from "react";
import { Link } from "../i18n/navigation.js";
import { enrichLocation } from "../lib/enrich.js";

// Deep link into the full map (same format the LocationCard share button uses).
function mapHref(name, country) {
  const q = new URLSearchParams({ name });
  if (country) q.set("country", country);
  return `/map?${q.toString()}`;
}

function FeaturedCard({ item, locale }) {
  const [img, setImg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const initial = (item.name.match(/[A-Za-z0-9]/) || ["•"])[0].toUpperCase();

  // Same lazy Wikipedia/Wikimedia lookup the LocationCard uses, run once per
  // card on mount. Best-effort: no image just leaves the styled initial.
  useEffect(() => {
    let alive = true;
    enrichLocation({
      name: item.name,
      country: item.country,
      lat: item.lat,
      lon: item.lon,
      locale,
    }).then((r) => {
      if (alive) {
        setImg((r && r.image) || null);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [item, locale]);

  return (
    <Link className="featured-card" href={mapHref(item.name, item.country)}>
      <div className="featured-img">
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={img} alt={item.name} loading="lazy" decoding="async" />
        ) : (
          <span
            className={`featured-initial${loaded ? "" : " is-loading"}`}
            aria-hidden="true"
          >
            {initial}
          </span>
        )}
      </div>
      <div className="featured-body">
        <span className="featured-name">{item.name}</span>
        <span className="featured-country">{item.country}</span>
      </div>
    </Link>
  );
}

export default function FeaturedDestinations({ items, locale }) {
  if (!items || !items.length) return null;
  return (
    <div className="featured-grid">
      {items.map((it, i) => (
        <FeaturedCard key={i} item={it} locale={locale} />
      ))}
    </div>
  );
}
