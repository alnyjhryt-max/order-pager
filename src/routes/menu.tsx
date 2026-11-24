import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/errors";
import type { ItemInput, MenuItem, MenuSection } from "@/server/menu";
import { formatPrice, parsePrice } from "@/shared/rules";
import {
  deleteItem,
  deleteSection,
  getMenu,
  moveItem,
  moveSection,
  saveItem,
  saveSection,
  setSoldOut,
  uploadPhoto,
} from "@/serverFunctions/menu";

export const Route = createFileRoute("/menu")({
  loader: () => getMenu(),
  head: () => ({ meta: [{ title: "Menu · Order Pager" }] }),
  component: MenuPage,
});

type SectionDraft = { id?: string; name: string; nameEn: string };
type Confirm = { title: string; label: string; run: () => Promise<unknown> };

function MenuPage() {
  const { canEdit, sections } = Route.useLoaderData();
  const router = useRouter();
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, setPending] = useState(false);

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Menu"
        description={
          <a href="/p/m" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
            Open the customer menu
          </a>
        }
        actions={
          canEdit ? (
            <Button onClick={() => setSectionDraft({ name: "", nameEn: "" })}>
              <Plus /> Add section
            </Button>
          ) : null
        }
      />

      {sections.length === 0 ? (
        <EmptyState
          title="No menu yet"
          description={canEdit ? "Add a section, then the items in it." : "An admin builds the menu."}
        />
      ) : (
        sections.map((section, index) => (
          <SectionBlock
            key={section.id}
            section={section}
            canEdit={canEdit}
            first={index === 0}
            last={index === sections.length - 1}
            onMove={(direction) => run(() => moveSection({ data: { id: section.id, direction } }))}
            onEdit={() => setSectionDraft({ id: section.id, name: section.name, nameEn: section.nameEn })}
            onDelete={() =>
              setConfirm({
                title: `Delete ${section.name}?`,
                label: "Delete",
                run: () => deleteSection({ data: { id: section.id } }),
              })
            }
            onAddItem={() => setItemDraft(emptyItem(section.id))}
            onEditItem={(item) => setItemDraft(toDraft(item))}
            onDeleteItem={(item) =>
              setConfirm({
                title: `Delete ${item.name}?`,
                label: "Delete",
                run: () => deleteItem({ data: { id: item.id } }),
              })
            }
            onMoveItem={(item, direction) => run(() => moveItem({ data: { id: item.id, direction } }))}
            onSoldOut={(item, soldOut) => run(() => setSoldOut({ data: { id: item.id, soldOut } }))}
          />
        ))
      )}

      {sectionDraft ? (
        <SectionDialog
          draft={sectionDraft}
          onClose={() => setSectionDraft(null)}
          onSave={async (draft) => {
            if (await run(() => saveSection({ data: draft }))) setSectionDraft(null);
          }}
        />
      ) : null}
      {itemDraft ? (
        <ItemDialog
          draft={itemDraft}
          onClose={() => setItemDraft(null)}
          onSave={async (data, photo) => {
            const ok = await run(async () => {
              const saved = await saveItem({ data });
              if (photo) {
                const form = new FormData();
                form.set("id", saved.id);
                form.set("photo", photo);
                await uploadPhoto({ data: form });
              }
            });
            if (ok) setItemDraft(null);
          }}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          destructive
          pending={pending}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            setPending(true);
            await run(confirm.run);
            setPending(false);
            setConfirm(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function SectionBlock({
  section,
  canEdit,
  first,
  last,
  onMove,
  onEdit,
  onDelete,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  onSoldOut,
}: {
  section: MenuSection;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onMove: (direction: "up" | "down") => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddItem: () => void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (item: MenuItem) => void;
  onMoveItem: (item: MenuItem, direction: "up" | "down") => void;
  onSoldOut: (item: MenuItem, soldOut: boolean) => void;
}) {
  return (
    <section data-testid="menu-section" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{section.name}</h2>
          {section.nameEn ? <p className="text-sm text-muted-foreground">{section.nameEn}</p> : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            <IconButton label="Move section up" disabled={first} onClick={() => onMove("up")}>
              <ArrowUp />
            </IconButton>
            <IconButton label="Move section down" disabled={last} onClick={() => onMove("down")}>
              <ArrowDown />
            </IconButton>
            <IconButton label="Edit section" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton label="Delete section" onClick={onDelete} destructive>
              <Trash2 />
            </IconButton>
            <Button size="sm" variant="outline" onClick={onAddItem}>
              <Plus /> Add item
            </Button>
          </div>
        ) : null}
      </div>
      {section.items.length === 0 ? (
        <EmptyState size="sm" icon={null} title="No items in this section" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
          {section.items.map((item, index) => (
            <li key={item.id} data-testid="menu-item" className="flex flex-wrap items-center gap-3 px-4 py-3">
              {item.photoUrl ? (
                <img src={item.photoUrl} alt="" className="size-12 shrink-0 rounded-md border border-border object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[
                    item.nameEn,
                    item.sizes.length
                      ? item.sizes.map((s) => `${s.name} ${formatPrice(s.price)}`).join(" · ")
                      : formatPrice(item.price),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {item.soldOut ? <Badge variant="warning">Sold out</Badge> : null}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  aria-label={`Sold out: ${item.name}`}
                  checked={item.soldOut}
                  onCheckedChange={(checked) => onSoldOut(item, checked)}
                />
                <span aria-hidden>Sold out</span>
              </label>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <IconButton label="Move up" disabled={index === 0} onClick={() => onMoveItem(item, "up")}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={index === section.items.length - 1}
                    onClick={() => onMoveItem(item, "down")}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton label="Edit" onClick={() => onEditItem(item)}>
                    <Pencil />
                  </IconButton>
                  <IconButton label="Delete" onClick={() => onDeleteItem(item)} destructive>
                    <Trash2 />
                  </IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={destructive ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground"}
    >
      {children}
    </Button>
  );
}

function SectionDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: SectionDraft;
  onClose: () => void;
  onSave: (draft: SectionDraft) => Promise<void>;
}) {
  const [value, setValue] = useState(draft);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            await onSave(value);
            setSaving(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit section" : "New section"}</DialogTitle>
          </DialogHeader>
          <Field label="Name" id="section-name">
            <Input id="section-name" required maxLength={80} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
          </Field>
          <Field label="English name" id="section-name-en">
            <Input id="section-name-en" maxLength={80} value={value.nameEn} onChange={(e) => setValue({ ...value, nameEn: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ItemDraft {
  id?: string;
  sectionId: string;
  name: string;
  nameEn: string;
  description: string;
  price: string;
  sizes: { name: string; price: string }[];
  calories: string;
  caffeineMg: string;
  allergens: string;
  highSalt: boolean;
}

function emptyItem(sectionId: string): ItemDraft {
  return {
    sectionId,
    name: "",
    nameEn: "",
    description: "",
    price: "",
    sizes: [],
    calories: "",
    caffeineMg: "",
    allergens: "",
    highSalt: false,
  };
}

function toDraft(item: MenuItem): ItemDraft {
  return {
    id: item.id,
    sectionId: item.sectionId,
    name: item.name,
    nameEn: item.nameEn,
    description: item.description,
    price: formatPrice(item.price),
    sizes: item.sizes.map((s) => ({ name: s.name, price: formatPrice(s.price) })),
    calories: item.calories?.toString() ?? "",
    caffeineMg: item.caffeineMg?.toString() ?? "",
    allergens: item.allergens,
    highSalt: item.highSalt,
  };
}

function wholeNumber(value: string): number | null {
  return value.trim() === "" ? null : Math.max(0, Math.round(Number(value)));
}

function ItemDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: ItemDraft;
  onClose: () => void;
  onSave: (
    data: ItemInput,
    photo: File | null,
  ) => Promise<void>;
}) {
  const [value, setValue] = useState(draft);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (change: Partial<ItemDraft>) => setValue({ ...value, ...change });

  async function submit() {
    const sizes = value.sizes
      .filter((s) => s.name.trim() || s.price.trim())
      .map((s) => ({ name: s.name.trim(), price: parsePrice(s.price) }));
    const price = sizes[0]?.price ?? parsePrice(value.price);
    if (price === null || sizes.some((s) => s.price === null || !s.name)) {
      setError("Enter each price as a number, such as 3.50.");
      return;
    }
    setError(null);
    setSaving(true);
    await onSave(
      {
        id: value.id,
        sectionId: value.sectionId,
        name: value.name,
        nameEn: value.nameEn,
        description: value.description,
        price,
        sizes: sizes.map((s) => ({ name: s.name, price: s.price! })),
        calories: wholeNumber(value.calories),
        caffeineMg: wholeNumber(value.caffeineMg),
        allergens: value.allergens,
        highSalt: value.highSalt,
      },
      photo,
    );
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" id="item-name">
              <Input id="item-name" required maxLength={80} value={value.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="English name" id="item-name-en">
              <Input id="item-name-en" maxLength={80} value={value.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
            </Field>
          </div>
          <Field label="Description" id="item-description">
            <Textarea id="item-description" maxLength={300} value={value.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Price" id="item-price">
            <Input
              id="item-price"
              inputMode="decimal"
              required={value.sizes.length === 0}
              disabled={value.sizes.length > 0}
              placeholder={value.sizes.length > 0 ? "Set per size" : "0.00"}
              value={value.sizes.length > 0 ? "" : value.price}
              onChange={(e) => set({ price: e.target.value })}
            />
          </Field>
          <div className="space-y-2">
            {value.sizes.map((size, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Size name ${index + 1}`}
                  placeholder="Size"
                  maxLength={40}
                  value={size.name}
                  onChange={(e) => set({ sizes: value.sizes.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)) })}
                />
                <Input
                  aria-label={`Size price ${index + 1}`}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="w-28"
                  value={size.price}
                  onChange={(e) => set({ sizes: value.sizes.map((s, i) => (i === index ? { ...s, price: e.target.value } : s)) })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove size ${index + 1}`}
                  onClick={() => set({ sizes: value.sizes.filter((_, i) => i !== index) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {value.sizes.length < 6 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => set({ sizes: [...value.sizes, { name: "", price: "" }] })}>
                <Plus /> Add size
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Calories" id="item-calories">
              <Input id="item-calories" type="number" min={0} value={value.calories} onChange={(e) => set({ calories: e.target.value })} />
            </Field>
            <Field label="Caffeine (mg)" id="item-caffeine">
              <Input id="item-caffeine" type="number" min={0} value={value.caffeineMg} onChange={(e) => set({ caffeineMg: e.target.value })} />
            </Field>
          </div>
          <Field label="Allergens" id="item-allergens">
            <Input id="item-allergens" placeholder="Milk, Gluten" maxLength={200} value={value.allergens} onChange={(e) => set({ allergens: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox aria-label="High in salt" checked={value.highSalt} onCheckedChange={(checked) => set({ highSalt: checked })} />
            <span aria-hidden>High in salt</span>
          </label>
          <Field label="Photo" id="item-photo">
            <Input id="item-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
