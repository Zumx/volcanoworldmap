import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { listPosts, getPost } from "../../../lib/blog.js";

export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = await listPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.meta.title || slug,
    description: post.meta.description || post.meta.excerpt || undefined,
  };
}

export default async function BlogPost({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return (
    <main className="blog-wrap blog-article">
      <nav className="blog-nav">
        <Link href="/blog">← All posts</Link>
        <Link href="/">Map</Link>
      </nav>
      <h1>{post.meta.title || slug}</h1>
      {post.meta.date && <div className="blog-meta">{post.meta.date}</div>}
      <article className="blog-prose">
        <MDXRemote source={post.content} />
      </article>
      <nav className="blog-nav blog-nav-foot">
        <Link href="/blog">← All posts</Link>
        <Link href="/">Explore the map →</Link>
      </nav>
    </main>
  );
}
