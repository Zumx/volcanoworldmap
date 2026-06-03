// Derives a tiny per-country index from the big points.geojson so the
// Next.js build never has to parse the full (potentially 30MB+, 200k+
// feature) dataset — that caused build-worker OOM on large sites.
//
// Output: public/data/countries.json
//   [{ name, slug, count,
//      names:  [up to 300 sample names],
//      places: [up to 500 { name, lat, lon }] }]  (count desc)
//
// `places` powers the per-country SEO landing pages (name + coordinates +
// link to the map). Capped so the index stays tiny on huge datasets.
//
// Also splits points.geojson into two map payloads so first paint is fast
// even on 200k-feature sites:
//   public/data/points.core.geojson  — top `initialCap` features by
//       priority (Google rating > website > named); fetched + rendered
//       immediately by MapView.
//   public/data/points.rest.geojson  — everything else; MapView fetches
//       this in the background (requestIdleCallback) and appends it, so
//       the full dataset still ends up on the map, just progressively.
// initialCap comes from site.config.json ("initialCap", default 8000).
//
// Used as an npm "prebuild" step and also called directly by
// fetch-data.mjs after a fresh fetch.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function countrySlug(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCountryIndex(features) {
  const map = new Map();
  for (const f of features) {
    const c = f.properties && f.properties.country;
    if (!c) continue;
    let e = map.get(c);
    if (!e) {
      e = { name: c, slug: countrySlug(c), count: 0, names: [], places: [] };
      map.set(c, e);
    }
    e.count += 1;
    const nm = f.properties.name;
    if (nm && e.names.length < 300) e.names.push(nm);
    const g = f.geometry && f.geometry.coordinates;
    if (nm && g && e.places.length < 500) {
      const lon = Number(g[0]);
      const lat = Number(g[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const pr = f.properties;
        // Popularity proxy for the "most popular" section: Google review
        // volume dominates, with rating and having a website as weaker
        // signals. Datasets without Google data score 0 → the section
        // gracefully falls back to the alphabetical order.
        const pop =
          (Number(pr.googleReviews) || 0) +
          (pr.googleRating != null ? Number(pr.googleRating) * 20 : 0) +
          (pr.website ? 10 : 0);
        const place = {
          name: nm,
          lat: Math.round(lat * 1e5) / 1e5,
          lon: Math.round(lon * 1e5) / 1e5,
        };
        if (pr.type) place.type = String(pr.type);
        if (pop > 0) place.pop = Math.round(pop);
        e.places.push(place);
      }
    }
  }
  const list = [...map.values()].sort((a, b) => b.count - a.count);
  for (const e of list) {
    e.names.sort((a, b) => a.localeCompare(b));
    e.places.sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
}

export function writeCountryIndex(features, dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const list = buildCountryIndex(features);
  writeFileSync(join(dataDir, "countries.json"), JSON.stringify(list));
  return list;
}

const DEFAULT_INITIAL_CAP = 8000;

// site.config.json "initialCap" (positive number) or the default. Read at
// build time only; the split is purely a build artifact.
export function readInitialCap(root) {
  try {
    const cfg = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
    const n = Number(cfg.initialCap);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INITIAL_CAP;
  } catch {
    return DEFAULT_INITIAL_CAP;
  }
}

// Highest-signal features first: a Google rating is the strongest "this is
// a real, interesting place" indicator, then a website, then merely being
// named. Ties keep original order (stable) so the split is deterministic.
function priority(f) {
  const p = (f && f.properties) || {};
  return (p.googleRating != null ? 4 : 0) + (p.website ? 2 : 0) + (p.name ? 1 : 0);
}

export function splitFeatures(features, cap) {
  if (!Number.isFinite(cap) || cap <= 0 || features.length <= cap)
    return { core: features, rest: [] };
  const scored = features.map((f, i) => ({ f, s: priority(f), i }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return {
    core: scored.slice(0, cap).map((x) => x.f),
    rest: scored.slice(cap).map((x) => x.f),
  };
}

export function writeSplit(features, dataDir, cap) {
  mkdirSync(dataDir, { recursive: true });
  const { core, rest } = splitFeatures(features, cap);
  writeFileSync(
    join(dataDir, "points.core.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: core })
  );
  writeFileSync(
    join(dataDir, "points.rest.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: rest })
  );
  return { core: core.length, rest: rest.length };
}

// CLI: derive the index from an existing points.geojson.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(__dirname, "..", "public", "data");
  const geo = join(dataDir, "points.geojson");
  if (!existsSync(geo)) {
    console.log("No points.geojson — writing empty country index + split.");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "countries.json"), "[]");
    writeSplit([], dataDir, 0);
    process.exitCode = 0;
  } else {
    const { features = [] } = JSON.parse(readFileSync(geo, "utf8"));
    const list = writeCountryIndex(features, dataDir);
    const cap = readInitialCap(join(__dirname, ".."));
    const { core, rest } = writeSplit(features, dataDir, cap);
    console.log(
      `Country index: ${list.length} countries from ${features.length} features.`
    );
    console.log(
      `Map split (cap ${cap}): core ${core} + rest ${rest} features.`
    );
    process.exitCode = 0;
  }
}
