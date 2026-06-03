"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { site } from "../lib/site.js";

// LocationCard is only pulled in the first time a pin is clicked.
const LocationCard = dynamic(() => import("./LocationCard.js"), {
  ssr: false,
});

const LS_KEY = `${site.slug}:showAll`;
const CLUSTER_COLOR = site.colors.primary;

export default function MapView({ embedded = false }) {
  const t = useTranslations("map");
  const locale = useLocale();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // Every ingested feature, kept around so the search box and the
  // LocationCard "nearby" list can read the same in-memory dataset.
  const featuresRef = useRef([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [25, 10],
      zoom: embedded ? 2 : 3,
      worldCopyJump: true,
      preferCanvas: true,
    });
    mapRef.current = map;
    if (typeof window !== "undefined") window.__wmMap = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // tolerance expands the clickable area around each canvas circle so
    // small 5–6px markers are actually hittable (default 0 = must click the
    // exact center, which made pins feel "unclickable").
    const renderer = L.canvas({ padding: 0.5, tolerance: 12 });
    const popup = L.popup();

    const makeCluster = () =>
      L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 35,
        // Without this, points stay merged into numbered clusters until
        // extreme zoom — users only ever see/click clusters (which just
        // zoom) and perceive individual points as "unclickable". At zoom
        // >= 7 every point is its own clickable marker. Kept fairly low
        // (and maxClusterRadius small) because sparse datasets like mines
        // otherwise stay clustered well past the zoom users actually use.
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

    const namedCluster = makeCluster();
    const unnamedCluster = makeCluster();
    // One delegated click handler for both clusters → opens LocationCard.
    const onClick = (e) => {
      const f = e.layer && e.layer.feature;
      if (f) setSelected(f);
    };
    // Cursor affordance: canvas circle markers don't change the cursor on
    // their own, so users can't tell a pin is clickable.
    const setCursor = (c) => {
      if (containerRef.current) containerRef.current.style.cursor = c;
    };
    const onOver = (e) => {
      if (e.layer && e.layer.feature) setCursor("pointer");
    };
    const onOut = () => setCursor("");
    for (const cl of [namedCluster, unnamedCluster]) {
      cl.on("click", onClick);
      cl.on("mouseover", onOver);
      cl.on("mouseout", onOut);
    }

    const NOUN = site.mappedNoun;
    let showAll =
      typeof window !== "undefined" && localStorage.getItem(LS_KEY) === "1";

    // Progressive load: a small "core" file (top-priority features) is
    // fetched + rendered first so the map is interactive in ~1s. The
    // larger "rest" file is NOT prefetched — it's only fetched when the
    // user clicks the "show all" toggle, so visitors who don't ask for
    // unnamed features never pay the bandwidth (can be 40+ MB on dense
    // sites like ruins). Older deployments that predate the split have
    // no core file — fall back to points.geojson.
    const named = [];
    const unnamed = [];
    let namedAdded = 0;
    let unnamedAdded = 0;
    let toggleAdded = false;
    let restLoaded = false;
    let restLoading = false;

    const setCount = () => {
      const el = document.getElementById("point-count");
      if (!el) return;
      el.textContent = showAll
        ? t("allCount", { count: named.length + unnamed.length, noun: NOUN })
        : t("namedCount", { count: named.length, noun: NOUN });
    };
    const flushNamed = () => {
      if (named.length > namedAdded) {
        namedCluster.addLayers(named.slice(namedAdded).map(mkMarker));
        namedAdded = named.length;
      }
    };
    const flushUnnamed = () => {
      if (unnamed.length > unnamedAdded) {
        unnamedCluster.addLayers(unnamed.slice(unnamedAdded).map(mkMarker));
        unnamedAdded = unnamed.length;
      }
    };
    const applyShowAll = () => {
      if (showAll) {
        flushUnnamed();
        if (unnamed.length && !map.hasLayer(unnamedCluster))
          map.addLayer(unnamedCluster);
      } else if (map.hasLayer(unnamedCluster)) {
        map.removeLayer(unnamedCluster);
      }
      setCount();
    };
    const ensureToggle = () => {
      if (toggleAdded) return;
      toggleAdded = true;
      const Toggle = L.Control.extend({
        onAdd() {
          const b = L.DomUtil.create("button", "map-toggle");
          const label = () => {
            b.textContent = showAll ? t("namedOnly") : t("showAll");
          };
          label();
          L.DomEvent.disableClickPropagation(b);
          b.addEventListener("click", async () => {
            // First time we go to show-all, also fetch points.rest.geojson.
            // We skip this on subsequent toggles because the data is already
            // in memory; applyShowAll just flips layer visibility.
            if (!showAll && !restLoaded && !restLoading) {
              b.disabled = true;
              await loadRest();
              b.disabled = false;
              // If the fetch failed, restLoaded stays false. Don't flip the
              // toggle — leave the button labeled "show all" so the user can
              // retry, and avoid the confusing state where the button looks
              // toggled but no new pins appeared.
              if (!restLoaded) return;
            }
            showAll = !showAll;
            localStorage.setItem(LS_KEY, showAll ? "1" : "0");
            label();
            applyShowAll();
          });
          return b;
        },
      });
      map.addControl(new Toggle({ position: "topright" }));
    };

    const ingest = (feats) => {
      for (const f of feats) {
        featuresRef.current.push(f);
        if (f.properties && f.properties.name) named.push(f);
        else unnamed.push(f);
      }
      flushNamed();
      if (!map.hasLayer(namedCluster)) map.addLayer(namedCluster);
      applyShowAll();
      ensureToggle();
    };

    const loadRest = async () => {
      if (restLoaded || restLoading) return;
      restLoading = true;
      try {
        const r = await fetch("/data/points.rest.geojson");
        if (!r.ok) return; // restLoaded stays false → click handler will not flip
        const g = await r.json();
        ingest(g.features || []);
        restLoaded = true;
      } catch {
        // Network error: restLoaded stays false; the toggle stays usable.
      } finally {
        restLoading = false;
      }
    };

    fetch("/data/points.core.geojson")
      .then((r) => {
        if (r.ok) return r.json();
        // Pre-split deployment: load the whole file the old way.
        return fetch("/data/points.geojson")
          .then((r2) => r2.json())
          .then((g) => ({ __full: true, features: g.features }));
      })
      .then((res) => {
        ingest((res && res.features) || []);
        // Pre-split deployments load the whole file in one fetch, so the
        // toggle should behave as a pure visibility toggle (no extra fetch
        // needed). Mark rest as already-loaded.
        if (res && res.__full) restLoaded = true;
      })
      .catch(() => {
        const el = document.getElementById("point-count");
        if (el) el.textContent = t("couldNotLoad");
      });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to a feature and open its card — shared by the search box, the
  // nearby list and (indirectly) marker clicks.
  const selectFeature = (feature) => {
    const map = mapRef.current;
    const c = feature && feature.geometry && feature.geometry.coordinates;
    if (map && c) {
      map.setView([c[1], c[0]], Math.max(map.getZoom(), 9), { animate: true });
    }
    setSelected(feature);
    setQuery("");
    setSuggestions([]);
  };

  // Autocomplete over the loaded features. Matches on name and country and
  // ranks prefix matches above substring matches; returns the top 5.
  const onSearchChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    const term = q.trim().toLowerCase();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const feats = featuresRef.current;
    const scored = [];
    for (let i = 0; i < feats.length; i++) {
      const p = feats[i].properties;
      const name = p && p.name;
      if (!name) continue;
      const nl = name.toLowerCase();
      const cl = (p.country || "").toLowerCase();
      let score = -1;
      if (nl.startsWith(term)) score = 0;
      else if (cl && cl.startsWith(term)) score = 1;
      else if (nl.includes(term)) score = 2;
      else if (cl && cl.includes(term)) score = 3;
      if (score >= 0) scored.push({ f: feats[i], score, len: name.length });
    }
    scored.sort((a, b) => a.score - b.score || a.len - b.len);
    setSuggestions(scored.slice(0, 5).map((s) => s.f));
  };

  return (
    <>
      <div
        ref={containerRef}
        className={embedded ? "" : "leaflet-fill"}
        style={{ width: "100%", height: "100%" }}
      />
      {!embedded && (
        <div className="map-overlay">
          <h1>
            {site.emoji} {site.name}
          </h1>
          <span className="count" id="point-count">
            {t("loading")}
          </span>
        </div>
      )}
      {!embedded && (
        <div className="map-search">
          <input
            type="search"
            className="map-search-input"
            value={query}
            onChange={onSearchChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions[0])
                selectFeature(suggestions[0]);
              else if (e.key === "Escape") {
                setQuery("");
                setSuggestions([]);
              }
            }}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          {suggestions.length > 0 && (
            <ul className="map-search-results">
              {suggestions.map((f, i) => {
                const p = f.properties || {};
                return (
                  <li key={i}>
                    <button type="button" onClick={() => selectFeature(f)}>
                      <span className="r-name">{p.name}</span>
                      {p.country && (
                        <span className="r-country">{p.country}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
    </>
  );
}
