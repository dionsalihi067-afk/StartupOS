"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, Plus } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Button } from "@/components/ui/primitives";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="lg:pl-[264px]">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-bg-elevated/80 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-ink-muted"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-[15px] font-bold">StartupOS</span>
          <Link href="/dashboard/generate">
            <Button size="sm">
              <Plus size={15} /> New
            </Button>
          </Link>
        </div>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
