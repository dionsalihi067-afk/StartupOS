import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/AppShell";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { buttonClasses } from "@/components/ui/primitives";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { logFailure } from "@/lib/api";
import { PATH_HEADER, safeNextPath } from "@/lib/routing";
import { getTranslator, resolveLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);
  const requestHeaders = await headers();

  let user: SessionUser | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    logFailure("auth", err);
    const t = getTranslator(locale);
    return (
      <StatusScreen
        title={t("errors.data.unavailableTitle")}
        description={t("errors.data.unavailable")}
        actions={
          <a href={`/${locale}/dashboard`} className={buttonClasses()}>
            {t("common.tryAgain")}
          </a>
        }
      />
    );
  }

  if (!user) {
    const next = safeNextPath(requestHeaders.get(PATH_HEADER));
    redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <SessionProvider user={{ id: user.id, name: user.name, email: user.email }}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
