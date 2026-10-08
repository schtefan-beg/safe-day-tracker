import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, X } from "lucide-react";
import { db, ensureTag } from "@/lib/db";
import { cn } from "@/lib/utils";

export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const tags = useLiveQuery(() => db().tags.orderBy("name").toArray(), []) ?? [];
  const [draft, setDraft] = useState("");
  const sorted = [...tags].sort((a, b) => b.usage_count - a.usage_count);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const create = async () => {
    if (!draft.trim()) return;
    const t = await ensureTag(draft);
    if (!value.includes(t.id)) onChange([...value, t.id]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Tags</span>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((t) => {
          const on = value.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              {t.name}
              {on && <X className="h-3 w-3" />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
          placeholder="Nouveau tag…"
          className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm"
        />
        <button type="button" onClick={create} className="inline-flex h-9 items-center gap-1 rounded-md bg-secondary px-3 text-sm">
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
    </div>
  );
}
