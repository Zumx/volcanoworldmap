import { countryBySlug } from "../../../lib/data.js";
import { site } from "../../../lib/site.js";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "../../../lib/og.js";

// Reads public/data/countries.json via node:fs, so this must run on Node.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${site.name} ${site.emoji}`;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Per-country Open Graph image — "<Noun> in <Country>" + the place count.
export default async function Image({ params }) {
  const { country } = await params;
  const data = await countryBySlug(country);
  if (!data) {
    return renderOgImage({ title: site.name, subtitle: site.mappedNoun });
  }
  return renderOgImage({
    title: `${cap(site.mappedNoun)} in ${data.name}`,
    subtitle: `${data.count.toLocaleString("en-US")} ${site.mappedNoun}`,
  });
}
