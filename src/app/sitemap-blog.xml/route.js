// Published blog posts per locale (drip-future posts excluded by listPosts).
import { buildBlogEntries, urlsetXml } from "../../lib/sitemap-data.js";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const xml = urlsetXml(await buildBlogEntries());
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
