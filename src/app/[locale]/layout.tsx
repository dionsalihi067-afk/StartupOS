import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import { ThemeSync } from "@/lib/client/preferences";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme-script";
import { I18nProvider } from "@/i18n/client";
import { DEFAULT_LOCALE, INTL_LOCALE, LOCALES } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getTranslator, resolveLocale } from "@/i18n/server";
import "../globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

const display = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getTranslator(locale);
  return {
    title: { default: t("meta.title"), template: t("meta.titleTemplate") },
    description: t("meta.description"),
    applicationName: "StartupOS",
    alternates: {
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])), "x-default": `/${DEFAULT_LOCALE}` },
    },
    openGraph: {
      title: t("meta.title"),
      description: t("meta.ogDescription"),
      type: "website",
      locale: INTL_LOCALE[locale].replace("-", "_"),
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1210" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: Props) {
  const locale = await resolveLocale(params);
  return (
    <html lang={locale} dir="ltr" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          <ThemeSync />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
