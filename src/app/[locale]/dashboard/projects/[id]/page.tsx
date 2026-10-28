"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2, SearchX } from "lucide-react";
import { deleteBusiness, loadBusiness, setActiveBusinessId, useBusiness } from "@/lib/client/businesses";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import { EmptyState, LoadError } from "@/components/dashboard/EmptyState";
import { Button, ButtonLink, PageSkeleton } from "@/components/ui/primitives";
import { useT } from "@/i18n/client";
import { useRouter } from "@/i18n/navigation";

export default function ProjectPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(params.id) : null;
  const detail = useBusiness(id);
  const [removing, setRemoving] = React.useState(false);
  const business = detail.business;

  React.useEffect(() => {
    if (detail.movedTo) router.replace(`/dashboard/projects/${detail.movedTo}`);
  }, [detail.movedTo, router]);

  React.useEffect(() => {
    if (business?.status === "ready") setActiveBusinessId(business.id);
  }, [business?.id, business?.status]);

  if (detail.status === "loading" || detail.movedTo) return <PageSkeleton label={t("common.loadingLabel")} />;

  if (detail.status === "error" || !id) {
    return <LoadError onRetry={() => id && void loadBusiness(id)} />;
  }

  if (detail.status === "notFound" || !business) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("projectPage.notFoundTitle")}
        description={t("projectPage.notFoundDescription")}
        action={
          <>
            <ButtonLink href="/dashboard/projects" variant="secondary">
              {t("navigation.allBusinesses")}
            </ButtonLink>
            <ButtonLink href="/dashboard/generate">{t("navigation.newBusiness")}</ButtonLink>
          </>
        }
      />
    );
  }

  if (business.status === "generating") {
    return (
      <EmptyState
        icon={Loader2}
        title={t("projectPage.generatingTitle")}
        description={t("projectPage.generatingDescription")}
        action={
          <ButtonLink href="/dashboard/projects" variant="secondary">
            {t("navigation.allBusinesses")}
          </ButtonLink>
        }
      />
    );
  }

  if (business.status === "failed" || !business.package) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t("projectPage.failedTitle")}
        description={t(`businessErrors.${business.errorCode ?? "generationFailed"}`)}
        action={
          <>
            <Button
              variant="secondary"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                try {
                  await deleteBusiness(business.id);
                  router.replace("/dashboard/projects");
                } catch {
                  setRemoving(false);
                }
              }}
            >
              {t("projectPage.removeFailed")}
            </Button>
            <ButtonLink href="/dashboard/generate">{t("projectPage.startAgain")}</ButtonLink>
          </>
        }
      />
    );
  }

  return <ProjectWorkspace pkg={business.package} updatedAt={business.updatedAt} />;
}
