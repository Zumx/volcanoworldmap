// Tiled Overpass fetcher -> public/data/points.geojson
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const OSM_KEY = "natural";
const OSM_VALUE = "volcano";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// overpass-api.de returns HTTP 406 to clients with no User-Agent.
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "worldmap-osm-map/1.0 (zumxet@gmail.com)",
  Accept: "application/json",
};

const TILE = 30;
const LAT_MIN = -60, LAT_MAX = 78, LON_MIN = -180, LON_MAX = 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQuery(s, w, n, e) {
  return `[out:json][timeout:180];
(
  node["${OSM_KEY}"="${OSM_VALUE}"](${s},${w},${n},${e});
  way["${OSM_KEY}"="${OSM_VALUE}"](${s},${w},${n},${e});
);
out center tags;`;
}

async function fetchTile(s, w, n, e) {
  const body = "data=" + encodeURIComponent(buildQuery(s, w, n, e));
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, { method: "POST", headers: HEADERS, body });
      if (res.status === 429 || res.status === 504 || res.status === 502) {
        await sleep(8000 + attempt * 4000);
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      return json.elements || [];
    } catch (err) {
      console.log(`  retry (${attempt + 1}) ${endpoint}: ${err.message}`);
      await sleep(5000 + attempt * 3000);
    }
  }
  console.log("  !! tile failed, skipping");
  return [];
}

async function main() {
  const seen = new Set();
  const features = [];
  const tiles = [];
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += TILE)
    for (let lon = LON_MIN; lon < LON_MAX; lon += TILE)
      tiles.push([lat, lon, Math.min(lat + TILE, LAT_MAX), Math.min(lon + TILE, LON_MAX)]);

  console.log(`Fetching ${OSM_KEY}=${OSM_VALUE} in ${tiles.length} tiles...`);
  let i = 0;
  for (const [s, w, n, e] of tiles) {
    i++;
    process.stdout.write(`[${i}/${tiles.length}] bbox ${s},${w},${n},${e} ... `);
    const els = await fetchTile(s, w, n, e);
    let added = 0;
    for (const el of els) {
      const key = el.type + el.id;
      if (seen.has(key)) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      seen.add(key);
      const t = el.tags || {};
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [+lon.toFixed(5), +lat.toFixed(5)] },
        properties: {
          name: t.name || t["name:en"] || null,
          website: t.website || t["contact:website"] || null,
        },
      });
      added++;
    }
    console.log(`${els.length} elems, +${added} (total ${features.length})`);
    await sleep(1200);
  }

  const out = join(__dirname, "..", "public", "data", "points.geojson");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`\nWrote ${features.length} features -> ${out}`);
}

main();
