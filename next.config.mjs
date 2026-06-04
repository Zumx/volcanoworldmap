import { readFileSync } from "node:fs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.js");

// Read the canonical domain straight from site.config.json. next.config.mjs is
// loaded by Node (not bundled), so we read the file rather than `import`-ing it
// to stay independent of JSON import-attribute support across Node versions.
const site = JSON.parse(
  readFileSync(new URL("./site.config.json", import.meta.url))
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "**.wikipedia.org" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "https", hostname: "**.mapillary.com" },
      { protocol: "https", hostname: "scontent**.fbcdn.net" },
    ],
  },
  async redirects() {
    return [
      // Canonical-host redirect. The site is also reachable at its
      // *.vercel.app alias, which Google indexed as a duplicate host and
      // whose sitemap it rejected ("URL not allowed for a sitemap at this
      // location") because every <loc> points at the canonical domain.
      // 308 every vercel.app host (prod alias + preview deploys) to the
      // canonical domain so there is only one indexable host.
      {
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: `https://${site.domain}/:path*`,
        permanent: true,
      },
    ];
  },
  async headers() {
    // Note: /_next/static is already served `immutable, max-age=31536000` by
    // Next itself, so we don't (and shouldn't) set it here.
    return [
      {
        // Map/data artifacts (points.geojson, countries.json, …): refreshed
        // only on the monthly rebuild, so serve from cache for an hour and keep
        // serving the stale copy for a week while it revalidates in the
        // background — fast repeat loads without ever blocking on a fetch.
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // The per-site SVG brandmark is effectively static between deploys.
        source: "/:file(brandmark|brandmark-maskable).svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // The service worker must be re-checked on every load so updates roll
        // out promptly — never cache it for long.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
