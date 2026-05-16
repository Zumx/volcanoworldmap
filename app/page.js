"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

export default function Home() {
  return (
    <main className="map-root">
      <MapView />
      <div className="overlay">
        <h1>🌋 Volcano World Map</h1>
        <p>Every volcano on Earth, sourced live from OpenStreetMap. Zoom in and explore the planet's fire mountains — from dormant cones to active stratovolcanoes.</p>
        <span className="count" id="point-count">
          Loading volcanoes…
        </span>
      </div>
      <div className="footer-credit">
        Data &copy;{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{" "}
        contributors
      </div>
    </main>
  );
}
