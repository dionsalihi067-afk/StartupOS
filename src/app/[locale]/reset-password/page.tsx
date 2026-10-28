import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getTranslator, resolveLocale } from "@/i18n/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const t = getTranslator(await resolveLocale(params));
  return { title: t("auth.reset.title"), robots: { index: false } };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  await resolveLocale(params);
  const q = await searchParams;
  const token = first(q.token) ?? null;
  const tokenError = first(q.error) === "INVALID_TOKEN";
  return <ResetPasswordForm token={token} tokenError={tokenError} />;
}
