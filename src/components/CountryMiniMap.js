"use client";

import dynamic from "next/dynamic";

// Leaflet needs `window`, so the actual map is client-only. This thin wrapper
// is what the (server) country page imports.
const CountryMiniMapView = dynamic(() => import("./CountryMiniMapView.js"), {
  ssr: false,
  loading: () => <div className="country-map country-map--loading" />,
});

export default function CountryMiniMap(props) {
  return <CountryMiniMapView {...props} />;
}
