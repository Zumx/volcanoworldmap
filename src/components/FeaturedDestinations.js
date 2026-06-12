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

function FeaturedCard({ item, locale, eager = false }) {
  // The image URL is normally resolved at build time and shipped in
  // featured.json (item.image) — render it immediately for a fast LCP. Only
  // when the build-time lookup found nothing do we fall back to the same lazy
  // client-side enrichment the LocationCard uses.
  const [img, setImg] = useState(item.image || null);
  const [loaded, setLoaded] = useState(!!item.image);
  const initial = (item.name.match(/[A-Za-z0-9]/) || ["•"])[0].toUpperCase();

  useEffect(() => {
    if (item.image) return; // already resolved at build time — nothing to fetch
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
          <img
            src={img}
            alt={item.name}
            width="400"
            height="300"
            // First card is above the fold (LCP candidate when it carries a
            // build-time image); the rest stay lazy.
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            decoding={eager ? "sync" : "async"}
          />
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
        <FeaturedCard key={i} item={it} locale={locale} eager={i === 0} />
      ))}
    </div>
  );
}
