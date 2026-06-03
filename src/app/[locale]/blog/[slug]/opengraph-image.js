import { getPost } from "../../../../lib/blog.js";
import { site } from "../../../../lib/site.js";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "../../../../lib/og.js";

// Reads MDX from disk via node:fs, so this must run on Node.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${site.name} blog`;

// Per-post Open Graph image — shows the post title on the site's brand card.
export default async function Image({ params }) {
  const { locale, slug } = await params;
  const post = await getPost(locale, slug);
  const title = (post && post.meta && post.meta.title) || slug;
  return renderOgImage({ title, subtitle: `${site.emoji} ${site.name}` });
}
