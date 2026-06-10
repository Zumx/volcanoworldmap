import { getTranslations } from "next-intl/server";
import { listCountries } from "../../lib/data.js";
import { site } from "../../lib/site.js";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "../../lib/og.js";

// Reads public/data/countries.json via node:fs, so this must run on Node.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${site.name} ${site.emoji}`;

// Home (and, by inheritance, /map, /blog, /about) Open Graph image.
export default async function Image({ params }) {
  const { locale } = await params;
  const countries = await listCountries();
  const total = countries.reduce((sum, c) => sum + (c.count || 0), 0);
  const t = await getTranslations({ locale, namespace: "home" });
  return renderOgImage({
    title: site.name,
    subtitle: t("tagline", { total, noun: site.mappedNoun }),
  });
}
