"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { GenerateWizard } from "@/components/dashboard/GenerateWizard";
import { useT } from "@/i18n/client";

export default function GeneratePage() {
  const t = useT();
  return (
    <div>
      <PageHeader
        eyebrow={t("navigation.workspace")}
        title={t("generate.title")}
        description={t("generate.description")}
      />
      <GenerateWizard />
    </div>
  );
}
