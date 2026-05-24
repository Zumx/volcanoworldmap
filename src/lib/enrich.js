// Client-side, lazy enrichment for LocationCard. Nothing here runs until a
// pin is actually clicked (LocationCard is a next/dynamic ssr:false chunk and
// fires this from a useEffect). All calls are best-effort and degrade
// silently. Wikipedia + Wikimedia Commons need no key; Mapillary uses
// NEXT_PUBLIC_MAPILLARY_TOKEN when present and is only a last-resort fallback.

const MAPILLARY_TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || "";

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

// Wikipedia: resolve the best-matching article for the place name, then pull
// its summary (intro paragraph + lead image + canonical URL).
async function wikipediaSummary(name, locale) {
  const lang = (locale || "en").split("-")[0];
  const searchUrl =
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/title` +
    `?q=${encodeURIComponent(name)}&limit=1`;
  const sRes = await fetch(searchUrl, { headers: { Accept: "application/json" } });
  if (!sRes.ok) return null;
  const sJson = await sRes.json();
  const page = sJson.pages && sJson.pages[0];
  if (!page) return null;
  const sumUrl =
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` +
    encodeURIComponent(page.key || page.title);
  const res = await fetch(sumUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const j = await res.json();
  if (j.type === "disambiguation") return null;
  return {
    extract: firstSentences(j.extract, 3),
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

// Primary image source: full-text search Wikimedia Commons for the place
// name and take the first file result.
async function commonsImageByName(name) {
  const url =
    "https://commons.wikimedia.org/w/api.php?origin=*&format=json" +
    "&action=query&generator=search&gsrnamespace=6&gsrlimit=1" +
    `&gsrsearch=${encodeURIComponent(name)}` +
    "&prop=imageinfo&iiprop=url&iiurlwidth=1024";
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const pages = j.query && j.query.pages;
  if (!pages) return null;
  // generator=search returns results with an `index`; take the top-ranked.
  const first = Object.values(pages).sort(
    (a, b) => (a.index || 0) - (b.index || 0)
  )[0];
  const info = first && first.imageinfo && first.imageinfo[0];
  return info ? info.thumburl || info.url : null;
}

// Secondary image source: geosearch Commons for a file near the coordinates.
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

export async function enrichLocation({ name, lat, lon, locale }) {
  const result = { extract: null, image: null, source: null, wikiUrl: null };
  try {
    // Description: Wikipedia intro, capped at 3 sentences.
    if (name) {
      const wiki = await wikipediaSummary(name, locale);
      if (wiki) {
        result.extract = wiki.extract;
        result.wikiUrl = wiki.url;
        if (wiki.image) {
          result.image = wiki.image;
          result.source = "Wikipedia";
        }
      }
    }
    // Image: Wikimedia Commons by name (first hit) is the preferred source.
    if (!result.image && name) {
      const byName = await commonsImageByName(name);
      if (byName) {
        result.image = byName;
        result.source = "Wikimedia Commons";
      }
    }
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
  } catch {
    /* best-effort: leave whatever we have */
  }
  return result;
}
