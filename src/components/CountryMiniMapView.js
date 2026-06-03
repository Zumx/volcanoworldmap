"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { site } from "../lib/site.js";

// Non-interactive preview of a country's places: plots up to `max` markers on
// a small Leaflet canvas and fits the view to them. Scroll-wheel zoom is off
// so the map never hijacks page scrolling; users go to the full /map to dig in.
export default function CountryMiniMapView({ points = [], max = 200 }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    const pts = points
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .slice(0, max);

    const map = L.map(ref.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    const renderer = L.canvas({ padding: 0.5 });
    const color = (site.colors && site.colors.primary) || "#1a1a2e";
    const latlngs = [];
    for (const p of pts) {
      latlngs.push([p.lat, p.lon]);
      L.circleMarker([p.lat, p.lon], {
        renderer,
        radius: 5,
        weight: 1.5,
        color: "#fff",
        fillColor: color,
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindTooltip(p.name, { direction: "top" });
    }

    if (latlngs.length) {
      map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
    } else {
      map.setView([20, 0], 1);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="country-map" />;
}
