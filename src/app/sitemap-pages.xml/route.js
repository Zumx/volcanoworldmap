// Static site sections (home, map, blog, search, stats, faq, about) per locale.
import { buildPagesEntries, urlsetXml } from "../../lib/sitemap-data.js";

export const dynamic = "force-static";
export const revalidate = 86400;

export function GET() {
  const xml = urlsetXml(buildPagesEntries());
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
