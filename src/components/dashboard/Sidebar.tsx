"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, X } from "lucide-react";
import { MODULES } from "@/lib/content";
import { Icon } from "@/components/ui/Icon";
import { useProjects } from "@/lib/client/store";
import { cn } from "@/lib/utils";

const GROUPS: { id: "main" | "centers" | "system"; label: string }[] = [
  { id: "main", label: "Workspace" },
  { id: "centers", label: "Centers" },
  { id: "system", label: "System" },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { active, projects } = useProjects();

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-border bg-bg-elevated transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-accent text-white">
              <Zap size={16} strokeWidth={2.5} />
            </span>
            <span className="text-[16px] font-bold tracking-tight">StartupOS</span>
          </Link>
          <button onClick={onClose} className="text-ink-muted hover:text-ink lg:hidden" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {GROUPS.map((group) => (
            <div key={group.id}>
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {MODULES.filter((m) => m.group === group.id).map((m) => {
                  const isActive =
                    m.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(m.href);
                  return (
                    <Link
                      key={m.key}
                      href={m.href}
                      onClick={onClose}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                        isActive
                          ? "bg-brand-soft text-white shadow-[inset_0_0_0_1px_rgba(109,94,252,0.35)]"
                          : "text-ink-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      <Icon
                        name={m.icon}
                        size={18}
                        className={cn(isActive ? "text-brand-2" : "text-ink-subtle group-hover:text-ink-muted")}
                      />
                      {m.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              Active project
            </div>
            <div className="mt-1 truncate text-sm font-semibold">
              {active ? active.brand.name : "None yet"}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-subtle">
              {projects.length} project{projects.length === 1 ? "" : "s"} saved
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
