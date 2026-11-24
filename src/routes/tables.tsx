import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Printer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { errorMessage } from "@/client/lib/errors";
import { createTable, deleteTable, getTables } from "@/serverFunctions/venue";

export const Route = createFileRoute("/tables")({
  loader: () => getTables(),
  head: () => ({ meta: [{ title: "Tables · Order Pager" }] }),
  component: TablesPage,
});

function TablesPage() {
  const { canEdit, tables } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Tables"
        actions={
          tables.length > 0 ? (
            <Button variant="outline" render={<Link to="/tables/print" />}>
              <Printer /> Print codes
            </Button>
          ) : null
        }
      />
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name.trim();
            if (!next) return;
            setName("");
            void run(() => createTable({ data: { name: next } }));
          }}
        >
          <Input
            aria-label="Table name"
            placeholder="Table name"
            maxLength={40}
            className="bg-card"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit">Add table</Button>
        </form>
      ) : (
        <Alert>
          <AlertDescription>Only admins can add or remove tables.</AlertDescription>
        </Alert>
      )}
      {tables.length === 0 ? (
        <EmptyState
          title="No tables yet"
          description="Each table gets a code; customers who scan it order to that table."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
          {tables.map((table) => (
            <li key={table.id} data-testid="table-row" className="flex items-center gap-3 px-5 py-3">
              <p className="min-w-0 flex-1 font-medium">{table.name}</p>
              <a
                data-testid="table-link"
                href={origin ? `${origin}/p/m?t=${table.code}` : `/p/m?t=${table.code}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Menu link
              </a>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${table.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setRemoving(table)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {removing ? (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await run(() => deleteTable({ data: { id: removing.id } }));
            setRemoving(null);
          }}
        >
          Its printed code stops working.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
