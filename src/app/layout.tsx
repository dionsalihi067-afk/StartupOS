/**
 * The document (`<html>`, fonts, theme, translations) is rendered by
 * `app/[locale]/layout.tsx` so its `lang` attribute matches the URL.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
