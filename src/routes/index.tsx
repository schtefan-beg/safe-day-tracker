import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { endOfDay, format, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, FileText } from "lucide-react";
import { db, eventsBetween, EVENT_TYPES, TYPE_LABEL, hydrate } from "@/lib/db";
import { TYPE_COLOR, TYPE_ICON } from "@/components/app/icons";
import { useApp } from "@/components/app/AppShell";
import { EventItem } from "@/components/app/EventList";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aujourd'hui — Rythme" },
      { name: "description", content: "Saisie rapide des repas, sommeil, activité, médicaments, symptômes et check-ins psy." },
      { property: "og:title", content: "Aujourd'hui — Rythme" },
      { property: "og:description", content: "Saisie rapide de ta journée, données gardées sur ton téléphone." },
    ],
  }),
  component: Today,
});

function Today() {
  const { openNew } = useApp();
  const today = useLiveQuery(() => eventsBetween(startOfDay(new Date()).getTime(), endOfDay(new Date()).getTime()), []);
  const lastPsy = useLiveQuery(async () => {
    const rows = await db().events.where("[type+timestamp]").between(["psy", 0], ["psy", Infinity]).reverse().limit(20).toArray();
    const ev = await hydrate(rows);
    const pick = (k: string) => ev.find((e) => typeof e.payload[k] === "number");
    return [["mood", "Humeur"], ["stress", "Stress"], ["anxiety", "Anxiété"], ["energy", "Énergie"]].map(([k, l]) => {
      const e = pick(k);
      return { label: l, value: e?.payload[k] as number | undefined, at: e?.timestamp };
    });
  }, []);

  return (
    <div className="space-y-7 px-4 pt-6">
      <header>
        <p className="text-sm capitalize text-muted-foreground">{format(new Date(), "EEEE d MMMM", { locale: fr })}</p>
        <h1 className="text-3xl">Aujourd'hui</h1>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        {EVENT_TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          return (
            <button key={t} onClick={() => openNew(t)} className="flex flex-col items-center gap-2 rounded-2xl bg-card px-2 py-4 shadow-sm active:scale-[0.97]">
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", TYPE_COLOR[t])}><Icon className="h-5 w-5" /></span>
              <span className="text-xs font-medium">{TYPE_LABEL[t]}</span>
            </button>
          );
        })}
      </section>

      <section>
        <h2 className="mb-2 text-lg">Derniers scores psy</h2>
        <div className="grid grid-cols-4 gap-2">
          {(lastPsy ?? []).map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-3 text-center shadow-sm">
              <div className="font-display text-2xl tabular-nums">{s.value ?? "–"}</div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              {s.at && <div className="text-[10px] text-muted-foreground">{format(s.at, "dd/MM HH:mm")}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5">
        <Link to="/tendances" className="flex items-center justify-between rounded-2xl bg-accent p-4 text-sm font-medium text-accent-foreground">
          Tendances <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/resume" className="flex items-center justify-between rounded-2xl bg-secondary p-4 text-sm font-medium">
          Résumé 4 semaines <FileText className="h-4 w-4" />
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg">Ma journée</h2>
        {today && today.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Rien de saisi pour l'instant. Touche une catégorie ci-dessus.
          </p>
        )}
        {today?.map((e) => <EventItem key={e.id} e={e} compact />)}
      </section>
    </div>
  );
}
