"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the interactive country map is client-only.
// This thin wrapper is what the (server) explore page imports.
const ExploreMapView = dynamic(() => import("./ExploreMapView.js"), {
  ssr: false,
  loading: () => <div className="explore-map explore-map--loading" />,
});

export default function ExploreMap(props) {
  return <ExploreMapView {...props} />;
}
