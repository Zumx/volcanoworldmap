// Build-time country data. Reads the tiny precomputed index
// (public/data/countries.json, written by scripts/build-index.mjs as a
// "prebuild" step) instead of the full multi-MB points.geojson — keeps
// the Next build memory-flat regardless of dataset size. The client map
// fetches /data/points.geojson directly in the browser.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { countrySlug } from "../../scripts/build-index.mjs";

export { countrySlug };

let cache = null;

async function loadIndex() {
  if (cache) return cache;
  try {
    const p = join(process.cwd(), "public", "data", "countries.json");
    cache = JSON.parse(await readFile(p, "utf8"));
  } catch {
    cache = [];
  }
  return cache;
}

export async function listCountries() {
  const idx = await loadIndex();
  return idx.map(({ name, slug, count }) => ({ name, slug, count }));
}

export async function countryBySlug(slug) {
  const idx = await loadIndex();
  const e = idx.find((c) => c.slug === slug);
  if (!e) return null;
  return {
    name: e.name,
    slug: e.slug,
    count: e.count,
    names: e.names || [],
    places: e.places || [],
  };
}
