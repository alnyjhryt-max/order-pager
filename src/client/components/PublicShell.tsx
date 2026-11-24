import type { ReactNode } from "react";

/** The frame of the customer's pages: one narrow scrolling column. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 pt-6 pb-16">
        {children}
      </main>
    </div>
  );
}
