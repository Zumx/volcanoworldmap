// Single source of truth for per-site configuration. The generator
// (C:\dev\_gen\generate.mjs) overwrites site.config.json; nothing else
// in the template needs to change between sites.
import config from "../../site.config.json";

export const site = config;

// The person behind the sites — used by the about page, the blog author box
// and JSON-LD (Article author, Organization founder). Fleet-wide constant.
export const author = { name: "Emil Björk" };

// primary + accent are author-provided; darker/lighter shades are derived
// at render time with CSS color-mix (see globals.css).
export const cssVars = {
  "--primary": config.colors.primary,
  "--accent": config.colors.accent,
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
