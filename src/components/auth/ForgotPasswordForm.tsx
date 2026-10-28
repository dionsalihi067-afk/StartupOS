"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { AuthShell } from "@/components/auth/AuthShell";
import { authClient, authErrorKey, type AuthErrorKey } from "@/lib/auth/client";
import { isPasswordRecoveryReady, type ProviderStatusPayload } from "@/lib/client/provider-status";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import type { MessageKey } from "@/i18n/messages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm({ next }: { next: string }) {
  const t = useT();
  const locale = useLocale();
  const [email, setEmail] = React.useState("");
  const [fieldError, setFieldError] = React.useState<MessageKey | null>(null);
  const [failure, setFailure] = React.useState<AuthErrorKey | null>(null);
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<ProviderStatusPayload | null>(null);
  const failureRef = React.useRef<HTMLDivElement>(null);
  const nextQuery = next === "/dashboard" ? "" : `?next=${encodeURIComponent(next)}`;
  // Until /api/status loads, allow submit; the server returns resetDisabled when email is off.
  const recoveryKnownOff = status !== null && !isPasswordRecoveryReady(status);
  const canSubmit = !recoveryKnownOff;

  React.useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ProviderStatusPayload | null) => s && setStatus(s))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !canSubmit) return;
    setFailure(null);
    setSent(false);
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError("auth.validation.emailInvalid");
      document.getElementById("forgot-email")?.focus();
      return;
    }
    setFieldError(null);
    setBusy(true);

    const redirectTo = `${window.location.origin}/${locale}/reset-password`;
    const { error } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo,
    });

    setBusy(false);
    if (error) {
      setFailure(authErrorKey(error));
      return;
    }
    // Better Auth returns the same generic success whether or not the account exists.
    setSent(true);
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {t("auth.forgot.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("auth.forgot.description")}</p>
      </div>

      <Card className="p-6 sm:p-7">
        {recoveryKnownOff && (
          <InlineNotice tone="warning" title={t("auth.forgot.unavailable")} className="mb-4">
            {t("auth.forgot.unavailableBody")}
          </InlineNotice>
        )}

        {sent ? (
          <InlineNotice tone="success" title={t("auth.forgot.sentTitle")}>
            {t("auth.forgot.sentBody")}
          </InlineNotice>
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4">
            {failure && (
              <div ref={failureRef} tabIndex={-1} className="outline-none">
                <InlineNotice tone="danger" title={t(`auth.errors.${failure}`)} />
              </div>
            )}

            <Field
              id="forgot-email"
              label={t("auth.fields.email")}
              error={fieldError ? t(fieldError) : undefined}
            >
              <Input
                id="forgot-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                invalid={Boolean(fieldError)}
                autoComplete="email"
                maxLength={254}
              />
            </Field>

            <Button type="submit" className="w-full" disabled={busy || !canSubmit} aria-busy={busy}>
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {t("auth.forgot.submit")}
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-5 text-center text-sm text-ink-muted">
        <Link href={`/login${nextQuery}`} className="font-medium text-brand underline-offset-4 hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </AuthShell>
  );
}
