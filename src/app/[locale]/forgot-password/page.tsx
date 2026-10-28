import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { prepareAuthPage } from "@/lib/auth/page";
import { getTranslator, resolveLocale } from "@/i18n/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const t = getTranslator(await resolveLocale(params));
  return { title: t("auth.forgot.title"), robots: { index: false } };
}

export default async function ForgotPasswordPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const { next } = await prepareAuthPage(locale, searchParams);
  return <ForgotPasswordForm next={next} />;
}
