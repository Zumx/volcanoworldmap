// Single source of truth for per-site configuration. The generator
// (C:\dev\_gen\generate.mjs) overwrites site.config.json; nothing else
// in the template needs to change between sites.
import config from "../../site.config.json";
import { getContrastColor } from "./contrast.js";

export const site = config;

// Serialize an object for embedding in a <script type="application/ld+json">
// block. Plain JSON.stringify does NOT escape "<", so a string containing
// "</script>" (e.g. a world-editable OpenStreetMap place name) could break out
// of the script tag. Escaping "<" as < is the standard, sufficient guard.
export function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

// The person behind the sites — used by the about page, the blog author box
// and JSON-LD (Article author, Organization founder). Fleet-wide constant.
export const author = { name: "Emil Björk" };

// primary + accent are author-provided; darker/lighter shades are derived
// at render time with CSS color-mix (see globals.css). --accent-contrast is the
// legible text/icon color (near-black or white) for anything painted ON the
// accent — the navbar "Map" pill, the hero band, accent CTAs. Computed once
// per site so light accents (gold/pale yellow) get dark text instead of the
// old hard-coded white.
export const cssVars = {
  "--primary": config.colors.primary,
  "--accent": config.colors.accent,
  "--accent-contrast": getContrastColor(config.colors.accent),
};

export function metaFieldsFor(properties) {
  if (!properties) return [];
  return (site.metaFields || [])
    .map((f) => {
      const raw = properties[f.key];
      if (raw == null || raw === "") return null;
      const value = f.unit ? `${raw} ${f.unit}` : String(raw);
      return { label: f.label, value };
    })
    .filter(Boolean);
}
