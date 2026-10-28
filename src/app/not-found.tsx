import { Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui/primitives";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { getTranslator } from "@/i18n/server";
import "./globals.css";

/** Fallback for requests outside any locale (most are redirected by the middleware first). */
export default function RootNotFound() {
  const t = getTranslator(DEFAULT_LOCALE);
  return (
    <html lang={DEFAULT_LOCALE} dir="ltr">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-bg px-6">
          <div className="card w-full max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-muted">
              <Compass size={20} aria-hidden />
            </div>
            <h1 className="text-lg font-semibold text-ink">{t("errors.notFound.title")}</h1>
            <p className="mt-1.5 text-sm text-ink-muted">{t("errors.notFound.description")}</p>
            <div className="mt-6 flex flex-col justify-center gap-2 min-[400px]:flex-row">
              <a href={`/${DEFAULT_LOCALE}/dashboard`} className={buttonClasses("primary")}>
                {t("errors.notFound.goToDashboard")}
              </a>
              <a href={`/${DEFAULT_LOCALE}`} className={buttonClasses("secondary")}>
                {t("errors.notFound.home")}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
