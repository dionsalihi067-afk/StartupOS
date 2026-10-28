"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { BrandLogo, logoIsAvailable } from "@/components/ui/Logo";
import { Badge, Button, Card, CardBody, CardHeader, SectionHeader } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/actions";
import { EditableSwatch, EditableText, EditableTraits } from "@/components/workspace/BrandEditors";
import { styleLabel } from "@/components/workspace/OverviewSection";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { slugify } from "@/lib/utils";

export function BrandFonts({ href }: { href: string }) {
  if (!href) return null;
  return <link rel="stylesheet" href={href} precedence="default" />;
}

export function BrandSection({ pkg, onRegenerateLogo }: { pkg: BusinessPackage; onRegenerateLogo?: () => void }) {
  const t = useT();
  const brand = pkg.brand;
  const type = brand.typography;
  const headingFamily = `"${type.headingFont}", ${type.headingFallback}`;
  const bodyFamily = `"${type.bodyFont}", ${type.bodyFallback}`;
  const [missingUrl, setMissingUrl] = React.useState<string | null>(null);
  const logoMissing = missingUrl !== null && missingUrl === brand.logo.imageUrl;
  const hasLogo = logoIsAvailable(brand.logo) && !logoMissing;
  const direction = pkg.input.discovery?.brand;

  return (
    <div className="space-y-8">
      <BrandFonts href={type.googleFontsHref} />

      <section aria-labelledby="brand-identity" className="space-y-4">
        <SectionHeader id="brand-identity" title={t("brand.identity.title")} description={t("brand.identity.description")} />
        <Card>
          <CardBody className="divide-y divide-border p-5 sm:p-6">
            <EditableText
              businessId={pkg.id}
              field="name"
              label={t("brand.identity.name")}
              value={brand.name}
              max={80}
              display={
                <span className="text-2xl font-semibold tracking-tight text-ink" style={{ fontFamily: headingFamily }}>
                  {brand.name}
                </span>
              }
            />
            <EditableText
              businessId={pkg.id}
              field="slogan"
              label={t("brand.identity.tagline")}
              value={brand.slogan}
              max={160}
              display={<span style={{ fontFamily: bodyFamily }}>{brand.slogan}</span>}
            />
            <EditableText
              businessId={pkg.id}
              field="description"
              label={t("brand.identity.positioning")}
              hint={t("brand.identity.positioningHint")}
              value={brand.description}
              max={1200}
              multiline
              display={<span className="text-ink-muted">{brand.description}</span>}
            />
            <EditableTraits
              businessId={pkg.id}
              label={t("brand.identity.personality")}
              hint={t("brand.identity.personalityHint")}
              values={brand.personality}
            />
          </CardBody>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("brand.missionVision")} />
            <CardBody className="space-y-5">
              <div>
                <h3 className="text-[12.5px] font-medium text-ink-subtle">{t("brand.mission")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink">{brand.mission}</p>
              </div>
              <div>
                <h3 className="text-[12.5px] font-medium text-ink-subtle">{t("brand.vision")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink">{brand.vision}</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("brand.valuesVoice")} />
            <CardBody className="space-y-5">
              <div>
                <h3 className="text-[12.5px] font-medium text-ink-subtle">{t("brand.values")}</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {brand.values.map((v) => (
                    <li key={v}>
                      <Badge tone="accent">{v}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-[12.5px] font-medium text-ink-subtle">{t("brand.toneOfVoice")}</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {brand.voice.map((v) => (
                    <li key={v}>
                      <Badge>{v}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <section aria-labelledby="brand-visual" className="space-y-4">
        <SectionHeader id="brand-visual" title={t("brand.visual.title")} description={t("brand.visual.description")} />

        <Card>
          <CardHeader title={t("brand.visual.logo")} description={hasLogo ? brand.logo.concept || undefined : undefined} />
          <CardBody>
            {hasLogo ? (
              <LogoSuite pkg={pkg} onMissing={() => setMissingUrl(brand.logo.imageUrl)} />
            ) : (
              <LogoUnavailable status={logoMissing ? "missing" : brand.logo.status} onRegenerate={onRegenerateLogo} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("brand.palette.title")} description={t("brand.palette.description")} />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {brand.palette.map((c, i) => (
                <EditableSwatch key={c.role} businessId={pkg.id} swatch={c} index={i} />
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("brand.typography.title")}
            description={t("brand.typography.description")}
            actions={<CopyButton label={t("brand.typography.copyLink")} text={type.googleFontsHref} />}
          />
          <CardBody className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              <Specimen role={t("brand.typography.headings")} font={type.headingFont} family={headingFamily} sample={brand.slogan} weight={700} />
              <Specimen role={t("brand.typography.body")} font={type.bodyFont} family={bodyFamily} sample={brand.description} weight={400} />
            </div>
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-ink">{t("brand.typography.scale")}</h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {type.scale.map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <span
                      className="min-w-0 truncate text-ink"
                      style={{
                        fontFamily: s.weight >= 600 ? headingFamily : bodyFamily,
                        fontSize: Math.min(s.sizePx, 40),
                        fontWeight: s.weight,
                        lineHeight: 1.15,
                        letterSpacing: s.letterSpacing,
                      }}
                    >
                      {brand.name}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">
                      {s.label} · {s.sizePx}px · {s.weight}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("brand.visual.direction")} description={t("brand.visual.directionDescription")} />
          <CardBody className="space-y-4">
            <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-ink-subtle">{t("brand.visual.style")}</dt>
                <dd className="mt-0.5 text-ink">{styleLabel(pkg.input.style, t)}</dd>
              </div>
              {direction?.colors && (
                <div>
                  <dt className="text-ink-subtle">{t("brand.visual.preferredColors")}</dt>
                  <dd className="mt-0.5 text-ink">{direction.colors}</dd>
                </div>
              )}
              {direction?.avoidColors && (
                <div>
                  <dt className="text-ink-subtle">{t("brand.visual.avoidColors")}</dt>
                  <dd className="mt-0.5 text-ink">{direction.avoidColors}</dd>
                </div>
              )}
              {direction?.references && (
                <div>
                  <dt className="text-ink-subtle">{t("brand.visual.references")}</dt>
                  <dd className="mt-0.5 text-ink">{direction.references}</dd>
                </div>
              )}
            </dl>
            {brand.guidelines.length > 0 && (
              <ol className="divide-y divide-border rounded-lg border border-border">
                {brand.guidelines.map((g, i) => (
                  <li key={g.title} className="flex gap-4 px-4 py-3.5">
                    <span className="w-5 shrink-0 text-[13px] tabular-nums text-ink-subtle">{i + 1}</span>
                    <div>
                      <div className="text-sm font-medium text-ink">{g.title}</div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{g.rule}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function Specimen({
  role,
  font,
  family,
  sample,
  weight,
}: {
  role: string;
  font: string;
  family: string;
  sample: string;
  weight: number;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-ink-subtle">{role}</span>
        <span className="truncate text-[13px] font-medium text-ink">{font}</span>
      </div>
      <div className="mt-4 text-5xl text-ink" style={{ fontFamily: family, fontWeight: weight }}>
        Aa
      </div>
      <p className="mt-4 line-clamp-3 text-[15px] leading-relaxed text-ink-muted" style={{ fontFamily: family, fontWeight: weight }}>
        {sample}
      </p>
    </div>
  );
}

function LogoSuite({ pkg, onMissing }: { pkg: BusinessPackage; onMissing: () => void }) {
  const t = useT();
  const { logo, name } = pkg.brand;
  const slug = slugify(name);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <LogoTile label={t("brand.logo.primary")} background="#ffffff" downloadUrl={logo.imageUrl} downloadName={`${slug}-logo.png`}>
        <BrandLogo logo={logo} name={name} variant="full" className="max-h-24 w-full" onMissing={onMissing} />
      </LogoTile>
      <LogoTile label={t("brand.logo.onDark")} background="#111113">
        <BrandLogo logo={logo} name={name} variant="full" className="max-h-24 w-full" onMissing={onMissing} />
      </LogoTile>
      <LogoTile label={t("brand.logo.appIcon")} background="#ffffff" downloadUrl={logo.iconUrl} downloadName={`${slug}-icon.png`}>
        <BrandLogo logo={logo} name={name} variant="icon" className="max-h-24 w-auto" onMissing={onMissing} />
      </LogoTile>
    </div>
  );
}

function LogoTile({
  label,
  background,
  downloadUrl,
  downloadName,
  children,
}: {
  label: string;
  background: string;
  downloadUrl?: string;
  downloadName?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex h-36 items-center justify-center p-6" style={{ background }}>
        {children}
      </div>
      <div className="flex min-h-10 items-center justify-between gap-2 border-t border-border px-3 py-1.5">
        <span className="text-[13px] text-ink">{label}</span>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadName}
            className="shrink-0 rounded px-1.5 py-0.5 text-[12.5px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            {t("brand.logo.downloadPng")}
          </a>
        )}
      </div>
    </div>
  );
}

function LogoUnavailable({
  status,
  onRegenerate,
}: {
  status: "generated" | "unavailable" | "error" | "missing";
  onRegenerate?: () => void;
}) {
  const t = useT();
  const notConfigured = status === "unavailable";
  const missing = status === "missing";
  return (
    <div className="mx-auto max-w-[320px] py-4 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-subtle">
        <ImageOff size={18} aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">
        {notConfigured ? t("brand.logo.notGenerated") : missing ? t("brand.logo.missing") : t("brand.logo.failed")}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
        {notConfigured
          ? t("brand.logo.notGeneratedDescription")
          : missing
            ? t("brand.logo.missingDescription")
            : t("brand.logo.failedDescription")}
      </p>
      {notConfigured ? (
        <Link href="/dashboard/settings#integrations" className="mt-2 inline-block text-[12.5px] font-medium text-brand hover:underline">
          {t("brand.logo.checkIntegrations")}
        </Link>
      ) : (
        onRegenerate && (
          <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onRegenerate}>
            {t("brand.logo.regenerate")}
          </Button>
        )
      )}
    </div>
  );
}
