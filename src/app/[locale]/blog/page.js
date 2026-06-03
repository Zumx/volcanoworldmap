import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "../../../i18n/routing.js";
import { listPosts } from "../../../lib/blog.js";
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
    <main className="container">
      <div className="prose">
        <h1>{t("heading")}</h1>
      </div>
      {posts.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <BlogList posts={posts} />
      )}
    </main>
  );
}
