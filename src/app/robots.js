import { site } from "../lib/site.js";
import { routing } from "../i18n/routing.js";

export default function robots() {
  const base = `https://${site.domain}`;
  return {
    rules: {
      userAgent: "*",
      // Allow the root and every locale prefix; block internal API routes and
      // Next's build-asset folder. crawlDelay throttles aggressive bots so the
      // origin stays responsive (Googlebot ignores it; Bing/Yandex honour it).
      allow: ["/", ...routing.locales.map((l) => `/${l}/`)],
      disallow: ["/api/", "/_next/"],
      crawlDelay: 10,
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
