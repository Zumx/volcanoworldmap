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
};

export default withNextIntl(nextConfig);
