import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Renders trusted, engine-generated SVG markup. All SVG strings originate from
 * the StartupOS generation engine (never user input), so inline rendering is
 * safe and keeps logos/creatives crisp and scalable.
 */
export function SvgRender({
  markup,
  className,
  label,
}: {
  markup: string;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("[&>svg]:h-full [&>svg]:w-full [&>svg]:block", className)}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
