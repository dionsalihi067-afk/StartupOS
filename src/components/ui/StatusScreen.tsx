import * as React from "react";
import { AlertTriangle } from "lucide-react";

/** Full-page centred message for states where the app shell cannot render (e.g. the database is unreachable). */
export function StatusScreen({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <AlertTriangle size={20} aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
        {actions && <div className="mt-6 flex flex-col justify-center gap-2 min-[400px]:flex-row">{actions}</div>}
      </div>
    </main>
  );
}
