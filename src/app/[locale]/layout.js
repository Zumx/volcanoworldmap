import "../globals.css";
import Script from "next/script";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../i18n/routing.js";
import { site, cssVars } from "../../lib/site.js";
import Header from "../../components/Header.js";
import Footer from "../../components/Footer.js";
import CookieConsent from "../../components/CookieConsent.js";
import ServiceWorker from "../../components/ServiceWorker.js";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// theme-color drives the mobile browser chrome + the installed PWA splash.
export function generateViewport() {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: site.colors?.primary || "#1a1a2e",
  };
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const base = `https://${site.domain}`;
  // hreflang for each locale + x-default to the default locale's URL.
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}`])
  );
  languages["x-default"] = `/${routing.defaultLocale}`;
  return {
    metadataBase: new URL(base),
    title: {
      default: `${site.name} ${site.emoji}`,
      template: `%s · ${site.name}`,
    },
    description: `${site.name} — an interactive world map of every ${site.mappedNoun}, sourced live from OpenStreetMap.`,
    alternates: {
      canonical: `/${locale}`,
      languages,
    },
    openGraph: {
      title: `${site.name} ${site.emoji}`,
      description: `An interactive world map of every ${site.mappedNoun}.`,
      type: "website",
      url: `${base}/${locale}`,
      locale,
      alternateLocale: routing.locales.filter((l) => l !== locale),
    },
    // PWA: per-site SVG brandmark as favicon + apple-touch-icon, and the
    // installable-app meta tags. The manifest itself is auto-linked by Next
    // from app/manifest.js.
    icons: {
      icon: [{ url: "/brandmark.svg", type: "image/svg+xml" }],
      apple: [{ url: "/brandmark.svg" }],
    },
    appleWebApp: {
      capable: true,
      title: site.name,
      statusBarStyle: "default",
    },
    other: {
      "mobile-web-app-capable": "yes",
      // Legacy iOS standalone flag — Next no longer emits this one itself.
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const nav = await getTranslations("nav");

  const styleVars = Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

  return (
    <html lang={locale}>
      <body>
        {/* Resource hints — warm the origins the basemap tiles and the
            location-card enrichment (Wikipedia/Wikimedia) fetch from. The
            basemap uses OpenStreetMap tiles, not CartoDB. */}
        <link rel="preconnect" href="https://a.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href={`https://${locale}.wikipedia.org`} />
        <link rel="dns-prefetch" href="https://commons.wikimedia.org" />
        <link rel="dns-prefetch" href="https://upload.wikimedia.org" />
        <style
          dangerouslySetInnerHTML={{ __html: `:root{${styleVars}}` }}
        />
        <NextIntlClientProvider>
          {/* Keyboard/screen-reader users can jump straight past the header
              and map to the page body. */}
          <a className="skip-link" href="#main-content">
            {nav("skipToContent")}
          </a>
          <Header />
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          <Footer />
          <ServiceWorker />
        </NextIntlClientProvider>
        {/* GA4 — only when a measurement ID is set in site.config.json.
            Consent Mode v2: analytics_storage defaults to denied (cookieless,
            IP anonymised) until the visitor accepts in the cookie banner,
            which calls gtag('consent','update', …). */}
        {site.googleAnalyticsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${site.googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', { analytics_storage: 'denied' });
gtag('js', new Date());
gtag('config', '${site.googleAnalyticsId}', { anonymize_ip: true });`}
            </Script>
            <CookieConsent />
          </>
        )}
      </body>
    </html>
  );
}
