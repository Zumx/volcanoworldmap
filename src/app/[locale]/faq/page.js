import { setRequestLocale, getTranslations } from "next-intl/server";
import { site } from "../../../lib/site.js";
import { routing } from "../../../i18n/routing.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("faq");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/faq`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/faq`;
  return {
    title: t("heading"),
    description: t("intro", { noun: site.mappedNoun, name: site.name }),
    alternates: { canonical: `/${locale}/faq`, languages },
  };
}

// Build the 10 Q&A. A site may override with site.config.json "faqItems"
// (an array of { q, a }); otherwise we render the generic, niche-aware set
// from the translations, interpolating the site name and mapped noun.
function buildItems(t, name, noun) {
  if (Array.isArray(site.faqItems) && site.faqItems.length) return site.faqItems;
  return Array.from({ length: 10 }, (_, i) => ({
    q: t(`q${i + 1}`, { name, noun }),
    a: t(`a${i + 1}`, { name, noun }),
  }));
}

export default async function FAQ({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("faq");
  const noun = site.mappedNoun;
  const items = buildItems(t, site.name, noun);

  // FAQPage structured data — eligible for the rich FAQ result in Google.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  return (
    <main className="container prose">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1>{t("heading")}</h1>
      <p>{t("intro", { noun, name: site.name })}</p>

      {items.map((it, i) => (
        <div key={i}>
          <h2>{it.q}</h2>
          <p>{it.a}</p>
        </div>
      ))}
    </main>
  );
}
