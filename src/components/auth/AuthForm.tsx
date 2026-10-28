"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthDivider, GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { authClient, authErrorKey, type AuthErrorKey } from "@/lib/auth/client";
import { clearBusinessCache } from "@/lib/client/businesses";
import { isGoogleSignInReady, type ProviderStatusPayload } from "@/lib/client/provider-status";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import type { MessageKey } from "@/i18n/messages";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldName = "name" | "email" | "password";

export function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  hasHint,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  hasHint?: boolean;
  autoComplete: "current-password" | "new-password";
}) {
  const t = useT();
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        invalid={invalid}
        hasHint={hasHint}
        autoComplete={autoComplete}
        maxLength={MAX_PASSWORD}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword")}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-ink-subtle hover:text-ink"
      >
        {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
      </button>
    </div>
  );
}

export function AuthForm({ mode, next, expired }: { mode: "login" | "register"; next: string; expired: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [form, setForm] = React.useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, MessageKey>>>({});
  const [failure, setFailure] = React.useState<AuthErrorKey | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<ProviderStatusPayload | null>(null);
  const failureRef = React.useRef<HTMLDivElement>(null);
  const isRegister = mode === "register";
  const nextQuery = next === "/dashboard" ? "" : `?next=${encodeURIComponent(next)}`;
  const googleReady = isGoogleSignInReady(status);

  React.useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ProviderStatusPayload | null) => s && setStatus(s))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  function update(key: FieldName, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): Partial<Record<FieldName, MessageKey>> {
    const result: Partial<Record<FieldName, MessageKey>> = {};
    if (isRegister && !form.name.trim()) result.name = "auth.validation.nameRequired";
    if (!EMAIL_RE.test(form.email.trim())) result.email = "auth.validation.emailInvalid";
    if (!form.password) result.password = "auth.validation.passwordRequired";
    else if (isRegister && form.password.length < MIN_PASSWORD) result.password = "auth.validation.passwordTooShort";
    return result;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    const first = (["name", "email", "password"] as const).find((f) => found[f]);
    if (first) {
      document.getElementById(`auth-${first}`)?.focus();
      return;
    }

    setBusy(true);
    const email = form.email.trim();
    const { error } = isRegister
      ? await authClient.signUp.email({ name: form.name.trim(), email, password: form.password })
      : await authClient.signIn.email({ email, password: form.password });

    if (error) {
      setBusy(false);
      setFailure(authErrorKey(error));
      return;
    }
    clearBusinessCache();
    window.location.assign(`/${locale}${next}`);
  }

  const errorText = (field: FieldName) => {
    const key = errors[field];
    return key ? t(key) : undefined;
  };

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {t(`auth.${mode}.title`)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t(`auth.${mode}.description`)}</p>
      </div>

      <Card className="p-6 sm:p-7">
        {googleReady && (
          <>
            <GoogleSignInButton
              next={next}
              onStart={() => setFailure(null)}
              onError={(key) => setFailure(key)}
            />
            <AuthDivider />
          </>
        )}

        <form noValidate onSubmit={submit} className="space-y-4">
          {expired && !failure && <InlineNotice title={t("auth.expired")} />}
          {failure && (
            <div ref={failureRef} tabIndex={-1} className="outline-none">
              <InlineNotice tone="danger" title={t(`auth.errors.${failure}`)} />
            </div>
          )}

          {isRegister && (
            <Field id="auth-name" label={t("auth.fields.name")} error={errorText("name")}>
              <Input
                id="auth-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                invalid={Boolean(errors.name)}
                autoComplete="name"
                maxLength={100}
              />
            </Field>
          )}

          <Field id="auth-email" label={t("auth.fields.email")} error={errorText("email")}>
            <Input
              id="auth-email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              invalid={Boolean(errors.email)}
              autoComplete="email"
              maxLength={254}
            />
          </Field>

          <Field
            id="auth-password"
            label={t("auth.fields.password")}
            hint={isRegister ? t("auth.fields.passwordHint", { count: MIN_PASSWORD }) : undefined}
            error={errorText("password")}
          >
            <PasswordInput
              id="auth-password"
              value={form.password}
              onChange={(v) => update("password", v)}
              invalid={Boolean(errors.password)}
              hasHint={isRegister}
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </Field>

          {!isRegister && (
            <div className="-mt-1 flex justify-end">
              <Link
                href={`/forgot-password${nextQuery}`}
                className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
              >
                {t("auth.forgot.link")}
              </Link>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
            {t(`auth.${mode}.submit`)}
          </Button>
        </form>
      </Card>

      <p className="mt-5 text-center text-sm text-ink-muted">
        {t(isRegister ? "auth.register.haveAccount" : "auth.login.noAccount")}{" "}
        <Link
          href={`${isRegister ? "/login" : "/register"}${nextQuery}`}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          {t(isRegister ? "auth.register.signIn" : "auth.login.createAccount")}
        </Link>
      </p>
    </AuthShell>
  );
}
