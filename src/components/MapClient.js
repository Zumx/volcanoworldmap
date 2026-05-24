"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map must never render on the server.
// next/dynamic ssr:false is only allowed inside a client component.
const MapView = dynamic(() => import("./MapView.js"), {
  ssr: false,
  loading: () => null,
});

export default function MapClient(props) {
  return <MapView {...props} />;
}
