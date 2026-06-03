import { site } from "../lib/site.js";
import { routing } from "../i18n/routing.js";

export default function robots() {
  const base = `https://${site.domain}`;
  return {
    rules: {
      userAgent: "*",
      // Allow the root and every locale prefix; block internal API routes.
      allow: ["/", ...routing.locales.map((l) => `/${l}/`)],
      disallow: "/api/",
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
