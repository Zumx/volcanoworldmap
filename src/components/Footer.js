import { useTranslations } from "next-intl";
import { site } from "../lib/site.js";

export default function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="site-footer">
      <p>
        {site.emoji} {site.name} ·{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          {t("data")}
        </a>
      </p>
    </footer>
  );
}
