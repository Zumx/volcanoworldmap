"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import dynamic from "next/dynamic";
import { site } from "../lib/site.js";
import { fetchWithTimeout } from "../lib/net.js";

// LocationCard is only pulled in the first time a pin is clicked (same as the
// full map).
const LocationCard = dynamic(() => import("./LocationCard.js"), { ssr: false });

const CLUSTER_COLOR = site.colors.primary;

// A compact, interactive map for a single country on its /explore page. Fetches
// a tiny per-country payload prebuilt for the best-covered countries
// (/data/explore/<slug>.geojson — just this country's features), so the page no
// longer downloads the whole multi-MB dataset. Older deploys (or countries
// outside the prebuilt top-N) fall back to the shared core/rest split, filtered
// to this country client-side. Clicking a pin opens the shared LocationCard.
export default function ExploreMapView({ country, countrySlug }) {
  const t = useTranslations("map");
  const locale = useLocale();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const featuresRef = useRef([]); // this country's features (for LocationCard "nearby")
  const [selected, setSelected] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [25, 10],
      zoom: 4,
      scrollWheelZoom: false, // never hijack page scroll on a embedded map
      worldCopyJump: true,
      preferCanvas: true,
      keyboard: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const renderer = L.canvas({ padding: 0.5, tolerance: 12 });

    // Same cluster configuration as the main map.
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 35,
      disableClusteringAtZoom: 7,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      removeOutsideVisibleBounds: true,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const size = n < 100 ? 36 : n < 1000 ? 44 : 54;
        return L.divIcon({
          html: `<div style="background:${CLUSTER_COLOR};color:#fff;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid rgba(255,255,255,.8)">${n}</div>`,
          className: "",
          iconSize: [size, size],
        });
      },
    });
    clusterRef.current = cluster;
    cluster.on("click", (e) => {
      const f = e.layer && e.layer.feature;
      if (f) setSelected(f);
    });
    const setCursor = (c) => {
      if (containerRef.current) containerRef.current.style.cursor = c;
    };
    cluster.on("mouseover", (e) => {
      if (e.layer && e.layer.feature) setCursor("pointer");
    });
    cluster.on("mouseout", () => setCursor(""));
    map.addLayer(cluster);

    const mkMarker = (f) => {
      const c = f.geometry.coordinates;
      const m = L.circleMarker([c[1], c[0]], {
        renderer,
        radius: 6,
        weight: 2,
        color: "#ffffff",
        fillColor: CLUSTER_COLOR,
        fillOpacity: 0.9,
        bubblingMouseEvents: false,
      });
      m.feature = f;
      return m;
    };

    const inCountry = (g) =>
      (g.features || []).filter(
        (f) => f.properties && f.properties.country === country
      );

    const addFeatures = (feats, fit) => {
      if (!feats.length) return;
      for (const f of feats) featuresRef.current.push(f);
      cluster.addLayers(feats.map(mkMarker));
      if (fit) {
        const bounds = [];
        for (const f of featuresRef.current) {
          const c = f.geometry && f.geometry.coordinates;
          if (c) bounds.push([c[1], c[0]]);
        }
        if (bounds.length) {
          try {
            map.fitBounds(L.latLngBounds(bounds).pad(0.12), { maxZoom: 12 });
          } catch {
            /* invalid bounds — leave the default view */
          }
        }
      }
    };

    let cancelled = false;

    // Fallback path for older deploys / countries without a prebuilt file:
    // fetch the shared core/rest split and filter to this country client-side.
    const loadFromSplit = () =>
      fetchWithTimeout("/data/points.core.geojson")
        .then((r) =>
          r.ok
            ? r.json()
            : fetchWithTimeout("/data/points.geojson").then((r2) => r2.json())
        )
        .then((g) => {
          if (cancelled) return;
          addFeatures(inCountry(g), true);
          setReady(true);
          // Background: pull the rest payload and append this country's extras
          // without re-framing the (already fitted) view.
          return fetchWithTimeout("/data/points.rest.geojson")
            .then((r) => (r.ok ? r.json() : null))
            .then((rest) => {
              if (cancelled || !rest) return;
              addFeatures(inCountry(rest), false);
            })
            .catch(() => {});
        })
        .catch(() => {
          if (!cancelled) setReady(true);
        });

    // Fast path: the per-country file is already just this country's features,
    // so there's nothing to filter and no second request to make.
    if (countrySlug) {
      fetchWithTimeout(`/data/explore/${countrySlug}.geojson`)
        .then((r) => (r.ok ? r.json() : null))
        .then((g) => {
          if (cancelled) return;
          if (!g) return loadFromSplit();
          addFeatures(g.features || [], true);
          setReady(true);
        })
        .catch(() => {
          if (!cancelled) loadFromSplit();
        });
    } else {
      loadFromSplit();
    }

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      featuresRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to a feature and open its card — shared by marker clicks and the
  // LocationCard "nearby" list.
  const selectFeature = (feature) => {
    const map = mapRef.current;
    const c = feature && feature.geometry && feature.geometry.coordinates;
    if (map && c) {
      map.setView([c[1], c[0]], Math.max(map.getZoom(), 9), { animate: true });
    }
    setSelected(feature);
  };

  return (
    <div className="explore-map-wrap">
      <div
        ref={containerRef}
        className={`explore-map map-fade${ready ? " map-fade--in" : ""}`}
        role="application"
        aria-label={t("mapLabel", { name: `${site.name} · ${country}` })}
      />
      {!ready && (
        <div className="explore-map-loading">
          <span className="map-spinner" aria-hidden="true" />
          <span className="map-loading-text">{t("loading")}</span>
        </div>
      )}
      {selected && (
        <LocationCard
          feature={selected}
          locale={locale}
          features={featuresRef.current}
          onSelect={selectFeature}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
