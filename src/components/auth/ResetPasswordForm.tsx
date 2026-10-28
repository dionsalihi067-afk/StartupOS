"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/AuthForm";
import { authClient, authErrorKey, type AuthErrorKey } from "@/lib/auth/client";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import type { MessageKey } from "@/i18n/messages";

const MIN_PASSWORD = 8;

export function ResetPasswordForm({
  token,
  tokenError,
}: {
  token: string | null;
  tokenError: boolean;
}) {
  const t = useT();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fieldError, setFieldError] = React.useState<MessageKey | null>(null);
  const [failure, setFailure] = React.useState<AuthErrorKey | null>(null);
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const failureRef = React.useRef<HTMLDivElement>(null);
  const invalidLink = tokenError || !token;

  React.useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !token) return;
    setFailure(null);

    if (password.length < MIN_PASSWORD) {
      setFieldError("auth.validation.passwordTooShort");
      document.getElementById("reset-password")?.focus();
      return;
    }
    if (password !== confirm) {
      setFieldError("auth.reset.mismatch");
      document.getElementById("reset-confirm")?.focus();
      return;
    }
    setFieldError(null);
    setBusy(true);

    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setBusy(false);
    if (error) {
      setFailure(authErrorKey(error));
      return;
    }
    setDone(true);
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {t("auth.reset.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("auth.reset.description")}</p>
      </div>

      <Card className="p-6 sm:p-7">
        {invalidLink ? (
          <InlineNotice tone="danger" title={t("auth.reset.invalidTitle")}>
            {t("auth.reset.invalidBody")}
          </InlineNotice>
        ) : done ? (
          <InlineNotice tone="success" title={t("auth.reset.successTitle")}>
            {t("auth.reset.successBody")}
          </InlineNotice>
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4">
            {failure && (
              <div ref={failureRef} tabIndex={-1} className="outline-none">
                <InlineNotice tone="danger" title={t(`auth.errors.${failure}`)} />
              </div>
            )}

            <Field
              id="reset-password"
              label={t("auth.fields.newPassword")}
              hint={t("auth.fields.passwordHint", { count: MIN_PASSWORD })}
              error={fieldError && fieldError !== "auth.reset.mismatch" ? t(fieldError) : undefined}
            >
              <PasswordInput
                id="reset-password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (fieldError) setFieldError(null);
                }}
                invalid={Boolean(fieldError && fieldError !== "auth.reset.mismatch")}
                hasHint
                autoComplete="new-password"
              />
            </Field>

            <Field
              id="reset-confirm"
              label={t("auth.reset.confirm")}
              error={fieldError === "auth.reset.mismatch" ? t(fieldError) : undefined}
            >
              <PasswordInput
                id="reset-confirm"
                value={confirm}
                onChange={(v) => {
                  setConfirm(v);
                  if (fieldError) setFieldError(null);
                }}
                invalid={fieldError === "auth.reset.mismatch"}
                autoComplete="new-password"
              />
            </Field>

            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {t("auth.reset.submit")}
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-5 text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </AuthShell>
  );
}
