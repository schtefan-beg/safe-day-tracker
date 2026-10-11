import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { endOfDay, format, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Check, ChevronRight, Plus, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { db, eventsBetween, EVENT_TYPES, TYPE_LABEL, hydrate, dayKey } from "@/lib/db";
import { TYPE_COLOR, TYPE_ICON } from "@/components/app/icons";
import { useApp } from "@/components/app/AppShell";
import { EventItem } from "@/components/app/EventList";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Companion } from "@/components/app/Companion";
import { balance, claimQuest, EMPTY_GAME, loadGame, QUESTS, questKey } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aujourd'hui — Rythme" },
      { name: "description", content: "Saisie rapide des repas, sommeil, activité, médicaments, symptômes et check-ins psy." },
      { property: "og:title", content: "Aujourd'hui — Rythme" },
      { property: "og:description", content: "Saisie rapide de ta journée, données gardées sur ton téléphone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Today,
});

function Today() {
  const { openNew } = useApp();
  const game = useLiveQuery(loadGame, []) ?? EMPTY_GAME;
  const [busy, setBusy] = useState<string | null>(null);
  const day = dayKey(new Date());
  const today = useLiveQuery(() => eventsBetween(startOfDay(new Date()).getTime(), endOfDay(new Date()).getTime()), []);
  const lastPsy = useLiveQuery(async () => {
    const rows = await db().events.where("[type+timestamp]").between(["psy", 0], ["psy", Infinity]).reverse().limit(20).toArray();
    const ev = await hydrate(rows);
    const pick = (k: string) => ev.find((e) => typeof e.payload[k] === "number");
    return ([["mood", "Humeur"], ["stress", "Stress"], ["anxiety", "Anxiété"], ["energy", "Énergie"]] as const).map(([k, l]) => {
      const e = pick(k);
      return { label: l, value: e?.payload[k] as number | undefined, at: e?.timestamp };
    });
  }, []);

  return (
    <div className="space-y-6 px-5 pt-6 sm:px-7">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-bold capitalize text-muted-foreground">{format(new Date(), "EEEE d MMMM", { locale: fr })}</p>
        <h1 className="mt-1 text-3xl font-extrabold">Bonjour, toi <span className="text-2xl">☀️</span></h1></div>
        <span className="flex items-center gap-1.5 rounded-full border border-game-gold/30 bg-secondary px-3 py-2 font-extrabold text-secondary-foreground"><Star className="h-4 w-4 fill-current" />{balance(game)}</span>
      </header>
      <Companion game={game} />
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-extrabold">Mes petites quêtes</h2><span className="text-xs font-bold text-muted-foreground">{QUESTS.filter((q) => game.claims.includes(questKey(day, q.type))).length}/4 accomplies</span></div>
        <div className="space-y-2.5">{QUESTS.map((q) => {
          const Icon = TYPE_ICON[q.type];
          const key = questKey(day, q.type);
          const claimed = game.claims.includes(key);
          const ready = today?.some((e) => e.type === q.type);
          return <div key={q.type} className={cn("quest-row flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3", claimed ? "border-primary/25" : "border-border")}>
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TYPE_COLOR[q.type])}><Icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{q.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{claimed ? "Un petit pas de plus, bravo !" : q.subtitle}</p></div>
            <Button size="sm" variant={claimed ? "ghost" : ready ? "default" : "secondary"} className="shrink-0 rounded-full" disabled={claimed || busy === key} aria-label={claimed ? `${q.title} accomplie` : ready ? `Récupérer les étoiles : ${q.title}` : q.subtitle} onClick={async () => {
              if (!ready) { openNew(q.type); return; }
              setBusy(key);
              try { if (await claimQuest(q.type, day)) toast.success("+10 étoiles ! Milo fait un petit bond de joie ✨"); }
              catch { toast.error("Les étoiles n’ont pas pu être enregistrées. Réessaie."); }
              finally { setBusy(null); }
            }}>{claimed ? <Check className="text-primary" /> : ready ? <><Sparkles />+10</> : <><Star />10 <Plus /></>}</Button>
          </div>;
        })}</div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Un jour sans quête ? Milo t’aime tout autant. 💛</p>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-extrabold">Mon journal, à ma façon</h2>
        <div className="grid grid-cols-3 gap-2.5">
        {EVENT_TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          return (
            <Button variant="ghost" key={t} onClick={() => openNew(t)} className="flex h-auto flex-col items-center gap-2 rounded-xl border border-border bg-card px-1 py-3.5 active:scale-[0.97]">
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", TYPE_COLOR[t])}><Icon className="h-5 w-5" /></span>
               <span className="text-[11px] font-bold">{TYPE_LABEL[t]}</span>
            </Button>
          );
        })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">Mon ciel intérieur</h2>
        <div className="grid grid-cols-4 gap-2">
          {(lastPsy ?? []).map((s) => (
             <div key={s.label} className="rounded-xl border border-border bg-card px-1 py-3 text-center">
               <div className="font-display text-2xl font-extrabold tabular-nums">{s.value ?? "–"}<span className="text-xs font-normal text-muted-foreground">/10</span></div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              {s.at && <div className="text-[10px] text-muted-foreground">{format(s.at, "dd/MM HH:mm")}</div>}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap justify-between gap-3 border-y border-border py-4 text-sm font-bold"><Link to="/tendances" className="flex items-center gap-2">Mes tendances <ArrowRight className="h-4 w-4" /></Link><Link to="/resume" className="flex items-center gap-2 text-muted-foreground">Résumé 4 semaines <ChevronRight className="h-4 w-4" /></Link></div>

      <section className="space-y-2">
        <h2 className="text-xl font-extrabold">Les petits moments du jour</h2>
        {today && today.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Une page toute neuve pour tes petits moments 🌼
          </p>
        )}
        {today?.map((e) => <EventItem key={e.id} e={e} compact />)}
      </section>
      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Ton jardin secret. Tes données restent sur ce téléphone.</p>
    </div>
  );
}
