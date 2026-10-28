"use client";

import * as React from "react";
import type { BusinessInput, BusinessPackage } from "@/lib/types";
import { getAffectedSections, getChangedDependencyDomains, type GeneratedSectionId } from "@/lib/dependencies";
import { updateBusinessContext } from "@/lib/client/businesses";
import { DiscoveryWizard } from "@/components/discovery/DiscoveryWizard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InlineNotice } from "@/components/dashboard/EmptyState";
import { useT } from "@/i18n/client";

/**
 * Edit-only shell around the shared DiscoveryWizard. Saving updates source
 * business context on the server and never triggers generation automatically.
 */
export function EditBusinessContext({
  pkg,
  onCancel,
  onSaved,
}: {
  pkg: BusinessPackage;
  onCancel: () => void;
  /** Called after a successful save with sections that may now be outdated. */
  onSaved: (affected: GeneratedSectionId[]) => void;
}) {
  const t = useT();
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  async function save(input: BusinessInput) {
    setSaving(true);
    setFailed(false);
    try {
      const previous = pkg.input;
      await updateBusinessContext(pkg.id, input);
      const domains = getChangedDependencyDomains(previous, input);
      onSaved(getAffectedSections(domains));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("discovery.edit.title")} description={t("discovery.edit.description")} />
      {failed && <InlineNotice tone="danger" title={t("discovery.edit.saveFailed")} className="mx-auto mb-4 max-w-3xl" />}
      <DiscoveryWizard mode="edit" initialInput={pkg.input} onSubmit={save} onCancel={onCancel} saving={saving} />
    </div>
  );
}
