"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { useProjects } from "@/lib/client/store";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/primitives";

export function CenterShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (pkg: BusinessPackage) => React.ReactNode;
}) {
  const { active } = useProjects();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          active ? (
            <Link href={`/dashboard/projects/${active.id}`}>
              <Button variant="secondary">
                Full workspace <ArrowRight size={15} />
              </Button>
            </Link>
          ) : undefined
        }
      />
      {!ready ? (
        <div className="space-y-4">
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : active ? (
        children(active)
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
