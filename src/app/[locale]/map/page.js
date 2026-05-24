import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "../../../i18n/routing.js";
import MapClient from "../../../components/MapClient.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}/map`])
  );
  languages["x-default"] = `/${routing.defaultLocale}/map`;
  return {
    title: t("map"),
    alternates: { canonical: `/${locale}/map`, languages },
  };
}

export default async function MapPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main
      style={{
        position: "relative",
        height: "calc(100vh - 57px)",
        width: "100%",
      }}
    >
      <MapClient />
    </main>
  );
}
