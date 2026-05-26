// IndexNow fire-and-forget pinger.
//
// IndexNow is a protocol (https://www.indexnow.org/) that lets you notify
// participating search engines (Bing, Yandex, Seznam, Naver — Google does NOT
// participate but accepts the signal via Bing for some surfaces) that one or
// more URLs have new or updated content. Pings are accepted from any host
// that serves a key file at /<key>.txt with the key as content.
//
// We ping during ISR regeneration of blog post pages when a post is "fresh"
// (date within the last 24h). Because each post page revalidates at most
// once per day, this gives roughly one ping per post per day on the day it
// drips live — and zero pings for older content.
//
// Fire-and-forget: errors are swallowed so a flaky IndexNow API never blocks
// a page render. Empty / missing key short-circuits to a no-op.

import { site } from "./site.js";

const ENDPOINT = "https://api.indexnow.org/IndexNow";

export function pingIndexNow(urls) {
  const key = site.indexNow && site.indexNow.key;
  if (!key) return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  const body = JSON.stringify({
    host: site.domain,
    key,
    keyLocation: `https://${site.domain}/${key}.txt`,
    urlList: urls,
  });

  // Don't await — let it fly. Swallow errors. Set a short timeout so a
  // hanging endpoint can't tie up the render request.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: controller.signal,
  })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}

// Helper: did this post date fall within the last 24h? Used to decide whether
// to ping. Pinging only "fresh" posts keeps quota under control.
export function isFreshlyPublished(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000)
    .toISOString()
    .slice(0, 10);
  return dateStr >= yesterday && dateStr <= today;
}
