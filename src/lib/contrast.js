// Pick a legible foreground (near-black or white) for text/icons that sit on a
// solid brand color. Per-site accents range from dark reds/blues (need white
// text) to pale golds/greens/yellows (need dark text), so the navbar "Map"
// pill, the hero band and any accent-backed CTA must choose their text color
// from the accent rather than hard-coding #fff — which was invisible on the
// light accents (e.g. #f2d98c, #d4af37).
//
// Uses the WCAG relative-luminance formula. The 0.36 threshold was tuned
// against the whole fleet: it keeps white text on the dark/saturated accents
// where it reads well and looks conventional (#e10600 red, #f2792b orange,
// #ff6f61 coral L≈0.34, #145da0 blue) while flipping the yellow/gold/olive
// accents (#c9a227 L≈0.38, #d4af37 L≈0.45, #f2d98c L≈0.70) to dark text, where
// white was illegible (AA fail). The split lands cleanly in the gap between
// coral (0.335 → white) and olive-gold (0.384 → dark).
export function getContrastColor(hex) {
  let c = String(hex || "").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.36 ? "#1a1a1a" : "#ffffff";
}
