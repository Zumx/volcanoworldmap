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
import { Link } from "../i18n/navigation.js";
import { fetchWithTimeout } from "../lib/net.js";

// Basemaps: OpenStreetMap standard in light mode, CartoDB DarkMatter in dark
// mode. Both are free tile services; CARTO requires the attribution below.
const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const prefersDark = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

// Inline icons for the custom Leaflet controls (locate-me + fullscreen).
const ICON_LOCATE =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>';
const ICON_FULLSCREEN =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>';

// LocationCard is only pulled in the first time a pin is clicked.
const LocationCard = dynamic(() => import("./LocationCard.js"), {
  ssr: false,
});

const LS_KEY = `${site.slug}:showAll`;
const CLUSTER_COLOR = site.colors.primary;

export default function MapView({
  embedded = false,
  countries = [],
  exploreCountries = {},
}) {
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
  // Flips true when the dataset can't be loaded (network error / 5s timeout) so
  // we can show a "Map unavailable" panel with a retry button.
  const [loadError, setLoadError] = useState(false);

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

    // Restore the last-viewed position (full map only). A ?name= deep link
    // loaded after the dataset still wins and re-centres on the shared place.
    const POS_KEY = `${site.slug}:mapPos`;
    if (!embedded) {
      try {
        const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
        if (
          saved &&
          Number.isFinite(saved.lat) &&
          Number.isFinite(saved.lng) &&
          Number.isFinite(saved.z)
        ) {
          map.setView([saved.lat, saved.lng], saved.z, { animate: false });
        }
      } catch {
        /* corrupt value — ignore */
      }
      const savePos = () => {
        try {
          const c = map.getCenter();
          localStorage.setItem(
            POS_KEY,
            JSON.stringify({
              lat: +c.lat.toFixed(5),
              lng: +c.lng.toFixed(5),
              z: map.getZoom(),
            })
          );
        } catch {
          /* storage blocked */
        }
      };
      map.on("moveend zoomend", savePos);
    }

    const makeTiles = () =>
      L.tileLayer(prefersDark() ? DARK_TILES : LIGHT_TILES, {
        maxZoom: 19,
        attribution: TILE_ATTR,
      });
    let tileLayer = makeTiles().addTo(map);
    // Swap the basemap live when the OS colour scheme flips.
    let mql = null;
    const onThemeChange = () => {
      if (!mapRef.current) return;
      if (tileLayer) map.removeLayer(tileLayer);
      tileLayer = makeTiles().addTo(map);
      if (tileLayer.bringToBack) tileLayer.bringToBack();
    };
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      if (mql.addEventListener) mql.addEventListener("change", onThemeChange);
      else if (mql.addListener) mql.addListener(onThemeChange);
    } catch {
      /* matchMedia unavailable — stay on the initial basemap */
    }

    // Scale bar (metric + imperial), bottom-right — keeps the bottom-left
    // corner clear for the home-page stat badges and the top-left for the
    // map overlay/zoom controls.
    L.control
      .scale({ position: "bottomright", imperial: true, metric: true })
      .addTo(map);

    // ---- Locate-me + fullscreen, stacked under the zoom control ----
    let userMarker = null;
    const doLocate = (btn) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      if (btn) btn.classList.add("is-busy");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (btn) btn.classList.remove("is-busy");
          if (!mapRef.current) return;
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], Math.max(map.getZoom(), 12), {
            animate: true,
          });
          if (userMarker) map.removeLayer(userMarker);
          userMarker = L.circleMarker([latitude, longitude], {
            radius: 8,
            weight: 3,
            color: "#fff",
            fillColor: site.colors.accent,
            fillOpacity: 1,
          }).addTo(map);
        },
        () => {
          if (btn) btn.classList.remove("is-busy");
        },
        // 5s timeout matches the rest of the app's external-call budget.
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    };
    const toggleFullscreen = () => {
      const el = containerRef.current && containerRef.current.parentElement;
      if (!el) return;
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    };
    const onFsChange = () =>
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 200);
    document.addEventListener("fullscreenchange", onFsChange);

    const ExtraControls = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const div = L.DomUtil.create("div", "leaflet-bar map-extra-ctrl");
        const mk = (label, svg, handler) => {
          const a = L.DomUtil.create("a", "", div);
          a.href = "#";
          a.setAttribute("role", "button");
          a.title = label;
          a.setAttribute("aria-label", label);
          a.innerHTML = svg;
          L.DomEvent.on(a, "click", (e) => {
            L.DomEvent.preventDefault(e);
            L.DomEvent.stop(e);
            handler(a);
          });
          return a;
        };
        mk(t("locateMe"), ICON_LOCATE, doLocate);
        mk(t("fullscreen"), ICON_FULLSCREEN, toggleFullscreen);
        L.DomEvent.disableClickPropagation(div);
        return div;
      },
    });
    map.addControl(new ExtraControls());

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
        const r = await fetchWithTimeout("/data/points.rest.geojson");
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

    // Core dataset load, wrapped so the retry button can re-run it. Each fetch
    // has a 5s timeout (fetchWithTimeout); any failure flips loadError, which
    // renders the "Map unavailable" panel instead of a stuck spinner.
    const loadCore = () => {
      setLoadError(false);
      return fetchWithTimeout("/data/points.core.geojson")
        .then((r) => {
          if (r.ok) return r.json();
          // Pre-split deployment: load the whole file the old way.
          return fetchWithTimeout("/data/points.geojson")
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
          setLoadError(true);
          setReady(true);
        });
    };

    apiRef.current = {
      rebuild,
      loadRest,
      loadCore,
      restLoaded: () => restLoaded,
    };

    loadCore();

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
      try {
        if (mql) {
          if (mql.removeEventListener)
            mql.removeEventListener("change", onThemeChange);
          else if (mql.removeListener) mql.removeListener(onThemeChange);
        }
      } catch {
        /* ignore */
      }
      document.removeEventListener("fullscreenchange", onFsChange);
      map.remove();
      mapRef.current = null;
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry the dataset load from the "Map unavailable" panel.
  const retryLoad = () => {
    setReady(false);
    if (apiRef.current && apiRef.current.loadCore) apiRef.current.loadCore();
  };

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
      {loadError && (
        <div className="map-error" role="alert">
          <div className="map-error-box">
            <span className="map-error-icon" aria-hidden="true">
              🗺️
            </span>
            <p className="map-error-title">{t("unavailable")}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={retryLoad}
            >
              {t("retry")}
            </button>
          </div>
        </div>
      )}
      {!embedded && (
        <div className="map-overlay">
          <h1>
            {site.emoji} {site.name}
          </h1>
          <span className="count" id="point-count" aria-live="polite">
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

            {country && exploreCountries[country] && (
              <Link
                className="map-filter-explore"
                href={`/explore/${exploreCountries[country]}`}
              >
                {site.emoji} {t("exploreCountry", { country })}
              </Link>
            )}

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
