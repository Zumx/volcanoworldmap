// Sitemap index — lists the four part sitemaps. Robots.txt points here.
import { BASE, SITEMAP_PARTS, sitemapIndexXml } from "../../lib/sitemap-data.js";

export const dynamic = "force-static";
export const revalidate = 86400; // daily, so drip-published posts surface

export function GET() {
  const xml = sitemapIndexXml(SITEMAP_PARTS.map((p) => `${BASE}/${p}`));
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
