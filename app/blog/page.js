import Link from "next/link";
import { listPosts } from "../../lib/blog.js";

export const metadata = {
  title: "Blog — Guides, Top 10s & Travel Tips",
  description:
    "Guides, top-10 lists and trip-planning advice built from the same open map data.",
};

export default async function BlogIndex() {
  const posts = await listPosts();
  return (
    <main className="blog-wrap">
      <nav className="blog-nav">
        <Link href="/">← Back to the map</Link>
      </nav>
      <h1>Blog</h1>
      <p className="blog-intro">
        Guides, top-10 lists and trip-planning advice — every place mentioned is
        on the <Link href="/">interactive map</Link>.
      </p>
      {posts.length === 0 ? (
        <p>No posts yet.</p>
      ) : (
        <ul className="blog-list">
          {posts.map((post) => (
            <li key={post.slug}>
              <h2>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              {post.date && <div className="blog-meta">{post.date}</div>}
              {post.description && <p>{post.description}</p>}
              <Link className="blog-more" href={`/blog/${post.slug}`}>
                Read more →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
