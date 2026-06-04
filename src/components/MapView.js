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

// LocationCard is only pulled in the first time a pin is clicked.
const LocationCard = dynamic(() => import("./LocationCard.js"), {
  ssr: false,
});

const LS_KEY = `${site.slug}:showAll`;
const CLUSTER_COLOR = site.colors.primary;

export default function MapView({ embedded = false, countries = [] }) {
  const t = useTranslations("map");
  const tCard = useTranslations("card");
  const locale = useLocale();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // Every ingested feature, kept around so the search box, the filters and the
  // LocationCard "nearby" list can read the same in-memory dataset.
  const featuresRef = useRef([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  // Index of the keyboard-highlighted suggestion (-1 = none highlighted).
  const [activeIdx, setActiveIdx] = useState(-1);
  // Flips true once the core dataset is in: hides the skeleton loader and
  // fades the map in.
  const [ready, setReady] = useState(false);

  // ---- Filter state (driven by the React panel, applied imperatively) ----
  const [panelOpen, setPanelOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [types, setTypes] = useState([]); // distinct p.type values, as loaded
  const [restBusy, setRestBusy] = useState(false);
  // Mirror the filter values into refs so the Leaflet closures always read the
  // current selection without being re-created.
  const showAllRef = useRef(showAll);
  const countryRef = useRef(country);
  const typeRef = useRef(type);
  // Imperative bridge to the Leaflet layer logic created in the setup effect.
  const apiRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [25, 10],
      zoom: embedded ? 2 : 3,
      worldCopyJump: true,
      preferCanvas: true,
      // Arrow-key panning + +/- zoom once the map has keyboard focus.
      keyboard: true,
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

    const makeCluster = () =>
      L.markerClusterGroup({
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
    showAllRef.current =
      typeof window !== "undefined" && localStorage.getItem(LS_KEY) === "1";
    if (showAllRef.current) setShowAll(true);

    // Progressive load: a small "core" file is fetched + rendered first so the
    // map is interactive in ~1s. The larger "rest" file is only fetched when
    // the user asks to show all places, so visitors who don't never pay the
    // bandwidth. Older deployments without a core file fall back to
    // points.geojson.
    let restLoaded = false;
    let restLoading = false;
    const seenTypes = new Set();

    const matches = (f) => {
      const p = f.properties || {};
      if (!showAllRef.current && !p.name) return false;
      if (countryRef.current && p.country !== countryRef.current) return false;
      if (typeRef.current && String(p.type || "") !== typeRef.current)
        return false;
      return true;
    };

    const setCount = (named, all) => {
      const el = document.getElementById("point-count");
      if (!el) return;
      el.textContent = showAllRef.current
        ? t("allCount", { count: all, noun: NOUN })
        : t("namedCount", { count: named, noun: NOUN });
    };

    // Clear and re-add markers from the in-memory features according to the
    // current filters. Cheap enough to run on each filter change (markercluster
    // adds in chunks); only the loaded features are considered.
    const rebuild = () => {
      const named = [];
      const unnamed = [];
      const bounds = [];
      for (const f of featuresRef.current) {
        if (!matches(f)) continue;
        const c = f.geometry && f.geometry.coordinates;
        if (f.properties && f.properties.name) named.push(f);
        else unnamed.push(f);
        if ((countryRef.current || typeRef.current) && c)
          bounds.push([c[1], c[0]]);
      }
      namedCluster.clearLayers();
      unnamedCluster.clearLayers();
      namedCluster.addLayers(named.map(mkMarker));
      if (!map.hasLayer(namedCluster)) map.addLayer(namedCluster);
      if (showAllRef.current) {
        unnamedCluster.addLayers(unnamed.map(mkMarker));
        if (!map.hasLayer(unnamedCluster)) map.addLayer(unnamedCluster);
      } else if (map.hasLayer(unnamedCluster)) {
        map.removeLayer(unnamedCluster);
      }
      setCount(named.length, named.length + unnamed.length);
      // When a country/type filter is active, frame the matching places.
      if ((countryRef.current || typeRef.current) && bounds.length) {
        try {
          map.fitBounds(L.latLngBounds(bounds).pad(0.15), {
            animate: true,
            maxZoom: 12,
          });
        } catch {
          /* invalid bounds — leave the view as-is */
        }
      }
    };

    const ingest = (feats) => {
      for (const f of feats) {
        featuresRef.current.push(f);
        const tp = f.properties && f.properties.type;
        if (tp) seenTypes.add(String(tp));
      }
      setTypes([...seenTypes].sort((a, b) => a.localeCompare(b)));
      rebuild();
    };

    const loadRest = async () => {
      if (restLoaded || restLoading) return restLoaded;
      restLoading = true;
      try {
        const r = await fetch("/data/points.rest.geojson");
        if (!r.ok) return false;
        const g = await r.json();
        // Append without re-framing the view (rebuild fits only on filter
        // changes); push directly then let the caller rebuild.
        for (const f of g.features || []) {
          featuresRef.current.push(f);
          const tp = f.properties && f.properties.type;
          if (tp) seenTypes.add(String(tp));
        }
        setTypes([...seenTypes].sort((a, b) => a.localeCompare(b)));
        restLoaded = true;
        return true;
      } catch {
        return false;
      } finally {
        restLoading = false;
      }
    };

    apiRef.current = {
      rebuild,
      loadRest,
      restLoaded: () => restLoaded,
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
        if (res && res.__full) restLoaded = true;
        ingest((res && res.features) || []);
        setReady(true);
        // Deep link: /map?name=…&country=… opens the matching place so a
        // shared LocationCard link lands the visitor right on it.
        if (!embedded) openFromQuery();
      })
      .catch(() => {
        const el = document.getElementById("point-count");
        if (el) el.textContent = t("couldNotLoad");
        setReady(true);
      });

    // Match a ?name=/&country= query against the loaded features and open it.
    function openFromQuery() {
      let params;
      try {
        params = new URLSearchParams(window.location.search);
      } catch {
        return;
      }
      const name = params.get("name");
      if (!name) return;
      const nl = name.toLowerCase();
      const cc = (params.get("country") || "").toLowerCase();
      let best = null;
      for (const f of featuresRef.current) {
        const p = f.properties;
        if (!p || !p.name || p.name.toLowerCase() !== nl) continue;
        if (cc && (p.country || "").toLowerCase() !== cc) continue;
        best = f;
        break;
      }
      if (best) {
        const c = best.geometry.coordinates;
        map.setView([c[1], c[0]], Math.max(map.getZoom(), 9), {
          animate: false,
        });
        setSelected(best);
      }
    }

    return () => {
      map.remove();
      mapRef.current = null;
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply filter changes to the map. When the user turns on "show all" for the
  // first time, fetch the rest payload before rebuilding.
  useEffect(() => {
    showAllRef.current = showAll;
    countryRef.current = country;
    typeRef.current = type;
    const api = apiRef.current;
    if (!api) return;
    let cancelled = false;
    (async () => {
      if (showAll && !api.restLoaded()) {
        setRestBusy(true);
        await api.loadRest();
        setRestBusy(false);
      }
      if (!cancelled) {
        try {
          localStorage.setItem(LS_KEY, showAll ? "1" : "0");
        } catch {
          /* storage blocked */
        }
        api.rebuild();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAll, country, type]);

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
    setActiveIdx(-1);
  };

  // Keyboard support for the autocomplete: ↑/↓ move the highlight, Enter opens
  // the highlighted (or first) result, Escape clears.
  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length)
        setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length)
        setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const pick = suggestions[activeIdx] || suggestions[0];
      if (pick) selectFeature(pick);
    } else if (e.key === "Escape") {
      setQuery("");
      setSuggestions([]);
      setActiveIdx(-1);
    }
  };

  // Autocomplete over the loaded features. Matches on name and country and
  // ranks prefix matches above substring matches; returns the top 5.
  const onSearchChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    const term = q.trim().toLowerCase();
    setActiveIdx(-1);
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

  const filterCount =
    (country ? 1 : 0) + (type ? 1 : 0) + (showAll ? 1 : 0);
  const clearFilters = () => {
    setCountry("");
    setType("");
    setShowAll(false);
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`map-fade${ready ? " map-fade--in" : ""}${
          embedded ? "" : " leaflet-fill"
        }`}
        style={{ width: "100%", height: "100%" }}
        role="application"
        aria-label={t("mapLabel", { name: site.name })}
      />
      {/* Skeleton + spinner shown until the core dataset is parsed; fades out
          (kept mounted, pointer-events disabled) so the map shows through. */}
      <div className={`map-loading${ready ? " map-loading--hide" : ""}`}>
        <div className="map-spinner" aria-hidden="true" />
        <span className="map-loading-text">{t("loading")}</span>
      </div>
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
        <div
          className="map-search"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-haspopup="listbox"
          aria-owns="map-search-listbox"
        >
          <input
            type="search"
            className="map-search-input"
            value={query}
            onChange={onSearchChange}
            onKeyDown={onSearchKeyDown}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            aria-controls="map-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              activeIdx >= 0 ? `map-search-opt-${activeIdx}` : undefined
            }
            role="searchbox"
          />
          {suggestions.length > 0 && (
            <ul
              className="map-search-results"
              id="map-search-listbox"
              role="listbox"
            >
              {suggestions.map((f, i) => {
                const p = f.properties || {};
                return (
                  <li key={i} role="presentation">
                    <button
                      type="button"
                      id={`map-search-opt-${i}`}
                      role="option"
                      aria-selected={i === activeIdx}
                      className={i === activeIdx ? "is-active" : ""}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => selectFeature(f)}
                    >
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

      {!embedded && (
        <>
          <button
            type="button"
            className={`map-filter-btn${filterCount ? " is-active" : ""}`}
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            aria-label={t("filters")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 5h18M6 12h12M10 19h4"
              />
            </svg>
            <span className="map-filter-btn-label">{t("filters")}</span>
            {filterCount > 0 && (
              <span className="map-filter-badge">{filterCount}</span>
            )}
          </button>

          <div className={`map-filter-panel${panelOpen ? " is-open" : ""}`}>
            <div className="map-filter-head">
              <h2>{t("filterTitle")}</h2>
              <button
                type="button"
                className="map-filter-close"
                onClick={() => setPanelOpen(false)}
                aria-label={tCard("close")}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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

            <label className="map-filter-field">
              <span>{t("country")}</span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="">{t("allCountries")}</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {types.length > 1 && (
              <label className="map-filter-field">
                <span>{t("type")}</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">{t("allTypes")}</option>
                  {types.map((tp) => (
                    <option key={tp} value={tp}>
                      {tp}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="map-filter-field">
              <span>{t("visibility")}</span>
              <div className="map-filter-seg" role="group">
                <button
                  type="button"
                  className={!showAll ? "is-sel" : ""}
                  aria-pressed={!showAll}
                  onClick={() => setShowAll(false)}
                >
                  {t("namedOnly")}
                </button>
                <button
                  type="button"
                  className={showAll ? "is-sel" : ""}
                  aria-pressed={showAll}
                  onClick={() => setShowAll(true)}
                >
                  {restBusy ? "…" : t("showAll")}
                </button>
              </div>
            </div>

            {filterCount > 0 && (
              <button
                type="button"
                className="map-filter-clear"
                onClick={clearFilters}
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
        </>
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
