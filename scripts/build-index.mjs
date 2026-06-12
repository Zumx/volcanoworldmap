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
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
  rmSync,
} from "node:fs";
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

// ---- Nearest-country fallback (coastal / offshore geocoding) ----
// Many niches (reefs, lighthouses, dive sites) sit just offshore, so a strict
// point-in-polygon test against the Natural Earth land polygons leaves a large
// share of points with no country. These helpers assign such a point to the
// nearest country's coastline when it lies within `maxKm` of it — turning an
// offshore lighthouse 3 km off the coast into "France" instead of null.
//
// Pure functions (no I/O): they operate on the prepared country array that
// fetch-data.mjs / geocode-offshore.mjs build from the Natural Earth data:
//   [{ name, bbox: [minX, minY, maxX, maxY], feature }]  (feature = GeoJSON)
const EARTH_R_KM = 6371;
const DEG2KM = (Math.PI / 180) * EARTH_R_KM; // ~111.19 km per degree

// Distance (km) from point P to the lon/lat segment A–B, using a local
// equirectangular projection (longitude scaled by cos(lat)). Accurate enough at
// the sub-100 km scales we care about here.
function segDistKm(plon, plat, alon, alat, blon, blat) {
  const cosLat = Math.cos((plat * Math.PI) / 180);
  const ax = (alon - plon) * cosLat,
    ay = alat - plat;
  const bx = (blon - plon) * cosLat,
    by = blat - plat;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return Math.hypot(cx, cy) * DEG2KM;
}

// Minimum distance (km) from a point to a country's polygon boundary. Walks
// every ring of the Polygon/MultiPolygon. Returns early once within `bestStop`.
function minDistToCountryKm(feature, lon, lat, bestSoFar) {
  let best = bestSoFar;
  const rings = (poly) => {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        const d = segDistKm(lon, lat, a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
        if (best < 1) return; // close enough — stop scanning this country
      }
    }
  };
  const g = feature.geometry;
  if (!g) return best;
  if (g.type === "Polygon") rings(g.coordinates);
  else if (g.type === "MultiPolygon") for (const poly of g.coordinates) rings(poly);
  return best;
}

export function nearestCountryWithin(countries, lon, lat, maxKm = 100) {
  const padDeg = maxKm / 111 + 0.0001; // bbox slack so coastal points qualify
  let bestName = null;
  let bestDist = maxKm;
  for (const c of countries) {
    const [minX, minY, maxX, maxY] = c.bbox;
    // Cheap bbox reject: skip countries that can't possibly be within maxKm.
    if (
      lon < minX - padDeg ||
      lon > maxX + padDeg ||
      lat < minY - padDeg ||
      lat > maxY + padDeg
    )
      continue;
    const d = minDistToCountryKm(c.feature, lon, lat, bestDist);
    if (d < bestDist) {
      bestDist = d;
      bestName = c.name;
    }
  }
  return bestName;
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

// Per-country map payloads for the /explore landing pages. Each landing page
// only ever shows ONE country, so shipping the whole (multi-MB) points.geojson
// to it is wasteful. Here we pre-split the dataset into one small file per
// top-`topN` country — public/data/explore/<country-slug>.geojson — holding
// just that country's features. ExploreMapView fetches its own country's file
// and falls back to the core split only if the file is missing (older deploys).
//
// `topN` mirrors the explore route's TOP_N (only the best-covered countries get
// a landing page), so we never write files no page will request. The directory
// is cleared first so a shrinking dataset can't leave stale country files.
export function writeExploreByCountry(features, list, dataDir, topN = 20) {
  const dir = join(dataDir, "explore");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // list is sorted by count desc → the first topN are the landing-page countries.
  const wanted = new Map(); // country name -> slug
  for (const e of list.slice(0, topN)) wanted.set(e.name, e.slug);
  if (!wanted.size) return { countries: 0, features: 0 };
  const buckets = new Map(); // slug -> features[]
  for (const f of features) {
    const c = f.properties && f.properties.country;
    if (!c) continue;
    const slug = wanted.get(c);
    if (!slug) continue;
    let b = buckets.get(slug);
    if (!b) buckets.set(slug, (b = []));
    b.push(f);
  }
  let total = 0;
  for (const [slug, feats] of buckets) {
    writeFileSync(
      join(dir, `${slug}.geojson`),
      JSON.stringify({ type: "FeatureCollection", features: feats })
    );
    total += feats.length;
  }
  return { countries: buckets.size, features: total };
}

// ---- Build-time image resolution for the home-page featured cards ----
// Historically each FeaturedDestinations card ran the client-side enrichLocation
// lookup on mount (a Wikipedia + Wikimedia round-trip per card), which delayed
// the hero imagery and hurt LCP. We now resolve the image URL once at build time
// and bake it into featured.json, so the card can render the <img> immediately.
// All calls are best-effort with a hard timeout; a miss just leaves the card to
// fall back to its client-side lookup (unchanged behaviour for that card).
const FEATURED_LANG = "en"; // home page featured cards are resolved in English
const IMG_MAX_GEO_KM = 50; // reject Wikipedia hits farther than this from the pin

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON GET with a hard timeout and polite retry on rate limiting. Wikipedia /
// Wikimedia throttle aggressively (HTTP 429) when a build resolves several
// images in quick succession, so we honour Retry-After / back off exponentially
// rather than silently giving up (which would leave the card image-less).
async function fetchJSON(url, ms = 8000, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "worldmap-build/1.0 (zumxet@gmail.com)" },
        signal: controller.signal,
      });
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Geo-verified Wikipedia lead image: search "<name> <country>", walk the top
// hits and return the first article that sits within IMG_MAX_GEO_KM of the pin
// (so a generic name can't pull an unrelated subject's photo).
async function wikiFeaturedImage(name, country, lat, lon) {
  const query = country ? `${name} ${country}` : name;
  const searchUrl =
    `https://${FEATURED_LANG}.wikipedia.org/w/rest.php/v1/search/page` +
    `?q=${encodeURIComponent(query)}&limit=5`;
  const sJson = await fetchJSON(searchUrl);
  const pages = (sJson && sJson.pages) || [];
  for (const page of pages.slice(0, 5)) {
    const sumUrl =
      `https://${FEATURED_LANG}.wikipedia.org/api/rest_v1/page/summary/` +
      encodeURIComponent(page.key || page.title);
    const j = await fetchJSON(sumUrl);
    if (!j || j.type === "disambiguation") continue;
    const coord = j.coordinates;
    if (!coord || typeof coord.lat !== "number" || typeof coord.lon !== "number")
      continue;
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      haversineKm(lat, lon, coord.lat, coord.lon) > IMG_MAX_GEO_KM
    )
      continue;
    const img =
      (j.originalimage && j.originalimage.source) ||
      (j.thumbnail && j.thumbnail.source) ||
      null;
    if (img) return img;
  }
  return null;
}

// Location-safe fallback: nearest Wikimedia Commons photo by coordinates.
async function commonsFeaturedImage(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const url =
    "https://commons.wikimedia.org/w/api.php?origin=*&format=json" +
    "&action=query&generator=geosearch&ggsnamespace=6&ggslimit=1" +
    `&ggscoord=${lat}|${lon}&ggsradius=2000` +
    "&prop=imageinfo&iiprop=url&iiurlwidth=1024";
  const j = await fetchJSON(url);
  const pages = j && j.query && j.query.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  const info = first && first.imageinfo && first.imageinfo[0];
  return info ? info.thumburl || info.url || null : null;
}

async function resolveFeaturedImage(item) {
  try {
    const wiki = await wikiFeaturedImage(item.name, item.country, item.lat, item.lon);
    if (wiki) return wiki;
    return await commonsFeaturedImage(item.lat, item.lon);
  } catch {
    return null;
  }
}

// Six diverse "featured destinations" for the home page — one per country,
// preferring places that carry a website (a decent proxy for a notable,
// well-documented place likely to have a Wikipedia/Wikimedia photo). The hero
// image URL is resolved at build time (resolveFeaturedImage) and baked into
// each item so the home page can paint it immediately — see writeFeatured. The
// client still falls back to its own lookup for any item that resolved no image.
export function buildFeatured(features, n = 6) {
  const round = (v) => Math.round(v * 1e5) / 1e5;
  const out = [];
  const used = new Set();
  const take = (requireWebsite) => {
    for (const f of features) {
      if (out.length >= n) break;
      const p = f.properties || {};
      const g = f.geometry && f.geometry.coordinates;
      if (!p.name || !p.country || !g || used.has(p.country)) continue;
      if (requireWebsite && !p.website) continue;
      const lat = Number(g[1]);
      const lon = Number(g[0]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({ name: p.name, country: p.country, lat: round(lat), lon: round(lon) });
      used.add(p.country);
    }
  };
  take(true); // pass 1: website-bearing, one per country
  take(false); // pass 2: fill from any named place in a fresh country
  return out;
}

export async function writeFeatured(features, dataDir, n = 6) {
  mkdirSync(dataDir, { recursive: true });
  const featured = buildFeatured(features, n);
  // Resolve each card's hero image at build time. Done serially (not in
  // parallel) to stay under Wikipedia/Wikimedia rate limits — there are only a
  // handful of cards, so the extra wall-clock is negligible and the hit rate is
  // far higher than firing all requests at once.
  for (const it of featured) {
    const img = await resolveFeaturedImage(it);
    if (img) it.image = img;
  }
  writeFileSync(join(dataDir, "featured.json"), JSON.stringify(featured));
  return featured;
}

// Small meta sidecar for the stats dashboard: dataset totals + a "last
// updated" date taken from the points.geojson file mtime (set when the
// monthly fetch rewrote it) and falling back to the build date.
export function writeMeta(features, dataDir, geojsonPath) {
  mkdirSync(dataDir, { recursive: true });
  let updated = null;
  try {
    if (geojsonPath && existsSync(geojsonPath))
      updated = statSync(geojsonPath).mtime.toISOString().slice(0, 10);
  } catch {
    /* fall back below */
  }
  if (!updated) updated = new Date().toISOString().slice(0, 10);
  const countrySet = new Set();
  for (const f of features) {
    const c = f.properties && f.properties.country;
    if (c) countrySet.add(c);
  }
  const meta = {
    updated,
    places: features.length,
    countries: countrySet.size,
  };
  writeFileSync(join(dataDir, "meta.json"), JSON.stringify(meta));
  return meta;
}

// Blog search index — powers the "In the blog" links on the map's
// LocationCard. For each locale it stores a compact, lowercased searchable
// string (title + excerpt + ## headings + slug words) per published post so
// the client can substring-match a place name against the blog without
// shipping the full post bodies. Future-dated (drip) posts are excluded —
// they'd 404 if linked — so this is regenerated on every build/refresh.
//
// Output: public/data/blog-index.json
//   { "<locale>": [ { s: slug, t: title, h: haystack }, ... ], ... }
//
// Tiny hand-rolled frontmatter read (no gray-matter dependency at build
// time): only the few fields we index are pulled out.
function readFrontmatter(raw) {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };
  const fm = raw.slice(3, end);
  const body = raw.slice(end + 4);
  const data = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    data[m[1]] = v;
  }
  return { data, body };
}

export function buildBlogIndex(blogDir, today) {
  const out = {};
  let locales = [];
  try {
    locales = readdirSync(blogDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^[a-z]{2}$/.test(d.name))
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const locale of locales) {
    const dir = join(blogDir, locale);
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
    } catch {
      continue;
    }
    const posts = [];
    for (const file of files) {
      const slug = file.replace(/\.mdx$/, "");
      let raw;
      try {
        raw = readFileSync(join(dir, file), "utf8");
      } catch {
        continue;
      }
      const { data, body } = readFrontmatter(raw);
      // Skip drip posts not yet published (a link would 404).
      if (data.date && String(data.date).slice(0, 10) > today) continue;
      const title = data.title || slug;
      const excerpt = data.excerpt || data.description || "";
      const headings = (body.match(/^##\s+(.+)$/gm) || [])
        .map((h) => h.replace(/^##\s+/, ""))
        .join(" ");
      const slugWords = slug.replace(/-/g, " ");
      let hay = `${title} ${excerpt} ${headings} ${slugWords}`
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      // Cap to keep the shipped index small even on long posts, but high
      // enough to retain the full title + excerpt + every ## heading (the
      // fields most likely to carry a place name).
      if (hay.length > 700) hay = hay.slice(0, 700);
      posts.push({ s: slug, t: title, h: hay });
    }
    posts.sort((a, b) => a.s.localeCompare(b.s));
    out[locale] = posts;
  }
  return out;
}

export function writeBlogIndex(root, dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const blogDir = join(root, "src", "content", "blog");
  const today = new Date().toISOString().slice(0, 10);
  const index = buildBlogIndex(blogDir, today);
  writeFileSync(join(dataDir, "blog-index.json"), JSON.stringify(index));
  let total = 0;
  for (const k of Object.keys(index)) total += index[k].length;
  return { locales: Object.keys(index).length, posts: total };
}

// CLI: derive the index from an existing points.geojson. Guard on argv[1] so
// importing this module (e.g. from fetch-data.mjs) never runs the CLI block.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, "..");
  const dataDir = join(root, "public", "data");
  const geo = join(dataDir, "points.geojson");
  if (!existsSync(geo)) {
    console.log("No points.geojson — writing empty country index + split.");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "countries.json"), "[]");
    writeFileSync(join(dataDir, "featured.json"), "[]");
    writeMeta([], dataDir, geo);
    writeSplit([], dataDir, 0);
    const blog = writeBlogIndex(root, dataDir);
    console.log(
      `Blog index: ${blog.posts} posts across ${blog.locales} locales.`
    );
    process.exitCode = 0;
  } else {
    const { features = [] } = JSON.parse(readFileSync(geo, "utf8"));
    const list = writeCountryIndex(features, dataDir);
    const featured = await writeFeatured(features, dataDir);
    writeMeta(features, dataDir, geo);
    const cap = readInitialCap(root);
    const { core, rest } = writeSplit(features, dataDir, cap);
    const explore = writeExploreByCountry(features, list, dataDir);
    const blog = writeBlogIndex(root, dataDir);
    const withImg = featured.filter((f) => f.image).length;
    console.log(`Featured destinations: ${featured.length} (${withImg} with image).`);
    console.log(
      `Country index: ${list.length} countries from ${features.length} features.`
    );
    console.log(
      `Map split (cap ${cap}): core ${core} + rest ${rest} features.`
    );
    console.log(
      `Explore per-country: ${explore.countries} files, ${explore.features} features.`
    );
    console.log(
      `Blog index: ${blog.posts} posts across ${blog.locales} locales.`
    );
    process.exitCode = 0;
  }
}
