"use client";

import { useEffect } from "react";

// Registers /sw.js after the page has loaded so the basemap works offline on
// repeat visits. Renders nothing. Registration is best-effort — any failure
// (unsupported browser, blocked by privacy settings) is silently ignored.
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration unavailable — the site still works online */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
