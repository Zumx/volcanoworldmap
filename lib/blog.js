import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

const DIR = join(process.cwd(), "content", "blog");

export async function listPosts() {
  let files = [];
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith(".mdx"));
  } catch {
    return [];
  }
  const posts = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(DIR, file), "utf8");
      const { data } = matter(raw);
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: data.title || file,
        date: data.date || "",
        description: data.description || data.excerpt || "",
      };
    })
  );
  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getPost(slug) {
  try {
    const raw = await readFile(join(DIR, `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    return { meta: data, content };
  } catch {
    return null;
  }
}
