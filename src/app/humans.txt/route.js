// /humans.txt — the people + tech behind the site (humanstxt.org convention).
// Everything is derived from site.config.json so the same file ships across the
// fleet. force-static so it is emitted once at build and served immutably.
import { site } from "../../lib/site.js";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    "/* TEAM */",
    `  Site: ${site.name} ${site.emoji || ""}`.trimEnd(),
    site.contactEmail ? `  Contact: ${site.contactEmail}` : null,
    `  Site URL: https://${site.domain}`,
    "",
    "/* SITE */",
    `  An interactive world map of every ${site.mappedNoun}, sourced live from OpenStreetMap.`,
    `  Data: OpenStreetMap contributors (${site.osm.key}=${site.osm.value}), ODbL licensed.`,
    `  Refreshed: automatically once a month via a scheduled GitHub Action.`,
    `  Languages: ${(site.locales || ["en"]).join(", ")}`,
    "",
    "/* TECHNOLOGY */",
    "  Next.js (App Router), React, next-intl, Leaflet, MapLibre tiles.",
    "  Descriptions & images: Wikipedia / Wikimedia Commons, Mapillary, Google Places.",
    "  Hosting: Vercel.",
    "",
  ].filter((l) => l !== null);

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
