// Shared analytics-consent state, used by both the cookie banner
// (CookieConsent.js) and the GA4 loader (GoogleAnalytics.js). The visitor's
// choice is persisted in localStorage under "<slug>:consent" and mirrored into
// Google Consent Mode v2. A "consentchange" window event lets the GA loader
// react the instant the visitor accepts — that is what triggers gtag.js to be
// injected (we never load it before consent).
import { site } from "./site.js";

const KEY = `${site.slug}:consent`;
export const CONSENT_EVENT = "consentchange";

// True on Vercel preview/alias hosts (*.vercel.app). Analytics is suppressed
// there so only the real production domain ever reports data or sets cookies.
export function isPreviewHost() {
  return (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".vercel.app")
  );
}

// "granted" | "denied" | null (no choice made yet).
export function getConsent() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked
  }
}

function gtag() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(arguments);
}

// Persist the visitor's choice, reflect it into Consent Mode for any
// already-loaded gtag, and notify listeners (the GA loader) in this tab.
export function setConsent(granted) {
  const value = granted ? "granted" : "denied";
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage blocked */
  }
  if (typeof window !== "undefined") {
    gtag("consent", "update", { analytics_storage: value });
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  }
  return value;
}

// Subscribe to consent changes; returns an unsubscribe fn.
export function onConsentChange(cb) {
  if (typeof window === "undefined") return () => {};
  const handler = (e) => cb(e.detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}
