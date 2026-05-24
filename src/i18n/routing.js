import { defineRouting } from "next-intl/routing";
import { site } from "../lib/site.js";

export const routing = defineRouting({
  locales: site.locales && site.locales.length ? site.locales : ["en"],
  defaultLocale: site.defaultLocale || "en",
  // Always prefix the URL with the locale (/en, /de, /fr, /it) — default
  // locale (en) redirects from "/" to "/en" via next-intl middleware.
  localePrefix: "always",
});
