// Maskable PWA icon variant: full-bleed primary background with the emoji kept
// inside the ~80% safe zone, so Android's adaptive-icon mask can crop it to any
// shape without clipping anything important. See brandmark.svg/route.js for the
// rounded "any" variant. force-static — emitted once at build time.
import { site } from "../../lib/site.js";

export const dynamic = "force-static";

export function GET() {
  const primary = site.colors?.primary || "#1a1a2e";
  const emoji = site.emoji || "📍";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${
    site.name || "Map"
  }">
  <rect width="512" height="512" fill="${primary}"/>
  <text x="256" y="262" font-size="200" text-anchor="middle" dominant-baseline="central">${emoji}</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
