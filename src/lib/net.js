// fetch() with a hard timeout. Every external API call in the client (Wikipedia,
// Wikimedia Commons, Mapillary) and the map's own data fetches go through this
// so a hung connection can never leave a spinner up forever — the request is
// aborted after `ms` and the promise rejects, which callers already treat as a
// best-effort miss (return null/[] or show the retry UI).
const DEFAULT_TIMEOUT_MS = 5000;

export function fetchWithTimeout(url, options = {}, ms = DEFAULT_TIMEOUT_MS) {
  // Respect a caller-provided signal by chaining it into our timeout abort.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const external = options.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
