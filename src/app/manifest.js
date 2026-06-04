// Web App Manifest (served at /manifest.webmanifest and auto-linked by Next).
// Everything is derived from site.config.json so the same file works for every
// site in the fleet. Icons are the dynamic SVG brandmarks; modern browsers
// accept an SVG with sizes:"any" for installability, and the maskable variant
// covers Android adaptive icons.
import { site } from "../lib/site.js";

export default function manifest() {
  const primary = site.colors?.primary || "#1a1a2e";
  return {
    name: site.name,
    short_name: site.name,
    description: `An interactive world map of every ${site.mappedNoun}, sourced live from OpenStreetMap.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: primary,
    categories: ["travel", "navigation", "education"],
    icons: [
      {
        src: "/brandmark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/brandmark-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
