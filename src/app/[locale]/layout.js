import "../globals.css";
import Script from "next/script";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../i18n/routing.js";
import { site, cssVars } from "../../lib/site.js";
import Header from "../../components/Header.js";
import Footer from "../../components/Footer.js";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
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
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const styleVars = Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

  return (
    <html lang={locale}>
      <body>
        <style
          dangerouslySetInnerHTML={{ __html: `:root{${styleVars}}` }}
        />
        <NextIntlClientProvider>
          <Header />
          {children}
          <Footer />
        </NextIntlClientProvider>
        {/* GA4 — only when a measurement ID is set in site.config.json.
            Cookieless + IP anonymised so no consent banner is required:
            client_storage:'none' stops gtag writing the _ga cookie. */}
        {site.googleAnalyticsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${site.googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${site.googleAnalyticsId}', { anonymize_ip: true, client_storage: 'none' });`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
