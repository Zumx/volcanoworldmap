"use client";

import { useEffect, useRef, useState } from "react";

// Counts up from 0 to `value` on mount. SSR (and no-JS) renders the final
// value, so the real number is always in the HTML for SEO; hydration then
// replays the count-up. Honors prefers-reduced-motion.
export default function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !value) {
      setDisplay(value);
      return;
    }

    let raf;
    let startTs = null;
    setDisplay(0);
    const tick = (ts) => {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}
