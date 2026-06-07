"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { BusinessPackage } from "@/lib/types";
import { getProject, setActiveProjectId } from "@/lib/client/store";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [pkg, setPkg] = React.useState<BusinessPackage | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "missing">("loading");

  React.useEffect(() => {
    if (!id) return;
    const found = getProject(id);
    if (found) {
      setPkg(found);
      setActiveProjectId(found.id);
      setStatus("ready");
    } else {
      setStatus("missing");
    }
  }, [id]);

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="skeleton h-14 w-64 rounded-xl" />
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (status === "missing" || !pkg) {
    return (
      <div>
        <Link href="/dashboard/projects" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={15} /> Back to projects
        </Link>
        <EmptyState
          title="Project not found"
          description="This project may have been deleted or was created in a different browser. Generate a new business to continue."
        />
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard/projects" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink">
        <ArrowLeft size={15} /> All projects
      </Link>
      <ProjectWorkspace initial={pkg} />
    </div>
  );
}
