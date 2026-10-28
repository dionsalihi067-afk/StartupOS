"use client";

import * as React from "react";
import type { LogoAsset } from "@/lib/types";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Renders a REAL generated logo image. There are no static/placeholder logos:
 * when no image was generated, the `full` variant renders nothing (callers show
 * an explicit unavailable state) and the `icon` variant renders a neutral
 * initial-only avatar used purely as list/nav chrome. If a stored image cannot
 * be loaded, `onMissing` is called so callers can say so instead of showing a
 * broken image.
 */
export function BrandLogo({
  logo,
  name,
  variant = "full",
  className,
  onMissing,
}: {
  logo: LogoAsset;
  name: string;
  variant?: "full" | "icon";
  className?: string;
  onMissing?: () => void;
}) {
  const t = useT();
  const url = variant === "icon" ? logo.iconUrl || logo.imageUrl : logo.imageUrl || logo.iconUrl;
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  if (logo.generated && url && failedUrl !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={variant === "icon" ? t("brand.logo.iconAlt", { name }) : t("brand.logo.logoAlt", { name })}
        className={cn("object-contain", className)}
        onError={() => {
          setFailedUrl(url);
          onMissing?.();
        }}
      />
    );
  }

  if (variant === "icon") return <Initial name={name} className={cn("rounded-[inherit]", className)} />;

  return null;
}

/** Square business avatar for lists and navigation: real icon if generated, else an initial. */
export function BusinessAvatar({ name, iconUrl, className }: { name: string; iconUrl: string | null; className?: string }) {
  const t = useT();
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  return (
    <span className={cn("flex shrink-0 overflow-hidden border border-border bg-surface", className)}>
      {iconUrl && failedUrl !== iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={t("brand.logo.iconAlt", { name })}
          className="h-full w-full object-contain"
          onError={() => setFailedUrl(iconUrl)}
        />
      ) : (
        <Initial name={name} className="h-full w-full" />
      )}
    </span>
  );
}

function Initial({ name, className }: { name: string; className?: string }) {
  const t = useT();
  return (
    <div
      role="img"
      aria-label={t("brand.logo.avatarAlt", { name })}
      className={cn("flex items-center justify-center bg-surface-3 font-semibold text-ink-muted", className)}
    >
      {name.trim().charAt(0).toUpperCase() || "S"}
    </div>
  );
}

/** Icon URL for a package's logo, or null when no real logo was generated. */
export function packageIconUrl(logo: LogoAsset): string | null {
  return logo.generated ? logo.iconUrl || logo.imageUrl || null : null;
}

export function logoIsAvailable(logo: LogoAsset): boolean {
  return logo.generated && Boolean(logo.imageUrl || logo.iconUrl);
}
