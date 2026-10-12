import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { db, deleteEvent, saveEvent, TYPE_LABEL, type EventType, type FullEvent } from "@/lib/db";
import { ScoreSlider } from "./ScoreSlider";
import { TagPicker } from "./TagPicker";
import { cn } from "@/lib/utils";

const MEAL_KINDS = ["petit-déjeuner", "déjeuner", "dîner", "collation", "autre"];
const ACT_KINDS = ["marche", "course", "sport", "mobilité", "randonnée", "musculation", "autre"];
export const SCREEN_CATS = ["travail", "jeux vidéo", "vidéos", "réseaux sociaux", "messagerie", "lecture", "autre"];
const MED_CATS = ["médicament", "traitement", "complément", "autre"];
const BASE_SYMPTOMS = ["ballonnements", "reflux", "douleurs abdominales", "nausée", "transit", "fatigue", "maux de tête"];

const inputCls = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={cn("rounded-full border px-3 py-1.5 text-sm", value === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function DurationInput({ value, onChange }: { value: number | null; onChange: (m: number | null) => void }) {
  const h = value != null ? Math.floor(value / 60) : "";
  const m = value != null ? value % 60 : "";
  const set = (hh: string, mm: string) => {
    if (hh === "" && mm === "") return onChange(null);
    onChange((parseInt(hh || "0") || 0) * 60 + (parseInt(mm || "0") || 0));
  };
  return (
    <div className="flex items-center gap-2">
      <input inputMode="numeric" className={inputCls} placeholder="h" value={h} onChange={(e) => set(e.target.value, String(m))} />
      <span className="text-sm">h</span>
      <input inputMode="numeric" className={inputCls} placeholder="min" value={m} onChange={(e) => set(String(h), e.target.value)} />
      <span className="text-sm">min</span>
    </div>
  );
}

export function EventEditor({
  open, onOpenChange, type, event,
}: { open: boolean; onOpenChange: (o: boolean) => void; type: EventType; event?: FullEvent | null }) {
  const [ts, setTs] = useState("");
  const [p, setP] = useState<any>({});
  const [note, setNote] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [more, setMore] = useState(false);

  const medNames = useLiveQuery(async () => {
    const rows = await db().events.where("type").equals("medication").toArray();
    return [...new Set(rows.map((r) => { try { return JSON.parse(r.payload_json).name as string; } catch { return ""; } }).filter(Boolean))];
  }, []) ?? [];
  const customSymptoms = useLiveQuery(async () => {
    const rows = await db().events.where("type").equals("symptom_physical").toArray();
    return [...new Set(rows.map((r) => { try { return JSON.parse(r.payload_json).symptom as string; } catch { return ""; } }))]
      .filter((s) => s && !BASE_SYMPTOMS.includes(s));
  }, []) ?? [];

  useEffect(() => {
    if (!open) return;
    setTs(format(event?.timestamp ?? Date.now(), "yyyy-MM-dd'T'HH:mm"));
    setNote(event?.note ?? "");
    setTagIds(event?.tags.map((t) => t.id) ?? []);
    setMore(type === "psy" || !!event?.note);
    const defaults: Record<EventType, any> = {
      meal: { kind: guessMeal(), heaviness: 5 },
      sleep: { duration_min: null, quality: null },
      activity: { kind: "marche", duration_min: 30, intensity: 4 },
      medication: { name: "", dose: "", category: "médicament", recurring: false },
      symptom_physical: { symptom: "ballonnements", intensity: 5, zone: "" },
      psy: { mood: null, stress: null, anxiety: null, energy: null },
      screen: { category: "travail", duration_min: 60, source: "manual" },
    };
    setP(event?.payload ?? defaults[type]);
  }, [open, event, type]);

  const set = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v }));

  const save = async () => {
    const timestamp = new Date(ts).getTime();
    if (isNaN(timestamp)) return void toast.error("Date invalide");
    if (type === "sleep" && (!p.duration_min || p.quality == null)) return void toast.error("Durée et qualité du sommeil requises");
    if (type === "screen" && !p.duration_min) return void toast.error("Durée requise");
    if (type === "medication" && !p.name?.trim()) return void toast.error("Nom requis");
    if (type === "symptom_physical" && !p.symptom?.trim()) return void toast.error("Symptôme requis");
    if (type === "psy" && [p.mood, p.stress, p.anxiety, p.energy].every((v) => v == null) && !note.trim())
      return void toast.error("Renseigne au moins un score ou un détail");
    await saveEvent({ ...(event ? { id: event.id } : {}), type, timestamp, payload: p, note, tagIds });
    toast.success(event ? "Modifié" : "Enregistré");
    onOpenChange(false);
  };

  const remove = async () => {
    if (!event || !confirm("Supprimer cet événement ?")) return;
    await deleteEvent(event.id);
    toast.success("Supprimé");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-8">
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="font-display text-2xl">{event ? "Modifier" : ""} {TYPE_LABEL[type]}</SheetTitle>
        </SheetHeader>
        <div className="mx-auto max-w-lg space-y-5">
          <Field label="Date et heure">
            <input type="datetime-local" className={inputCls} value={ts} onChange={(e) => setTs(e.target.value)} />
          </Field>

          {type === "meal" && (<>
            <Field label="Type"><Chips options={MEAL_KINDS} value={p.kind} onChange={(v) => set("kind", v)} /></Field>
            <ScoreSlider label="Lourdeur ressentie" value={p.heaviness} onChange={(v) => set("heaviness", v ?? 0)} />
          </>)}

          {type === "sleep" && (<>
            <Field label="Durée de sommeil"><DurationInput value={p.duration_min} onChange={(v) => set("duration_min", v)} /></Field>
            <ScoreSlider label="Qualité du sommeil" value={p.quality} onChange={(v) => set("quality", v)} />
          </>)}

          {type === "activity" && (<>
            <Field label="Type"><Chips options={ACT_KINDS} value={p.kind} onChange={(v) => set("kind", v)} /></Field>
            <Field label="Durée"><DurationInput value={p.duration_min} onChange={(v) => set("duration_min", v ?? 0)} /></Field>
            <ScoreSlider label="Intensité" value={p.intensity} onChange={(v) => set("intensity", v ?? 0)} hint="1–3 faible · 4–6 modérée · 7–10 intense" />
          </>)}

          {type === "screen" && (<>
            <Field label="Usage"><Chips options={SCREEN_CATS} value={p.category} onChange={(v) => set("category", v)} /></Field>
            <Field label="Durée"><DurationInput value={p.duration_min} onChange={(v) => set("duration_min", v ?? 0)} /></Field>
            {p.source === "auto" && <p className="text-xs text-muted-foreground">Importé automatiquement depuis le téléphone.</p>}
          </>)}

          {type === "medication" && (<>
            <Field label="Nom">
              <input list="med-names" className={inputCls} value={p.name} onChange={(e) => set("name", e.target.value)} />
              <datalist id="med-names">{medNames.map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label="Catégorie"><Chips options={MED_CATS} value={p.category} onChange={(v) => set("category", v)} /></Field>
          </>)}

          {type === "symptom_physical" && (<>
            <Field label="Symptôme">
              <Chips options={[...BASE_SYMPTOMS, ...customSymptoms]} value={p.symptom} onChange={(v) => set("symptom", v)} />
              <input className={cn(inputCls, "mt-2")} placeholder="Autre symptôme…"
                value={[...BASE_SYMPTOMS, ...customSymptoms].includes(p.symptom) ? "" : p.symptom}
                onChange={(e) => set("symptom", e.target.value)} />
            </Field>
            <ScoreSlider label="Intensité" value={p.intensity} onChange={(v) => set("intensity", v ?? 0)} />
          </>)}

          {type === "psy" && (<>
            <p className="text-sm text-muted-foreground">Un seul score suffit. Le détail est souvent le plus utile en séance.</p>
            <ScoreSlider optional label="Humeur générale" value={p.mood} onChange={(v) => set("mood", v)} />
            <ScoreSlider optional label="Stress" value={p.stress} onChange={(v) => set("stress", v)} />
            <ScoreSlider optional label="Anxiété" value={p.anxiety} onChange={(v) => set("anxiety", v)} />
            <ScoreSlider optional label="Énergie mentale" value={p.energy} onChange={(v) => set("energy", v)} />
            <Field label="Détail : situation, pensée, interaction, ressenti…">
              <textarea rows={4} className="w-full rounded-md border border-input bg-card p-3 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>)}

          <Collapsible open={more} onOpenChange={setMore}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              Détails facultatifs <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-4">
              {type === "sleep" && (<>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Coucher"><input type="time" className={inputCls} value={p.bedtime ?? ""} onChange={(e) => set("bedtime", e.target.value)} /></Field>
                  <Field label="Lever"><input type="time" className={inputCls} value={p.wakeup ?? ""} onChange={(e) => set("wakeup", e.target.value)} /></Field>
                </div>
                <Field label="Réveils nocturnes"><input inputMode="numeric" className={inputCls} value={p.awakenings ?? ""} onChange={(e) => set("awakenings", e.target.value === "" ? null : parseInt(e.target.value))} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sieste (heure)"><input type="time" className={inputCls} value={p.nap_time ?? ""} onChange={(e) => set("nap_time", e.target.value)} /></Field>
                  <Field label="Sieste (min)"><input inputMode="numeric" className={inputCls} value={p.nap_min ?? ""} onChange={(e) => set("nap_min", e.target.value === "" ? null : parseInt(e.target.value))} /></Field>
                </div>
              </>)}
              {type === "medication" && (<>
                <Field label="Dose ou quantité"><input className={inputCls} value={p.dose ?? ""} onChange={(e) => set("dose", e.target.value)} /></Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!p.recurring} onChange={(e) => set("recurring", e.target.checked)} /> Prise récurrente
                </label>
              </>)}
              {type === "symptom_physical" && (
                <Field label="Zone ou précision"><input className={inputCls} value={p.zone ?? ""} onChange={(e) => set("zone", e.target.value)} /></Field>
              )}
              <TagPicker value={tagIds} onChange={setTagIds} />
              {type !== "psy" && (
                <Field label="Note">
                  <textarea rows={3} className="w-full rounded-md border border-input bg-card p-3 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="flex gap-2 pt-2">
            {event && (
              <button type="button" onClick={remove} className="inline-flex h-12 items-center justify-center rounded-xl border border-destructive/40 px-4 text-destructive" aria-label="Supprimer">
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={save} className="h-12 flex-1 rounded-xl bg-primary font-medium text-primary-foreground">
              Enregistrer
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function guessMeal() {
  const h = new Date().getHours();
  if (h < 10) return "petit-déjeuner";
  if (h < 15) return "déjeuner";
  if (h >= 18 && h < 23) return "dîner";
  return "collation";
}
