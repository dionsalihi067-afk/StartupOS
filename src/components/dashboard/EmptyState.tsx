import * as React from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function EmptyState({
  title = "No business generated yet",
  description = "Generate your first business to unlock this center. The Startup Generator turns a single idea into a complete, launch-ready package.",
  icon,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-elevated text-brand-2">
        {icon ?? <Wand2 size={28} />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      <Link href="/dashboard/generate" className="mt-6">
        <Button size="lg">
          <Wand2 size={17} /> Open Startup Generator
        </Button>
      </Link>
    </div>
  );
}
