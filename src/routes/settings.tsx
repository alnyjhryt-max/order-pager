import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from "@/client/components/SettingsSection";
import { STAMP_ICONS } from "@/client/components/StampCard";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Switch } from "@/client/components/ui/switch";
import { errorMessage } from "@/client/lib/errors";
import { STAMP_SHAPES, type StampShape } from "@/shared/rules";
import { getSettings, saveSettings } from "@/serverFunctions/venue";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  head: () => ({ meta: [{ title: "Settings · Order Pager" }] }),
  component: SettingsPage,
});

const SHAPE_LABEL: Record<StampShape, string> = {
  cup: "Cup",
  star: "Star",
  heart: "Heart",
  dot: "Dot",
};

function SettingsPage() {
  const { canEdit, settings } = Route.useLoaderData();
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [stamps, setStamps] = useState(String(settings.stampsNeeded));
  const [saving, setSaving] = useState(false);
  const set = (change: Partial<typeof value>) => setValue({ ...value, ...change });
  const disabled = !canEdit;

  async function save() {
    setSaving(true);
    try {
      await saveSettings({
        data: { ...value, stampsNeeded: Number(stamps) },
      });
      toast.success("Settings saved");
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Settings" />
      {!canEdit ? (
        <Alert>
          <AlertDescription>Only admins can change settings.</AlertDescription>
        </Alert>
      ) : null}
      <form
        className="space-y-10"
        onSubmit={(event) => {
          event.preventDefault();
          if (canEdit) void save();
        }}
      >
        <SettingsSection title="Venue">
          <SettingsCard>
            <SettingsRow label="Venue name" htmlFor="venue-name">
              <Input id="venue-name" className="w-56" maxLength={80} disabled={disabled} value={value.venueName} onChange={(e) => set({ venueName: e.target.value })} />
            </SettingsRow>
            <SettingsRow label="Time zone" description="Sold-out marks clear at midnight here." htmlFor="time-zone">
              <Input id="time-zone" className="w-56" placeholder="Europe/Madrid" disabled={disabled} value={value.timeZone} onChange={(e) => set({ timeZone: e.target.value })} />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Stamp card">
          <SettingsCard>
            <SettingsRow label="Loyalty card" description="Each order marked Ready adds a stamp, up to three a day.">
              <Switch aria-label="Loyalty card" disabled={disabled} checked={value.loyaltyEnabled} onCheckedChange={(checked) => set({ loyaltyEnabled: checked })} />
            </SettingsRow>
            <SettingsRow label="Stamps needed" htmlFor="stamps-needed">
              <Input id="stamps-needed" type="number" min={2} max={30} className="w-24" disabled={disabled} value={stamps} onChange={(e) => setStamps(e.target.value)} />
            </SettingsRow>
            <SettingsRow label="Reward" htmlFor="reward">
              <Input id="reward" className="w-56" maxLength={120} placeholder="A free coffee" disabled={disabled} value={value.rewardText} onChange={(e) => set({ rewardText: e.target.value })} />
            </SettingsRow>
            <SettingsRow label="Stamp shape">
              <SegmentedToggle
                value={value.stampShape}
                onChange={(stampShape) => canEdit && set({ stampShape })}
                items={STAMP_SHAPES.map((shape) => {
                  const Icon = STAMP_ICONS[shape];
                  return { value: shape, label: SHAPE_LABEL[shape], icon: <Icon /> };
                })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Phone ordering">
          <SettingsCard>
            <SettingsRow label="Collect at counter">
              <Switch aria-label="Collect at counter" disabled={disabled} checked={value.collectEnabled} onCheckedChange={(checked) => set({ collectEnabled: checked })} />
            </SettingsRow>
            <SettingsRow label="Deliver to car">
              <Switch aria-label="Deliver to car" disabled={disabled} checked={value.carEnabled} onCheckedChange={(checked) => set({ carEnabled: checked })} />
            </SettingsRow>
            <SettingsRow label="Serve at table" description="Only from a table's code.">
              <Switch aria-label="Serve at table" disabled={disabled} checked={value.tableEnabled} onCheckedChange={(checked) => set({ tableEnabled: checked })} />
            </SettingsRow>
            <SettingsRow label="Opens" description="Leave both blank to take orders all day." htmlFor="opens-at">
              <Input id="opens-at" type="time" className="w-32" disabled={disabled} value={value.opensAt} onChange={(e) => set({ opensAt: e.target.value })} />
            </SettingsRow>
            <SettingsRow label="Closes" htmlFor="closes-at">
              <Input id="closes-at" type="time" className="w-32" disabled={disabled} value={value.closesAt} onChange={(e) => set({ closesAt: e.target.value })} />
            </SettingsRow>
            <SettingsRow label="Pause ordering">
              <Switch aria-label="Pause ordering" disabled={disabled} checked={value.paused} onCheckedChange={(checked) => set({ paused: checked })} />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" pending={saving}>
              Save
            </Button>
          </div>
        ) : null}
      </form>
    </AppShell>
  );
}
