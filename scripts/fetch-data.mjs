// Data pipeline: OpenStreetMap Overpass -> public/data/points.geojson
//
//  1. Tiled Overpass queries (deduped) for the site's OSM key/value
//  2. Country tagging via Natural Earth polygons (offline, cached)
//  3. Optional Google Places enrichment (rating + reviewCount), prioritising
//     points that already have a website in OSM, capped per run
//
// Run: node scripts/fetch-data.mjs   (writes the file only at the very end)

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { writeCountryIndex, writeSplit, readInitialCap } from "./build-index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(__dirname, ".cache");

const site = JSON.parse(
  readFileSync(join(ROOT, "site.config.json"), "utf8")
);
const OSM_KEY = site.osm.key;
const OSM_VALUE = site.osm.value;
// One or more OSM key/value filters. Defaults to the primary osm tag;
// multi-tag sites (mineshaft+mine, sport=motor+highway=raceway) set
// site.osmFilters: [{ key, value }, ...].
const FILTERS =
  Array.isArray(site.osmFilters) && site.osmFilters.length
    ? site.osmFilters
    : [{ key: OSM_KEY, value: OSM_VALUE }];
// Include relations (multipolygons) — needed for area features like reefs.
// "out center" then yields a centroid for ways and relations alike.
const INCLUDE_RELATIONS = site.includeRelations === true;
// Drop points within this many metres of an already-kept point (collapses
// overlapping representations of one place, e.g. a raceway way plus a
// sport=motor node). 0 = no proximity dedup.
const DEDUPE_M = Number.isFinite(site.dedupeMeters) ? site.dedupeMeters : 0;
const NAMED_ONLY = site.namedOnly === true;
// Optional config-driven tag filter (Overpass source). Backward-compatible:
// absent => no extra filtering. Shape:
//   { "requireName": true, "anyOf": [ { "key": "access", "values": ["yes"] } ] }
// Keeps a feature only if it has a name (when requireName) AND at least one
// anyOf condition matches one of the element's tag values.
const INCLUDE = site.includeFilter || null;
function passesInclude(tags, name) {
  if (!INCLUDE) return true;
  if (INCLUDE.requireName && !name) return false;
  if (Array.isArray(INCLUDE.anyOf) && INCLUDE.anyOf.length) {
    const ok = INCLUDE.anyOf.some(
      (c) => c && Array.isArray(c.values) && c.values.includes(tags[c.key])
    );
    if (!ok) return false;
  }
  return true;
}
// Pluggable data source: "overpass" (default) or "openbrewerydb".
const DATA_SOURCE = site.dataSource || { type: "overpass" };
const GP = site.googlePlaces || {};
const GP_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

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
const LAT_MIN = -60,
  LAT_MAX = 78,
  LON_MIN = -180,
  LON_MAX = 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Grid-bucketed proximity dedupe: keep a feature only if no already-kept
// feature lies within `meters`. Named features win over unnamed ones, so
// pass 1 keeps all named, pass 2 adds unnamed that are still isolated.
function proximityDedupe(features, meters) {
  const cell = meters / 111320; // ~degrees latitude per metre
  const kept = [];
  const grid = new Map();
  const near = (lon, lat) => {
    const gx = Math.floor(lon / cell);
    const gy = Math.floor(lat / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${gx + dx}:${gy + dy}`);
        if (!bucket) continue;
        for (const [bl, ba] of bucket) {
          const mx = (lon - bl) * 111320 * Math.cos((lat * Math.PI) / 180);
          const my = (lat - ba) * 111320;
          if (mx * mx + my * my <= meters * meters) return true;
        }
      }
    return false;
  };
  const add = (f) => {
    const [lon, lat] = f.geometry.coordinates;
    if (near(lon, lat)) return;
    kept.push(f);
    const k = `${Math.floor(lon / cell)}:${Math.floor(lat / cell)}`;
    let b = grid.get(k);
    if (!b) grid.set(k, (b = []));
    b.push([lon, lat]);
  };
  for (const f of features) if (f.properties.name) add(f);
  for (const f of features) if (!f.properties.name) add(f);
  return kept;
}

const buildQuery = (s, w, n, e) => {
  const bbox = `(${s},${w},${n},${e})`;
  const lines = [];
  for (const { key, value } of FILTERS) {
    const sel = `["${key}"="${value}"]`;
    lines.push(`  node${sel}${bbox};`);
    lines.push(`  way${sel}${bbox};`);
    if (INCLUDE_RELATIONS) lines.push(`  relation${sel}${bbox};`);
  }
  return `[out:json][timeout:180];
(
${lines.join("\n")}
);
out center tags;`;
};

async function fetchTile(s, w, n, e) {
  const body = "data=" + encodeURIComponent(buildQuery(s, w, n, e));
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: HEADERS,
        body,
      });
      if ([429, 502, 504].includes(res.status)) {
        await sleep(8000 + attempt * 4000);
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return (await res.json()).elements || [];
    } catch (err) {
      console.log(`  retry (${attempt + 1}) ${endpoint}: ${err.message}`);
      await sleep(5000 + attempt * 3000);
    }
  }
  console.log("  !! tile failed, skipping");
  return [];
}

// ---- Country tagging (Natural Earth 110m, cached offline) ----
const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

async function loadCountries() {
  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, "countries.geojson");
  let geo;
  if (existsSync(cached)) {
    geo = JSON.parse(readFileSync(cached, "utf8"));
  } else {
    try {
      const res = await fetch(NE_URL, { headers: { "User-Agent": HEADERS["User-Agent"] } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      geo = await res.json();
      writeFileSync(cached, JSON.stringify(geo));
    } catch (err) {
      console.log("  country data unavailable, skipping tagging:", err.message);
      return [];
    }
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

function countryFor(countries, lon, lat) {
  for (const c of countries) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    try {
      if (booleanPointInPolygon([lon, lat], c.feature)) return c.name;
    } catch {
      /* skip malformed polygon */
    }
  }
  return null;
}

// Compose a human address from OSM addr:* tags (best-effort; null if none).
function osmAddress(t) {
  if (t["addr:full"]) return t["addr:full"];
  const line = [t["addr:housenumber"], t["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const parts = [
    line,
    t["addr:postcode"] && t["addr:city"]
      ? `${t["addr:postcode"]} ${t["addr:city"]}`
      : t["addr:city"] || t["addr:postcode"],
    t["addr:country"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// ---- metaFields -> OSM tag resolution (the slot system) ----
function resolveMeta(tags) {
  const out = {};
  for (const f of site.metaFields || []) {
    const candidates = [
      f.key,
      f.key === "elevation" || f.key === "height" ? "ele" : null,
      `${OSM_VALUE}:${f.key}`,
      `${OSM_KEY}:${f.key}`,
    ].filter(Boolean);
    for (const c of candidates) {
      if (tags[c] != null && tags[c] !== "") {
        out[f.key] = tags[c];
        break;
      }
    }
  }
  return out;
}

// ---- Google Places enrichment ----
async function enrichGoogle(features) {
  if (!GP.enabled || !GP_KEY) {
    if (GP.enabled && !GP_KEY)
      console.log("Google Places enabled but GOOGLE_PLACES_API_KEY unset — skipping.");
    return;
  }
  const cap = Number.isFinite(GP.cap) ? GP.cap : 800;
  // Prioritise points that already advertise a website in OSM.
  const priority =
    GP.priorityFilter === "has_website"
      ? [
          ...features.filter((f) => f.properties.website && f.properties.name),
          ...features.filter((f) => !f.properties.website && f.properties.name),
        ]
      : features.filter((f) => f.properties.name);
  const targets = priority.slice(0, cap);
  console.log(`Google Places: enriching ${targets.length} of ${features.length} (cap ${cap})...`);
  let done = 0;
  for (const f of targets) {
    const [lon, lat] = f.geometry.coordinates;
    const url =
      "https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
      `?input=${encodeURIComponent(f.properties.name)}` +
      "&inputtype=textquery" +
      `&locationbias=point:${lat},${lon}` +
      "&fields=rating,user_ratings_total" +
      `&key=${GP_KEY}`;
    try {
      const res = await fetch(url);
      const j = await res.json();
      const c = j.candidates && j.candidates[0];
      if (c && c.rating != null) {
        f.properties.googleRating = c.rating;
        f.properties.googleReviews = c.user_ratings_total || 0;
      }
    } catch {
      /* best-effort */
    }
    if (++done % 50 === 0) console.log(`  ...${done}/${targets.length}`);
    await sleep(120);
  }
  console.log(`Google Places: enriched ${done}.`);
}

// ---- OpenBreweryDB source (paginated REST, no Overpass) ----
async function fetchOpenBreweryDb() {
  const features = [];
  const seen = new Set();
  for (let page = 1; page < 1000; page++) {
    const url = `https://api.openbrewerydb.org/v1/breweries?per_page=200&page=${page}`;
    let list = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        list = await res.json();
        break;
      } catch (err) {
        console.log(`  retry page ${page} (${attempt + 1}): ${err.message}`);
        await sleep(3000 + attempt * 2000);
      }
    }
    if (!Array.isArray(list) || list.length === 0) {
      console.log(`Page ${page}: empty — done.`);
      break;
    }
    let added = 0;
    for (const b of list) {
      if (seen.has(b.id)) continue;
      const lat = b.latitude != null ? +b.latitude : null;
      const lon = b.longitude != null ? +b.longitude : null;
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon))
        continue;
      seen.add(b.id);
      const name = b.name || null;
      if (NAMED_ONLY && !name) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [+lon.toFixed(5), +lat.toFixed(5)],
        },
        properties: {
          name,
          country: b.country || null,
          website: b.website_url || null,
          opening_hours: null,
          capacity: null,
          phone: b.phone || null,
          address:
            [
              b.street,
              [b.postal_code, b.city].filter(Boolean).join(" "),
              b.state || b.state_province,
              b.country,
            ]
              .filter(Boolean)
              .join(", ") || null,
          city: b.city || null,
          state: b.state || b.state_province || null,
          type: b.brewery_type || null,
        },
      });
      added++;
    }
    console.log(`Page ${page}: ${list.length} rows, +${added} (total ${features.length})`);
    await sleep(250);
  }
  return features;
}

async function main() {
  if (DATA_SOURCE.type === "openbrewerydb") {
    console.log("Source: OpenBreweryDB (paginated REST)");
    const features = await fetchOpenBreweryDb();
    await enrichGoogle(features);
    const out = join(ROOT, "public", "data", "points.geojson");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));
    writeCountryIndex(features, join(ROOT, "public", "data"));
    writeSplit(features, join(ROOT, "public", "data"), readInitialCap(ROOT));
    const withCountry = features.filter((f) => f.properties.country).length;
    console.log(
      `\nWrote ${features.length} features (${withCountry} country-tagged) -> ${out}`
    );
    return;
  }

  const countries = await loadCountries();
  console.log(`Country polygons: ${countries.length}`);

  const seen = new Set();
  const features = [];
  const tiles = [];
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += TILE)
    for (let lon = LON_MIN; lon < LON_MAX; lon += TILE)
      tiles.push([
        lat,
        lon,
        Math.min(lat + TILE, LAT_MAX),
        Math.min(lon + TILE, LON_MAX),
      ]);

  const filterDesc = FILTERS.map((f) => `${f.key}=${f.value}`).join(" + ");
  console.log(
    `Fetching ${filterDesc}${INCLUDE_RELATIONS ? " (+relations)" : ""} in ${tiles.length} tiles...`
  );
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
      const t = el.tags || {};
      const name = t.name || t["name:en"] || null;
      if (NAMED_ONLY && !name) continue;
      if (!passesInclude(t, name)) continue;
      seen.add(key);
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [+lon.toFixed(5), +lat.toFixed(5)],
        },
        properties: {
          name,
          country: countries.length ? countryFor(countries, lon, lat) : null,
          website: t.website || t["contact:website"] || null,
          opening_hours: t.opening_hours || null,
          capacity: t.capacity || null,
          phone: t.phone || t["contact:phone"] || null,
          address: osmAddress(t),
          // Elevation (metres above sea level) straight from the OSM `ele` tag,
          // when present — shown in the LocationCard. resolveMeta() may also map
          // it into a site-specific field; the card de-duplicates.
          ele: t.ele || null,
          osmType: el.type,
          osmId: el.id,
          ...resolveMeta(t),
        },
      });
      added++;
    }
    console.log(`${els.length} elems, +${added} (total ${features.length})`);
    await sleep(1200);
  }

  const deduped = DEDUPE_M > 0 ? proximityDedupe(features, DEDUPE_M) : features;
  if (deduped !== features)
    console.log(
      `Proximity dedupe (${DEDUPE_M}m): ${features.length} -> ${deduped.length}`
    );

  await enrichGoogle(deduped);

  const out = join(ROOT, "public", "data", "points.geojson");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ type: "FeatureCollection", features: deduped })
  );
  writeCountryIndex(deduped, join(ROOT, "public", "data"));
  writeSplit(deduped, join(ROOT, "public", "data"), readInitialCap(ROOT));
  const withCountry = deduped.filter((f) => f.properties.country).length;
  console.log(
    `\nWrote ${deduped.length} features (${withCountry} country-tagged) -> ${out}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
