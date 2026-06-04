"use client";

import { useEffect, useState } from "react";
import { wikiTopicImage } from "../lib/enrich.js";
import { site } from "../lib/site.js";

// Hero image for a featured blog card. An explicit frontmatter `image` URL is
// used verbatim; otherwise we lazily search Wikimedia (via `wikiQuery` or the
// post title) once on mount. No match leaves a branded gradient with the site
// emoji — the card always looks intentional, never broken.
export default function BlogImage({ post, eager = false }) {
  const [img, setImg] = useState(post.image || null);
  const [loaded, setLoaded] = useState(!!post.image);

  useEffect(() => {
    if (post.image) return; // explicit URL: nothing to fetch
    let alive = true;
    const query = post.wikiQuery || post.title;
    wikiTopicImage(query, post.locale).then((src) => {
      if (!alive) return;
      setImg(src || null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [post.image, post.wikiQuery, post.title, post.locale]);

  if (img) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={img}
        alt={post.title}
        width="1200"
        height="675"
        loading={eager ? "eager" : "lazy"}
        // Above-the-fold hero (the featured post) is the LCP candidate — hint
        // the browser to fetch it ahead of lazy/below-fold images.
        fetchPriority={eager ? "high" : "auto"}
        decoding={eager ? "sync" : "async"}
      />
    );
  }
  return (
    <span
      className={`featured-initial${loaded ? "" : " is-loading"}`}
      aria-hidden="true"
    >
      {site.emoji}
    </span>
  );
}
