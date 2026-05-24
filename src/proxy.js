import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing.js";

export default createMiddleware(routing);

export const config = {
  // Skip Next internals, the generated data file and any file with an
  // extension; run the i18n middleware on everything else.
  matcher: ["/((?!api|_next|_vercel|data|.*\\..*).*)"],
};
