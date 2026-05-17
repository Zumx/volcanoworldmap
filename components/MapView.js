"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const CLUSTER_COLOR = "#d1410c";
const UNNAMED = "Unnamed volcano";
const NOUN = "volcanoes";

export default function MapView() {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !ref.current) return;

    const map = L.map(ref.current, {
      center: [25, 10],
      zoom: 3,
      worldCopyJump: true,
      preferCanvas: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Canvas renderer + circle markers scale to hundreds of thousands of
    // points where one DOM/divIcon per marker would freeze the browser.
    // tolerance:12 — default 0 forces an exact ~5px center hit, which on a
    // clustered world map is effectively impossible (the real "unclickable" bug).
    const renderer = L.canvas({ padding: 0.5, tolerance: 12 });
    const popup = L.popup();

    function makeCluster() {
      const cl = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 55,
        // Stop clustering once zoomed in so individual points render as
        // discrete, clickable circle markers instead of permanent clusters.
        disableClusteringAtZoom: 10,
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
      // One delegated handler instead of binding a popup to every marker.
      cl.on("click", (e) => {
        const p = e.layer && e.layer.feature && e.layer.feature.properties;
        if (!p) return;
        const name = p.name || UNNAMED;
        const site = p.website
          ? `<br/><a href="${p.website}" target="_blank" rel="noreferrer">Website</a>`
          : "";
        popup.setLatLng(e.latlng).setContent(`<strong>${name}</strong>${site}`).openOn(map);
      });
      cl.on("mouseover", (e) => {
        if (e.layer && e.layer.feature) map.getContainer().style.cursor = "pointer";
      });
      cl.on("mouseout", () => {
        map.getContainer().style.cursor = "";
      });
      return cl;
    }

    const mkMarker = (f) => {
      const c = f.geometry.coordinates;
      const m = L.circleMarker([c[1], c[0]], {
        renderer,
        radius: 6,
        weight: 2,
        color: "#ffffff",
        fillColor: CLUSTER_COLOR,
        fillOpacity: 0.85,
        bubblingMouseEvents: false,
      });
      m.feature = f;
      return m;
    };

    const namedCluster = makeCluster();
    const unnamedCluster = makeCluster();

    fetch("data/points.geojson")
      .then((r) => r.json())
      .then((geo) => {
        const feats = geo.features || [];
        const namedMarkers = [];
        const unnamedFeats = [];
        for (let i = 0; i < feats.length; i++) {
          if (feats[i].properties && feats[i].properties.name)
            namedMarkers.push(mkMarker(feats[i]));
          else unnamedFeats.push(feats[i]);
        }
        namedCluster.addLayers(namedMarkers);
        map.addLayer(namedCluster);

        const el = document.getElementById("point-count");
        let shown = false;
        let built = false;
        const setCount = () => {
          if (!el) return;
          el.textContent = shown
            ? `${(namedMarkers.length + unnamedFeats.length).toLocaleString()} ${NOUN} mapped`
            : `${namedMarkers.length.toLocaleString()} named ${NOUN}`;
        };
        setCount();

        if (unnamedFeats.length) {
          const Toggle = L.Control.extend({
            onAdd: function () {
              const b = L.DomUtil.create("button", "toggle-unnamed");
              const label = () => {
                b.textContent = shown
                  ? "Hide unnamed"
                  : `Show ${unnamedFeats.length.toLocaleString()} unnamed`;
              };
              label();
              L.DomEvent.disableClickPropagation(b);
              b.addEventListener("click", () => {
                if (!shown) {
                  if (!built) {
                    b.textContent = "Loading…";
                    setTimeout(() => {
                      unnamedCluster.addLayers(unnamedFeats.map(mkMarker));
                      built = true;
                      map.addLayer(unnamedCluster);
                      shown = true;
                      label();
                      setCount();
                    }, 10);
                    return;
                  }
                  map.addLayer(unnamedCluster);
                  shown = true;
                } else {
                  map.removeLayer(unnamedCluster);
                  shown = false;
                }
                label();
                setCount();
              });
              return b;
            },
          });
          map.addControl(new Toggle({ position: "topright" }));
        }
      })
      .catch(() => {
        const el = document.getElementById("point-count");
        if (el) el.textContent = "Could not load data";
      });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
