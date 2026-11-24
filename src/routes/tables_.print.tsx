import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { BackButton, PageHeader } from "@/client/components/PageHeader";
import { QrCode } from "@/client/components/QrCode";
import { Button } from "@/client/components/ui/button";
import { getTables } from "@/serverFunctions/venue";

export const Route = createFileRoute("/tables_/print")({
  loader: () => getTables(),
  ssr: false,
  head: () => ({ meta: [{ title: "Table codes · Order Pager" }] }),
  component: PrintPage,
});

function PrintPage() {
  const { tables } = Route.useLoaderData();
  const origin = window.location.origin;
  const navigate = useNavigate();
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Table codes"
        backLink={
          <BackButton onClick={() => void navigate({ to: "/tables" })}>
            Tables
          </BackButton>
        }
        actions={<Button onClick={() => window.print()}>Print</Button>}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tables.map((table) => (
          <figure
            key={table.id}
            className="flex break-inside-avoid flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground"
          >
            <QrCode
              value={`${origin}/p/m?t=${table.code}`}
              label={`QR code for ${table.name}`}
              size={160}
            />
            <figcaption className="text-lg font-semibold">{table.name}</figcaption>
            <p className="text-xs text-muted-foreground">Scan to order</p>
          </figure>
        ))}
      </div>
    </AppShell>
  );
}
