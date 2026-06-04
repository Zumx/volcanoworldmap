// Per-site brand icon, generated as a plain SVG string (no fonts, no network,
// no image pipeline) so it builds fully offline and stays identical across the
// fleet — only the colors + emoji come from site.config.json. Used as the
// favicon and as the "any" PWA manifest icon. force-static so it is emitted
// once at build time and served immutably.
import { site } from "../../lib/site.js";

export const dynamic = "force-static";

export function GET() {
  const primary = site.colors?.primary || "#1a1a2e";
  const accent = site.colors?.accent || "#e94560";
  const emoji = site.emoji || "📍";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${
    site.name || "Map"
  }">
  <rect width="512" height="512" rx="104" fill="${primary}"/>
  <circle cx="256" cy="256" r="156" fill="none" stroke="${accent}" stroke-width="16" opacity="0.9"/>
  <text x="256" y="262" font-size="224" text-anchor="middle" dominant-baseline="central">${emoji}</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
