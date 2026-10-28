"use client";

import * as React from "react";
import { ChevronDown, Download, Loader2, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import type { BusinessStyle } from "@/lib/types";
import { BUSINESS_STYLES } from "@/lib/schemas";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { MigrationBanner } from "@/components/dashboard/MigrationBanner";
import { PasswordInput } from "@/components/auth/AuthForm";
import { useSession } from "@/components/auth/SessionProvider";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  buttonClasses,
  type BadgeTone,
} from "@/components/ui/primitives";
import { authClient, authErrorKey, type AuthErrorKey } from "@/lib/auth/client";
import { signOut } from "@/lib/client/account";
import { clearBusinessCache, useBusinesses } from "@/lib/client/businesses";
import {
  assessProviderCapabilities,
  type CapabilityAvailability,
  type ProviderStatusPayload,
} from "@/lib/client/provider-status";
import {
  getDefaultStyle,
  getThemePreference,
  setDefaultStyle,
  setThemePreference,
  usePreference,
  type ThemePreference,
} from "@/lib/client/preferences";
import { useLocale, useT } from "@/i18n/client";
import { STYLE_KEYS } from "@/i18n/labels";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

const MIN_PASSWORD = 8;

const SECTIONS: { id: string; labelKey: MessageKey }[] = [
  { id: "profile", labelKey: "account.profile.title" },
  { id: "security", labelKey: "account.security.title" },
  { id: "appearance", labelKey: "settings.appearance.title" },
  { id: "language", labelKey: "settings.language.title" },
  { id: "defaults", labelKey: "settings.defaults.title" },
  { id: "integrations", labelKey: "settings.integrations.title" },
  { id: "data", labelKey: "settings.data.title" },
  { id: "account", labelKey: "account.delete.title" },
];

export default function SettingsPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={t("settings.sectionsLabel")} className="hidden lg:block">
          <ul className="sticky top-20 space-y-px">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-md px-2.5 py-1.5 text-[13.5px] text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {t(s.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-3xl space-y-6">
          <ProfileSettings />
          <SecuritySettings />
          <AppearanceSettings />
          <LanguageSettings />
          <DefaultsSettings />
          <IntegrationsSettings />
          <DataSettings />
          <DeleteAccountSettings />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Appearance ------------------------------ */

const THEMES: { id: ThemePreference; labelKey: MessageKey; icon: React.ElementType }[] = [
  { id: "system", labelKey: "settings.appearance.system", icon: Monitor },
  { id: "light", labelKey: "settings.appearance.light", icon: Sun },
  { id: "dark", labelKey: "settings.appearance.dark", icon: Moon },
];

function AppearanceSettings() {
  const t = useT();
  const theme = usePreference(getThemePreference, "system");
  return (
    <Card id="appearance" className="scroll-mt-20">
      <CardHeader title={t("settings.appearance.title")} description={t("settings.appearance.description")} />
      <CardBody>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink">{t("settings.appearance.theme")}</legend>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {THEMES.map((th) => {
              const selected = theme === th.id;
              return (
                <label
                  key={th.id}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-center text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                    selected ? "border-ink bg-surface-2 text-ink" : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={th.id}
                    checked={selected}
                    onChange={() => setThemePreference(th.id)}
                    className="sr-only"
                  />
                  <th.icon size={17} aria-hidden />
                  {t(th.labelKey)}
                </label>
              );
            })}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Language ------------------------------- */

function LanguageSettings() {
  const t = useT();
  const locale = useLocale();
  return (
    <Card id="language" className="scroll-mt-20">
      <CardHeader title={t("settings.language.title")} description={t("language.settingsDescription")} />
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink">
          {t(`language.names.${locale}`)}
        </div>
        <LanguageSwitcher size="md" />
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Defaults ------------------------------- */

function DefaultsSettings() {
  const t = useT();
  const style = usePreference(getDefaultStyle, null);
  return (
    <Card id="defaults" className="scroll-mt-20">
      <CardHeader title={t("settings.defaults.title")} description={t("settings.defaults.description")} />
      <CardBody>
        <Field id="default-style" label={t("settings.defaults.brandStyle")} hint={t("settings.defaults.hint")} className="sm:max-w-sm">
          <Select
            id="default-style"
            value={style ?? ""}
            onChange={(e) => setDefaultStyle((e.target.value || null) as BusinessStyle | null)}
            aria-describedby="default-style-hint"
          >
            <option value="">{t("settings.defaults.noDefault")}</option>
            {BUSINESS_STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`styles.${STYLE_KEYS[s]}.label`)}
              </option>
            ))}
          </Select>
        </Field>
      </CardBody>
    </Card>
  );
}

/* ---------------------------- Integrations ----------------------------- */

const ENV_VARS: [string, MessageKey][] = [
  ["OPENAI_API_KEY", "settings.integrations.env.openai"],
  ["OLLAMA_API_KEY", "settings.integrations.env.ollama"],
  ["TAVILY_API_KEY", "settings.integrations.env.tavily"],
  ["SERPER_API_KEY", "settings.integrations.env.serper"],
  ["BRAVE_API_KEY", "settings.integrations.env.brave"],
];

function capabilityBadge(availability: CapabilityAvailability, t: ReturnType<typeof useT>): { label: string; tone: BadgeTone } {
  // "Configured" = local env looks usable. Never "Connected"/live — /api/status does not probe providers.
  if (availability === "configured") return { label: t("status.configured"), tone: "success" };
  if (availability === "unavailable") return { label: t("status.unavailable"), tone: "warning" };
  return { label: t("status.notConfigured"), tone: "neutral" };
}

function IntegrationsSettings() {
  const t = useT();
  const [status, setStatus] = React.useState<ProviderStatusPayload | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/status")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((s: ProviderStatusPayload) => setStatus(s))
      .catch(() => setFailed(true));
  }, []);

  const assessed = status ? assessProviderCapabilities(status) : null;
  const copy: Record<"chat" | "image" | "search", { name: MessageKey; description: MessageKey }> = {
    chat: { name: "settings.integrations.ai.name", description: "settings.integrations.ai.description" },
    image: { name: "settings.integrations.logo.name", description: "settings.integrations.logo.description" },
    search: { name: "settings.integrations.search.name", description: "settings.integrations.search.description" },
  };

  const rows: { id: string; name: string; description: string; state: { label: string; tone: BadgeTone } | null; detail?: string }[] =
    assessed
      ? assessed.map((row) => {
          const labels = copy[row.id];
          const detail =
            row.detailKey === "model" && row.detailValue
              ? t("settings.integrations.model", { model: row.detailValue })
              : row.detailKey === "provider" && row.detailValue
                ? t("settings.integrations.provider", { provider: row.detailValue })
                : undefined;
          return {
            id: row.id,
            name: t(labels.name),
            description: t(labels.description),
            state: capabilityBadge(row.availability, t),
            detail,
          };
        })
      : [
          { id: "chat", name: t("settings.integrations.ai.name"), description: t("settings.integrations.ai.description"), state: null },
          { id: "image", name: t("settings.integrations.logo.name"), description: t("settings.integrations.logo.description"), state: null },
          { id: "search", name: t("settings.integrations.search.name"), description: t("settings.integrations.search.description"), state: null },
        ];

  return (
    <Card id="integrations" className="scroll-mt-20">
      <CardHeader title={t("settings.integrations.title")} description={t("settings.integrations.description")} />
      {failed ? (
        <CardBody className="text-sm text-ink-muted">{t("settings.integrations.loadFailed")}</CardBody>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{r.name}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{r.description}</p>
                {r.detail && <p className="mt-1 text-[12.5px] text-ink-subtle">{r.detail}</p>}
              </div>
              {r.state ? (
                <Badge tone={r.state.tone} dot className="self-start">
                  {r.state.label}
                </Badge>
              ) : (
                <Skeleton className="h-5 w-24" />
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="group border-t border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          {t("settings.integrations.howToConnect")}
          <ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 px-5 pb-4 text-[13px] leading-relaxed text-ink-muted">
          <p>
            {t.rich("settings.integrations.envIntro", {
              file: <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-ink">.env.local</code>,
            })}
          </p>
          <dl className="divide-y divide-border rounded-lg border border-border">
            {ENV_VARS.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <dt>
                  <code className="font-mono text-[12px] text-ink">{k}</code>
                </dt>
                <dd className="text-[12.5px] text-ink-subtle">{t(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12.5px] text-ink-subtle">{t("settings.integrations.oneSearchKey")}</p>
        </div>
      </details>
    </Card>
  );
}

/* ------------------------------- Profile ------------------------------- */

function ProfileSettings() {
  const t = useT();
  const { user, setUser } = useSession();
  const [name, setName] = React.useState(user.name);
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "error" | "invalid">("idle");
  const trimmed = name.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) {
      setState("invalid");
      return;
    }
    setState("saving");
    const { error } = await authClient.updateUser({ name: trimmed });
    if (error) {
      setState("error");
      return;
    }
    setUser({ ...user, name: trimmed });
    setState("saved");
  }

  return (
    <Card id="profile" className="scroll-mt-20">
      <CardHeader title={t("account.profile.title")} description={t("account.profile.description")} />
      <CardBody>
        <form noValidate onSubmit={save} className="space-y-4 sm:max-w-sm">
          <Field
            id="profile-name"
            label={t("auth.fields.name")}
            error={state === "invalid" ? t("auth.validation.nameRequired") : undefined}
          >
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (state !== "saving") setState("idle");
              }}
              invalid={state === "invalid"}
              autoComplete="name"
              maxLength={100}
            />
          </Field>
          <Field id="profile-email" label={t("auth.fields.email")} hint={t("account.profile.emailHint")}>
            <Input id="profile-email" value={user.email} readOnly hasHint className="bg-surface-2 text-ink-muted" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={state === "saving" || trimmed === user.name}>
              {state === "saving" && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {t("common.save")}
            </Button>
            <span aria-live="polite" className={cn("text-[13px]", state === "error" ? "text-danger" : "text-ink-muted")}>
              {state === "saved" ? t("account.saved") : state === "error" ? t("errors.data.saveFailed") : ""}
            </span>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/* ------------------------------- Security ------------------------------ */

function SecuritySettings() {
  const t = useT();
  const locale = useLocale();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [fieldError, setFieldError] = React.useState<{ current?: MessageKey; next?: MessageKey }>({});
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [failure, setFailure] = React.useState<AuthErrorKey | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    const errors: { current?: MessageKey; next?: MessageKey } = {};
    if (!current) errors.current = "auth.validation.passwordRequired";
    if (next.length < MIN_PASSWORD) errors.next = "auth.validation.passwordTooShort";
    setFieldError(errors);
    setFailure(null);
    if (errors.current || errors.next) return;
    setState("saving");
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    if (error) {
      setState("idle");
      setFailure(authErrorKey(error));
      return;
    }
    setCurrent("");
    setNext("");
    setState("saved");
  }

  return (
    <Card id="security" className="scroll-mt-20">
      <CardHeader title={t("account.security.title")} description={t("account.security.description")} />
      <CardBody>
        <form noValidate onSubmit={change} className="space-y-4 sm:max-w-sm">
          <h3 className="text-[13px] font-medium text-ink">{t("account.security.changePassword")}</h3>
          {failure && <InlineNotice tone="danger" title={t(`auth.errors.${failure}`)} />}
          <Field
            id="password-current"
            label={t("auth.fields.currentPassword")}
            error={fieldError.current ? t(fieldError.current) : undefined}
          >
            <PasswordInput
              id="password-current"
              value={current}
              onChange={(v) => {
                setCurrent(v);
                setState("idle");
              }}
              invalid={Boolean(fieldError.current)}
              autoComplete="current-password"
            />
          </Field>
          <Field
            id="password-new"
            label={t("auth.fields.newPassword")}
            hint={t("auth.fields.passwordHint", { count: MIN_PASSWORD })}
            error={fieldError.next ? t(fieldError.next) : undefined}
          >
            <PasswordInput
              id="password-new"
              value={next}
              onChange={(v) => {
                setNext(v);
                setState("idle");
              }}
              invalid={Boolean(fieldError.next)}
              hasHint
              autoComplete="new-password"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={state === "saving"}>
              {state === "saving" && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {t("account.security.updatePassword")}
            </Button>
            <span aria-live="polite" className="text-[13px] text-ink-muted">
              {state === "saved" ? t("account.security.passwordUpdated") : ""}
            </span>
          </div>
        </form>
      </CardBody>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-ink">{t("account.signOut")}</div>
          <p className="mt-0.5 text-[13px] text-ink-muted">{t("account.security.signOutDescription")}</p>
        </div>
        <Button
          variant="secondary"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void signOut(locale);
          }}
        >
          {leaving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
          {t("account.signOut")}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------- Data --------------------------------- */

function DataSettings() {
  const t = useT();
  const { businesses, ready } = useBusinesses();
  const exportable = businesses.filter((b) => b.status === "ready").length;

  return (
    <Card id="data" className="scroll-mt-20">
      <CardHeader title={t("settings.data.title")} description={t("settings.data.description")} />
      <ul className="divide-y divide-border">
        <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-ink">{t("settings.data.exportTitle")}</div>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {ready ? t("settings.data.exportDescription", { count: exportable }) : t("common.loading")}
            </p>
          </div>
          {ready && exportable > 0 ? (
            <a href="/api/businesses/export" download className={buttonClasses("secondary")}>
              <Download size={15} aria-hidden /> {t("common.exportJson")}
            </a>
          ) : (
            <Button variant="secondary" disabled>
              <Download size={15} aria-hidden /> {t("common.exportJson")}
            </Button>
          )}
        </li>
        <li className="px-5 py-4">
          <div className="text-sm font-medium text-ink">{t("migration.settingsTitle")}</div>
          <p className="mb-3 mt-0.5 text-[13px] text-ink-muted">{t("migration.settingsDescription")}</p>
          <MigrationBanner variant="settings" />
        </li>
      </ul>
    </Card>
  );
}

/* ------------------------------- Account ------------------------------- */

function DeleteAccountSettings() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [failure, setFailure] = React.useState<AuthErrorKey | null>(null);

  return (
    <Card id="account" className="scroll-mt-20 border-danger/30">
      <CardHeader title={t("account.delete.title")} description={t("account.delete.description")} />
      <CardBody className="flex justify-end pt-0">
        <Button
          variant="secondary"
          className="text-danger"
          onClick={() => {
            setPassword("");
            setFailure(null);
            setOpen(true);
          }}
        >
          <Trash2 size={15} aria-hidden /> {t("account.delete.button")}
        </Button>
      </CardBody>

      <ConfirmDialog
        open={open}
        title={t("account.delete.dialogTitle")}
        description={t("account.delete.dialogDescription")}
        confirmLabel={t("account.delete.confirm")}
        confirmDisabled={!password}
        destructive
        onConfirm={async () => {
          setFailure(null);
          const { error } = await authClient.deleteUser({ password });
          if (error) {
            setFailure(authErrorKey(error));
            throw new Error("deleteUser failed");
          }
          clearBusinessCache();
          window.location.assign(`/${locale}`);
        }}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          {failure && <InlineNotice tone="danger" title={t(`auth.errors.${failure}`)} />}
          <Field id="delete-password" label={t("account.delete.passwordLabel")}>
            <PasswordInput id="delete-password" value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
        </div>
      </ConfirmDialog>
    </Card>
  );
}
