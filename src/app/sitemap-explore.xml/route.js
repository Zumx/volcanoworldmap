// /explore landing pages for the top-20 best-covered countries, per locale.
import { buildExploreEntries, urlsetXml } from "../../lib/sitemap-data.js";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const xml = urlsetXml(await buildExploreEntries());
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
