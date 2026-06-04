// Client-side, lazy enrichment for LocationCard. Nothing here runs until a
// pin is actually clicked (LocationCard is a next/dynamic ssr:false chunk and
// fires this from a useEffect). All calls are best-effort and degrade
// silently. Wikipedia + Wikimedia Commons need no key; Mapillary uses
// NEXT_PUBLIC_MAPILLARY_TOKEN when present and is only a last-resort fallback.

const MAPILLARY_TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || "";

// How far a Wikipedia article's coordinates may sit from the pin before we
// treat it as a different place and reject it. Places with generic names
// ("Resilin", "Left side") otherwise match proteins, games, etc.
const MAX_GEO_DISTANCE_KM = 50;

// A geographic article must carry at least this much intro text. Anything
// shorter is almost always a stub of the wrong (non-place) subject.
const MIN_EXTRACT_CHARS = 100;

// Non-geographic subjects that share names with real places. We reject an
// article when its Wikidata short description or any of its categories match
// one of these — proteins, chemicals, species, games, films, music, athletes,
// companies, software, etc. are never the place the user clicked on.
const NON_GEOGRAPHIC = new RegExp(
  [
    // biology / chemistry / medicine
    "protein", "enzyme", "\\bgene\\b", "genus", "species", "molecul",
    "chemical", "compound", "\\bacid\\b", "hormone", "bacteri", "organism",
    "\\bdisease\\b", "\\bdrug\\b", "\\bvirus\\b", "mineral\\b", "\\balloy\\b",
    // games / film / tv
    "video game", "board game", "\\bfilm\\b", "\\bmovie\\b",
    "television series", "\\btv series\\b", "anime", "manga",
    // music
    "\\bsong\\b", "\\balbum\\b", "\\bband\\b", "musician", "\\bsingle\\b",
    "soundtrack", "\\bep\\b",
    // people / athletes
    "footballer", "\\bplayer\\b", "athlete", "cyclist", "\\bboxer\\b",
    "actor", "actress", "singer", "politician", "writer", "novelist",
    "\\bborn\\b",
    // commerce / tech
    "company", "corporation", "\\bbrand\\b", "manufacturer", "software",
    "\\bairline\\b", "video game developer", "record label",
  ].join("|"),
  "i"
);

// Trim a Wikipedia intro to at most `max` sentences so the card stays short.
// Deliberately simple: split on sentence-ending punctuation followed by
// whitespace. Common abbreviations (e.g. "St.", "Mt.") may occasionally cut
// early — acceptable for a 3-sentence teaser.
function firstSentences(text, max = 3) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+(?:["')\]]+)?|\S[^.!?]*$/g);
  if (!parts) return clean;
  return parts.slice(0, max).join(" ").trim();
}

// Great-circle distance in km between two lat/lon points (haversine).
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// True when a Wikidata description or category string smells non-geographic.
function looksNonGeographic(text) {
  return !!text && NON_GEOGRAPHIC.test(text);
}

// Fetch up to `cllimit` category names for a page (best-effort, returns []).
async function pageCategories(lang, title) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?origin=*&format=json` +
    "&action=query&prop=categories&cllimit=20&clshow=!hidden" +
    `&titles=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const j = await res.json();
    const pages = j.query && j.query.pages;
    if (!pages) return [];
    const first = Object.values(pages)[0];
    return (first && first.categories
      ? first.categories.map((c) => c.title || "")
      : []
    );
  } catch {
    return [];
  }
}

// Validate one Wikipedia summary against the pin: it must be a real geographic
// article (has coordinates), sit within MAX_GEO_DISTANCE_KM of the pin, not be
// a known non-geographic subject, and carry a usable intro. Returns the shaped
// result on success, or null to reject.
async function verifySummary(j, lang, lat, lon) {
  if (!j || j.type === "disambiguation") return null;

  // Geo-verification: no coordinates → not a place; too far → wrong place.
  const coord = j.coordinates;
  if (!coord || typeof coord.lat !== "number" || typeof coord.lon !== "number")
    return null;
  if (typeof lat === "number" && typeof lon === "number") {
    if (distanceKm(lat, lon, coord.lat, coord.lon) > MAX_GEO_DISTANCE_KM)
      return null;
  }

  // Category / description filter: reject biology, chemistry, games, film,
  // music, athletes, companies, etc.
  if (looksNonGeographic(j.description)) return null;
  const cats = await pageCategories(lang, j.title);
  if (cats.some(looksNonGeographic)) return null;

  // Minimum text length.
  const raw = (j.extract || "").trim();
  if (raw.length < MIN_EXTRACT_CHARS) return null;

  return {
    extract: firstSentences(raw, 3),
    image:
      (j.originalimage && j.originalimage.source) ||
      (j.thumbnail && j.thumbnail.source) ||
      null,
    url:
      (j.content_urls &&
        j.content_urls.desktop &&
        j.content_urls.desktop.page) ||
      null,
  };
}

// Wikipedia: search "<name> <country>" (disambiguating generic names by
// region), then walk the top results and return the first that passes
// geo-verification, the category filter and the length check.
async function wikipediaSummary(name, country, lat, lon, locale) {
  const lang = (locale || "en").split("-")[0];
  const query = country ? `${name} ${country}` : name;
  const searchUrl =
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page` +
    `?q=${encodeURIComponent(query)}&limit=5`;
  const sRes = await fetch(searchUrl, { headers: { Accept: "application/json" } });
  if (!sRes.ok) return null;
  const sJson = await sRes.json();
  const pages = (sJson && sJson.pages) || [];
  if (!pages.length) return null;

  for (const page of pages) {
    const sumUrl =
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` +
      encodeURIComponent(page.key || page.title);
    const res = await fetch(sumUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) continue;
    const j = await res.json();
    const verified = await verifySummary(j, lang, lat, lon);
    if (verified) return verified;
  }
  return null;
}

// Geo-anchored image source: geosearch Commons for a file near the
// coordinates. Name-based Commons search was removed on purpose — for places
// with generic names it returned images of the wrong (non-place) subject.
async function commonsImageNearby(lat, lon) {
  const url =
    "https://commons.wikimedia.org/w/api.php?origin=*&format=json" +
    "&action=query&generator=geosearch&ggsnamespace=6&ggslimit=1" +
    `&ggscoord=${lat}|${lon}&ggsradius=2000` +
    "&prop=imageinfo&iiprop=url&iiurlwidth=1024";
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const pages = j.query && j.query.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  const info = first && first.imageinfo && first.imageinfo[0];
  return info ? info.thumburl || info.url : null;
}

// Several location-safe Commons photos near the point, for the LocationCard
// gallery. Same geosearch-by-coordinates approach as the single lookup (never
// name-based, so generic names can't pull the wrong subject), just a wider
// radius and more results. Non-image files (audio/PDF/SVG maps) are filtered
// out by MIME. Returns [] on any miss.
async function commonsImagesNearby(lat, lon, limit = 8) {
  if (typeof lat !== "number" || typeof lon !== "number") return [];
  const url =
    "https://commons.wikimedia.org/w/api.php?origin=*&format=json" +
    `&action=query&generator=geosearch&ggsnamespace=6&ggslimit=${limit}` +
    `&ggscoord=${lat}|${lon}&ggsradius=3000` +
    "&prop=imageinfo&iiprop=url|mime&iiurlwidth=1024";
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    const pages = j.query && j.query.pages;
    if (!pages) return [];
    return Object.values(pages)
      .map((p) => p.imageinfo && p.imageinfo[0])
      .filter((info) => info && /^image\/(jpeg|png|webp|gif)/i.test(info.mime || ""))
      .map((info) => info.thumburl || info.url)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Last-resort fallback: a street-level Mapillary photo near the point.
async function mapillaryImage(lat, lon) {
  if (!MAPILLARY_TOKEN) return null;
  const d = 0.01;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const url =
    "https://graph.mapillary.com/images" +
    `?access_token=${MAPILLARY_TOKEN}` +
    `&fields=thumb_1024_url&bbox=${bbox}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const img = j.data && j.data[0];
  return img ? img.thumb_1024_url : null;
}

// Topic image for a blog post (no coordinates available). Searches Wikipedia
// for the query and returns the lead thumbnail of the best-ranked result that
// has one. Unlike the geo-anchored place lookup this is name-based on purpose —
// a blog topic ("Alhambra", "medieval siege warfare") is exactly what we want
// the encyclopedia to illustrate. Single API round-trip via a search generator
// feeding pageimages. Best-effort: returns null on any miss so the caller can
// fall back to a styled placeholder.
export async function wikiTopicImage(query, locale) {
  const q = (query || "").trim();
  if (!q) return null;
  const lang = (locale || "en").split("-")[0];
  const url =
    `https://${lang}.wikipedia.org/w/api.php?origin=*&format=json` +
    "&action=query&generator=search&gsrnamespace=0&gsrlimit=4" +
    `&gsrsearch=${encodeURIComponent(q)}` +
    "&prop=pageimages&piprop=thumbnail&pithumbsize=800";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    const pages = j.query && j.query.pages;
    if (!pages) return null;
    // Pick the highest-ranked search hit (lowest `index`) that has a thumbnail.
    const withImg = Object.values(pages)
      .filter((p) => p.thumbnail && p.thumbnail.source)
      .sort((a, b) => (a.index || 0) - (b.index || 0));
    return withImg.length ? withImg[0].thumbnail.source : null;
  } catch {
    return null;
  }
}

export async function enrichLocation({ name, country, lat, lon, locale }) {
  const result = {
    extract: null,
    image: null,
    images: [],
    source: null,
    wikiUrl: null,
  };
  try {
    // Description: only a geo-verified Wikipedia article for this place. If
    // nothing passes, we deliberately show no Wikipedia text or image and fall
    // back to OSM data + the place name (handled by the card).
    if (name) {
      const wiki = await wikipediaSummary(name, country, lat, lon, locale);
      if (wiki) {
        result.extract = wiki.extract;
        result.wikiUrl = wiki.url;
        if (wiki.image) {
          result.image = wiki.image;
          result.source = "Wikipedia";
        }
      }
    }
    // Image: a geosearch-by-coordinates Commons photo is location-safe, so it
    // is fine to use even when Wikipedia had no match.
    if (!result.image) {
      const nearby = await commonsImageNearby(lat, lon);
      if (nearby) {
        result.image = nearby;
        result.source = "Wikimedia Commons";
      }
    }
    // Mapillary only if Wikimedia had nothing.
    if (!result.image) {
      const mp = await mapillaryImage(lat, lon);
      if (mp) {
        result.image = mp;
        result.source = "Mapillary";
      }
    }
    // Gallery: the primary image plus a few more location-safe Commons photos
    // nearby, de-duplicated and capped at 4. Only attempted when we already
    // have a Wikimedia image to lead with (so the gallery is genuinely "this
    // place" rather than a lone unrelated street photo).
    const gallery = [];
    if (result.image) gallery.push(result.image);
    if (result.image && result.source !== "Mapillary") {
      const extra = await commonsImagesNearby(lat, lon, 8);
      for (const u of extra) {
        if (gallery.length >= 4) break;
        if (!gallery.includes(u)) gallery.push(u);
      }
    }
    result.images = gallery;
  } catch {
    /* best-effort: leave whatever we have */
  }
  return result;
}
