import { site } from "../lib/site.js";

export default function robots() {
  const base = `https://${site.domain}`;
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
