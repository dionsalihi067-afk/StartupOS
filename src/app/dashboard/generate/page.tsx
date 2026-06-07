"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { GenerateWizard } from "@/components/dashboard/GenerateWizard";

export default function GeneratePage() {
  return (
    <div>
      <PageHeader
        title="Startup Generator"
        description="Describe your idea and let the agent network build your entire business ecosystem."
      />
      <GenerateWizard />
    </div>
  );
}
