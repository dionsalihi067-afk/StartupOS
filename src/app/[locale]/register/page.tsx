import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { prepareAuthPage } from "@/lib/auth/page";
import { getTranslator, resolveLocale } from "@/i18n/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const t = getTranslator(await resolveLocale(params));
  return { title: t("auth.register.title"), robots: { index: false } };
}

export default async function RegisterPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const { next } = await prepareAuthPage(locale, searchParams);
  return <AuthForm mode="register" next={next} expired={false} />;
}
