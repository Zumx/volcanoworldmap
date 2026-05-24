# Worldmap site

An interactive world map of every place tagged a certain way in
[OpenStreetMap](https://www.openstreetmap.org), generated from the master
template at `C:\dev\_template`.

- **Next.js 16** (App Router) + **Leaflet** with marker clustering
- **next-intl** i18n (English default; add locales in `site.config.json`)
- MDX blog, SEO country pages, lazy LocationCard (Wikipedia / Wikimedia /
  Mapillary / Google rating)
- Static `public/data/points.geojson` — no database
- Monthly auto-refresh via GitHub Actions

## Configuration

Everything site-specific lives in **`site.config.json`**. Nothing else in the
template needs editing between sites.

## Develop

```bash
npm install
cp .env.example .env        # optional API keys
npm run fetch-data          # builds public/data/points.geojson
npm run dev
```

## Environment

| Variable                     | Used by         | Required |
| ---------------------------- | --------------- | -------- |
| `GOOGLE_PLACES_API_KEY`      | fetch-data.mjs  | optional |
| `NEXT_PUBLIC_MAPILLARY_TOKEN`| LocationCard    | optional |

Data © OpenStreetMap contributors (ODbL).
