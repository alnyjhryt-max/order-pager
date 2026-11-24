import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Orders" },
  { to: "/screen", label: "Screen" },
  { to: "/menu", label: "Menu" },
  { to: "/tables", label: "Tables" },
  { to: "/settings", label: "Settings" },
] as const;

/** The app's pages, in AppShell's bar. */
export function AppNav() {
  return (
    <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.to === "/" }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "font-medium text-foreground" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
