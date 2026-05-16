import "./globals.css";

export const metadata = {
  title: "Volcano World Map — Every volcano on Earth",
  description: "An interactive world map of every volcano from OpenStreetMap. Explore the planet's fire mountains — from dormant cones to active stratovolcanoes across every continent.",
  openGraph: {
    title: "Volcano World Map",
    description: "An interactive world map of every volcano from OpenStreetMap. Explore the planet's fire mountains — from dormant cones to active stratovolcanoes across every continent.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
