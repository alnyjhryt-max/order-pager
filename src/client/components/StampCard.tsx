import { Circle, Coffee, Heart, Star, type LucideIcon } from "lucide-react";
import { cn } from "cn";

export const STAMP_ICONS: Record<string, LucideIcon> = {
  cup: Coffee,
  star: Star,
  heart: Heart,
  dot: Circle,
};

/** The customer's stamp card: a row of stamps and the reward. */
export function StampCard({
  count,
  target,
  reward,
  shape,
}: {
  count: number;
  target: number;
  reward: string;
  shape: string;
}) {
  const Icon = STAMP_ICONS[shape] ?? Coffee;
  const shown = Math.min(count, target);
  return (
    <div
      data-testid="loyalty-card"
      className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">Stamp card</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          <span data-testid="loyalty-count">
            {shown}/{target}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: target }, (_, index) => (
          <span
            key={index}
            className={cn(
              "flex size-8 items-center justify-center rounded-full border",
              index < shown
                ? "border-primary bg-primary text-primary-foreground"
                : "border-dashed border-border text-muted-foreground/40",
            )}
          >
            <Icon className="size-4" />
          </span>
        ))}
      </div>
      {reward ? (
        <p className="text-sm text-muted-foreground">
          {shown >= target ? "Full! Ask for your reward: " : "Reward: "}
          {reward}
        </p>
      ) : null}
    </div>
  );
}
