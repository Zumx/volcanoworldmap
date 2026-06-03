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

// Six diverse "featured destinations" for the home page — one per country,
// preferring places that carry a website (a decent proxy for a notable,
// well-documented place likely to have a Wikipedia/Wikimedia photo). Only
// name/country/coords are stored; the home page enriches the image
// client-side via the same path the LocationCard uses.
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

export function writeFeatured(features, dataDir, n = 6) {
  mkdirSync(dataDir, { recursive: true });
  const featured = buildFeatured(features, n);
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

// CLI: derive the index from an existing points.geojson.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
    const featured = writeFeatured(features, dataDir);
    writeMeta(features, dataDir, geo);
    const cap = readInitialCap(root);
    const { core, rest } = writeSplit(features, dataDir, cap);
    const blog = writeBlogIndex(root, dataDir);
    console.log(`Featured destinations: ${featured.length}.`);
    console.log(
      `Country index: ${list.length} countries from ${features.length} features.`
    );
    console.log(
      `Map split (cap ${cap}): core ${core} + rest ${rest} features.`
    );
    console.log(
      `Blog index: ${blog.posts} posts across ${blog.locales} locales.`
    );
    process.exitCode = 0;
  }
}
