import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { Download, Lock, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { db, deleteTag, ensureTag, getSetting, renameTag, setSetting } from "@/lib/db";
import { applyBackup, exportCSV, exportJSON, parseBackup, type Backup } from "@/lib/export";
import { checkPin, setPin, validPin } from "@/lib/pin";
import { DEFAULT_REMINDERS, requestPermission, type ReminderSettings } from "@/lib/notifications";
import { useApp } from "@/components/app/AppShell";
import { SleepTrackerCard } from "@/components/app/SleepTrackerCard";

export const Route = createFileRoute("/reglages")({
  head: () => ({
    meta: [
      { title: "Réglages — Rythme" },
      { name: "description", content: "Tags, rappels, code PIN, sauvegarde et export de tes données locales." },
      { property: "og:title", content: "Réglages — Rythme" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Gère tes tags, rappels et sauvegardes." },
    ],
  }),
  component: Settings,
});

const input = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function Settings() {
  const { lock } = useApp();
  return (
    <div className="space-y-6 px-4 pt-6">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl">Réglages</h1>
        <button onClick={lock} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs"><Lock className="h-3.5 w-3.5" /> Verrouiller</button>
      </div>
      <Card title="Suivi de nuit"><SleepTrackerCard /></Card>
      <Backups />
      <Tags />
      <Reminders />
      <PinChange />
      <p className="pb-4 text-xs text-muted-foreground">
        Le code protège l'accès à l'app mais ne remplace pas le verrouillage de ton téléphone. Pour installer l'app : menu du navigateur Chrome → « Ajouter à l'écran d'accueil ».
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm"><h2 className="text-lg">{title}</h2>{children}</section>;
}

function Backups() {
  const last = useLiveQuery(() => getSetting<number>("lastExport", 0), []);
  const count = useLiveQuery(() => db().events.count(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ data: Backup; count: number; duplicates: number } | null>(null);
  const onFile = async (f?: File) => {
    if (!f) return;
    try { setPending(await parseBackup(f)); } catch (e) { toast.error((e as Error).message); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const apply = async (mode: "merge" | "replace") => {
    if (!pending) return;
    if (mode === "replace" && !confirm("Remplacer toutes les données actuelles ?")) return;
    await applyBackup(pending.data, mode);
    toast.success(`${pending.count} événements importés`);
    setPending(null);
  };
  return (
    <Card title="Sauvegarde et export">
      <p className="text-sm text-muted-foreground">
        {count ?? 0} événements sur ce téléphone. Dernier export : {last ? format(last, "dd/MM/yyyy") : "jamais"}.
        Sans sauvegarde, une perte du téléphone efface tout.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={exportJSON} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground"><Download className="h-4 w-4" /> Sauvegarde</button>
        <button onClick={exportCSV} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium"><Download className="h-4 w-4" /> Tableur (CSV)</button>
      </div>
      <button onClick={() => fileRef.current?.click()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm"><Upload className="h-4 w-4" /> Importer une sauvegarde</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {pending && (
        <div className="space-y-2 rounded-xl bg-muted p-3 text-sm">
          <p>{pending.count} événements dans le fichier · {pending.duplicates} doublon(s) potentiel(s).</p>
          <div className="flex gap-2">
            <button onClick={() => apply("merge")} className="flex-1 rounded-lg bg-primary py-2 text-primary-foreground">Fusionner</button>
            <button onClick={() => apply("replace")} className="flex-1 rounded-lg border border-destructive/50 py-2 text-destructive">Remplacer tout</button>
            <button onClick={() => setPending(null)} className="rounded-lg px-2" aria-label="Annuler"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Tags() {
  const tags = useLiveQuery(() => db().tags.orderBy("name").toArray(), []) ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  return (
    <Card title="Tags">
      <div className="flex gap-2">
        <input className={input} placeholder="Nouveau tag" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={async () => { if (draft.trim()) { await ensureTag(draft); setDraft(""); } }} className="rounded-md bg-secondary px-3" aria-label="Ajouter"><Plus className="h-4 w-4" /></button>
      </div>
      <ul className="divide-y divide-border">
        {tags.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2">
            {editing === t.id ? (
              <>
                <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} />
                <button className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground" onClick={async () => {
                  try { await renameTag(t.id, name); setEditing(null); } catch (e) { toast.error((e as Error).message); }
                }}>OK</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.usage_count}×</span>
                <button onClick={() => { setEditing(t.id); setName(t.name); }} className="p-2" aria-label="Renommer"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => confirm(`Supprimer « ${t.name} » ?`) && deleteTag(t.id)} className="p-2 text-destructive" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Reminders() {
  const [r, setR] = useState<ReminderSettings | null>(null);
  const [slot, setSlot] = useState("18:00");
  useEffect(() => { getSetting("reminders", DEFAULT_REMINDERS).then(setR); }, []);
  if (!r) return null;
  const update = async (patch: Partial<ReminderSettings>) => {
    const n = { ...r, ...patch };
    setR(n);
    await setSetting("reminders", n);
  };
  const enable = async (on: boolean) => {
    if (on) {
      const p = await requestPermission();
      if (p !== "granted") return void toast.error("Notifications refusées ou non disponibles");
    }
    update({ enabled: on });
  };
  return (
    <Card title="Rappels">
      <label className="flex items-center justify-between text-sm">
        Activer les notifications
        <input type="checkbox" className="h-5 w-5" checked={r.enabled} onChange={(e) => enable(e.target.checked)} />
      </label>
      {r.enabled && (
        <div className="space-y-3 text-sm">
          <Row label="Saisie du sommeil">
            <input type="time" className={input} value={r.sleepTime ?? ""} onChange={(e) => update({ sleepTime: e.target.value || null })} />
          </Row>
          <Row label="Traitement récurrent">
            <input type="time" className={input} value={r.medTime ?? ""} onChange={(e) => update({ medTime: e.target.value || null })} />
          </Row>
          <Row label="Sauvegarde tous les (jours)">
            <input inputMode="numeric" className={input} value={r.backupDays ?? ""} onChange={(e) => update({ backupDays: e.target.value ? parseInt(e.target.value) : null })} />
          </Row>
          <div>
            <div className="mb-1.5">Créneaux de check-in psy</div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {r.psySlots.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">{s}
                  <button onClick={() => update({ psySlots: r.psySlots.filter((x) => x !== s) })} aria-label="Retirer"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="time" className={input} value={slot} onChange={(e) => setSlot(e.target.value)} />
              <button onClick={() => slot && !r.psySlots.includes(slot) && update({ psySlots: [...r.psySlots, slot].sort() })} className="rounded-md bg-secondary px-3">Ajouter</button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Sans serveur, les rappels s'affichent quand l'app est ouverte ou reprise en arrière-plan.</p>
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-2 items-center gap-2"><span>{label}</span>{children}</div>;
}

function PinChange() {
  const [oldP, setOld] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const submit = async () => {
    if (!(await checkPin(oldP))) return void toast.error("Ancien code incorrect");
    if (!validPin(n1)) return void toast.error("Le nouveau code doit faire 4 à 6 chiffres");
    if (n1 !== n2) return void toast.error("Les codes ne correspondent pas");
    await setPin(n1);
    setOld(""); setN1(""); setN2("");
    toast.success("Code modifié");
  };
  return (
    <Card title="Code PIN">
      <input type="password" inputMode="numeric" className={input} placeholder="Code actuel" value={oldP} onChange={(e) => setOld(e.target.value)} />
      <input type="password" inputMode="numeric" className={input} placeholder="Nouveau code" value={n1} onChange={(e) => setN1(e.target.value)} />
      <input type="password" inputMode="numeric" className={input} placeholder="Confirmer" value={n2} onChange={(e) => setN2(e.target.value)} />
      <button onClick={submit} className="h-11 w-full rounded-xl bg-secondary text-sm font-medium">Modifier le code</button>
    </Card>
  );
}
