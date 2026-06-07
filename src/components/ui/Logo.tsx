import * as React from "react";
import type { LogoAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Renders a REAL generated logo image. There are no static/placeholder logos:
 * when no image was generated, the `full` variant renders nothing (callers show
 * an explicit unavailable state) and the `icon` variant renders a neutral
 * initial-only avatar used purely as list/nav chrome.
 */
export function BrandLogo({
  logo,
  name,
  variant = "full",
  className,
}: {
  logo: LogoAsset;
  name: string;
  variant?: "full" | "icon";
  className?: string;
}) {
  const url = variant === "icon" ? logo.iconUrl || logo.imageUrl : logo.imageUrl || logo.iconUrl;

  if (logo.generated && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${name} ${variant === "icon" ? "icon" : "logo"}`}
        className={cn("object-contain", className)}
      />
    );
  }

  if (variant === "icon") {
    return (
      <div
        aria-label={`${name} avatar`}
        className={cn("flex items-center justify-center rounded-[inherit] bg-brand font-bold text-white", className)}
      >
        {name.trim().charAt(0).toUpperCase() || "S"}
      </div>
    );
  }

  return null;
}

export function logoIsAvailable(logo: LogoAsset): boolean {
  return logo.generated && Boolean(logo.imageUrl || logo.iconUrl);
}
