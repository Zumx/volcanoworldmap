"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { site } from "../lib/site.js";
import { getConsent, isPreviewHost, onConsentChange } from "../lib/consent.js";

// GA4 with Google Consent Mode v2, GDPR-first:
//   • Disabled entirely when no measurement ID is set (site.ga4Id == null) —
//     gtag.js is never requested and no banner-driven script runs.
//   • Disabled on Vercel preview/alias hosts (*.vercel.app) so only the real
//     production domain reports data.
//   • Consent Mode v2: all storage signals declared "denied" by default before
//     anything loads, so Google buffers nothing.
//   • gtag.js is injected ONLY after the visitor accepts in the cookie banner
//     (or on a return visit where they previously accepted). That load fires
//     the first page_view — i.e. no pageview is ever sent before consent.
export default function GoogleAnalytics() {
  const id = site.ga4Id;
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!id || isPreviewHost()) return;

    // Declare the Consent Mode v2 defaults up front (no network, no cookies).
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });

    if (getConsent() === "granted") setGranted(true);
    return onConsentChange((value) => setGranted(value === "granted"));
  }, [id]);

  if (!id || !granted) return null;

  // Rendered only once consent is granted → gtag.js loads here, not before.
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','update',{ analytics_storage:'granted' });
gtag('js', new Date());
gtag('config', '${id}', { anonymize_ip: true });`}
      </Script>
    </>
  );
}
