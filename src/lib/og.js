import { ImageResponse } from "next/og";
import { site } from "./site.js";

// Standard Open Graph card dimensions (also used for Twitter summary_large_image).
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Shared Open Graph card used by the home, blog-post and country routes.
// Pure inline styles only — this renders through Satori (next/og), which
// supports a flexbox subset and no external CSS. Every div with more than
// one child must declare display:flex. Brand colours come from
// site.config.json so each site in the fleet gets on-brand share images.
export function renderOgImage({ title, subtitle } = {}) {
  const primary = (site.colors && site.colors.primary) || "#1a1a2e";
  const accent = (site.colors && site.colors.accent) || "#e94560";
  const heading = title || `${site.name}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 42 }}>
          <span style={{ fontSize: 58, marginRight: 20 }}>{site.emoji}</span>
          <span style={{ fontWeight: 700 }}>{site.name}</span>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: heading.length > 46 ? 60 : 78,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            maxWidth: "100%",
          }}
        >
          {heading}
        </div>

        {/* Footer row: subtitle (count) + domain */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 30,
            opacity: 0.92,
          }}
        >
          <span style={{ display: "flex" }}>{subtitle || ""}</span>
          <span style={{ display: "flex", fontWeight: 700 }}>{site.domain}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, emoji: "twemoji" }
  );
}
