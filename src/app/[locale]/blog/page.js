import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "../../../i18n/routing.js";
import { listPosts } from "../../../lib/blog.js";
import { site } from "../../../lib/site.js";
import BlogList from "../../../components/BlogList.js";

// ISR: regenerate at most once per day so drip-scheduled posts go live
// automatically when their frontmatter date passes — no rebuild needed.
export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("blog");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/blog`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/blog`;
  return {
    title: t("heading"),
    alternates: { canonical: `/${locale}/blog`, languages },
  };
}

export default async function BlogIndex({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("blog");
  const posts = await listPosts(locale);

  return (
    <main className="container blog-index">
      {posts.length === 0 ? (
        <div className="prose">
          <h1>{site.name}</h1>
          <p>{t("empty")}</p>
        </div>
      ) : (
        <BlogList posts={posts} locale={locale} title={site.name} />
      )}
    </main>
  );
}
