import { Link } from "../i18n/navigation.js";
import { site } from "../lib/site.js";

// Renders a breadcrumb trail + a matching BreadcrumbList JSON-LD block.
// `items` is an ordered array of { name, href? }; the last item is the
// current page and is rendered as plain text (no href). hrefs are
// locale-relative ("/", "/blog", "/#countries") — the same form the
// next-intl Link expects — and are expanded to absolute URLs for the
// structured data.
export default function Breadcrumbs({ items, locale }) {
  const base = `https://${site.domain}`;
  const toUrl = (href) => {
    if (!href) return undefined;
    if (href === "/") return `${base}/${locale}`;
    return `${base}/${locale}${href}`;
  };

  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.href ? { item: toUrl(it.href) } : {}),
    })),
  };

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <ol>
        {items.map((it, i) => (
          <li key={i}>
            {it.href ? (
              <Link href={it.href} locale={locale}>
                {it.name}
              </Link>
            ) : (
              <span aria-current="page">{it.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
