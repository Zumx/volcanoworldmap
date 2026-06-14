// Re-geocode an EXISTING points.geojson in place: assign a country to every
// offshore / coastal point that the original strict point-in-polygon tagging
// left untagged, using the nearest-country-within-N-km fallback. Unlike
// fetch-data.mjs this does NOT hit Overpass — it only re-tags the data already
// on disk and rebuilds the derived indexes (countries / split / explore /
// featured / meta). Intended for niches with many offshore points (reefs,
// lighthouses, dive sites).
//
// Run from a site root:  node scripts/geocode-offshore.mjs [maxKm]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nearestCountryWithin,
  writeCountryIndex,
  writeSplit,
  writeExploreByCountry,
  writeFeatured,
  writeMeta,
  readInitialCap,
} from "./build-index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(__dirname, ".cache");
const DATA_DIR = join(ROOT, "public", "data");
const MAX_KM = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 100;

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

// Load the Natural Earth country polygons (cached offline like fetch-data.mjs),
// precomputing a bbox per country for the cheap reject in nearestCountryWithin.
async function loadCountries() {
  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, "countries.geojson");
  let geo;
  if (existsSync(cached)) {
    geo = JSON.parse(readFileSync(cached, "utf8"));
  } else {
    const res = await fetch(NE_URL, {
      headers: { "User-Agent": "worldmap-osm-map/1.0 (zumxet@gmail.com)" },
    });
    if (!res.ok) throw new Error("Natural Earth fetch failed: HTTP " + res.status);
    geo = await res.json();
    writeFileSync(cached, JSON.stringify(geo));
  }
  return geo.features.map((f) => {
    let minX = 180,
      minY = 90,
      maxX = -180,
      maxY = -90;
    const walk = (co) => {
      if (typeof co[0] === "number") {
        if (co[0] < minX) minX = co[0];
        if (co[0] > maxX) maxX = co[0];
        if (co[1] < minY) minY = co[1];
        if (co[1] > maxY) maxY = co[1];
      } else co.forEach(walk);
    };
    walk(f.geometry.coordinates);
    const p = f.properties || {};
    return {
      name: p.ADMIN || p.NAME || p.name || p.SOVEREIGNT || null,
      bbox: [minX, minY, maxX, maxY],
      feature: f,
    };
  });
}

async function main() {
  const geoPath = join(DATA_DIR, "points.geojson");
  if (!existsSync(geoPath)) {
    console.error("No public/data/points.geojson — nothing to re-geocode.");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(geoPath, "utf8"));
  const features = data.features || [];
  const before = features.filter((f) => f.properties && f.properties.country).length;

  const countries = await loadCountries();
  console.log(`Country polygons: ${countries.length}`);

  let reassigned = 0;
  for (const f of features) {
    const p = f.properties || (f.properties = {});
    if (p.country) continue;
    const g = f.geometry && f.geometry.coordinates;
    if (!g) continue;
    const name = nearestCountryWithin(countries, Number(g[0]), Number(g[1]), MAX_KM);
    if (name) {
      p.country = name;
      reassigned++;
    }
  }

  const after = before + reassigned;
  const pct = (n) => ((100 * n) / features.length).toFixed(1) + "%";
  console.log(
    `Country coverage: ${before} (${pct(before)}) -> ${after} (${pct(after)}) ` +
      `(+${reassigned} within ${MAX_KM} km)`
  );

  // Persist the re-tagged dataset and rebuild every derived artifact.
  writeFileSync(geoPath, JSON.stringify(data));
  const list = writeCountryIndex(features, DATA_DIR);
  writeSplit(features, DATA_DIR, readInitialCap(ROOT));
  const explore = writeExploreByCountry(features, list, DATA_DIR);
  await writeFeatured(features, DATA_DIR);
  writeMeta(features, DATA_DIR, geoPath);
  console.log(
    `Rebuilt indexes: ${list.length} countries, ` +
      `${explore.countries} explore files (${explore.features} features).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
