// Per-country landing pages (one per country, per locale).
import { buildCountriesEntries, urlsetXml } from "../../lib/sitemap-data.js";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const xml = urlsetXml(await buildCountriesEntries());
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
