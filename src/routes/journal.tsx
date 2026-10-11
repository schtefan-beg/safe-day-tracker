import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { z } from "zod";
import { db, eventsBetween, EVENT_TYPES, TYPE_LABEL, type EventType } from "@/lib/db";
import { GroupedEvents } from "@/components/app/EventList";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/journal")({
  validateSearch: z.object({ date: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Journal — Rythme" },
      { name: "description", content: "Chronologie de tous tes événements, filtrable par type, tag et période." },
      { property: "og:title", content: "Journal — Rythme" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Chronologie filtrable de ton quotidien." },
    ],
  }),
  component: Journal,
});

const PERIODS = [7, 14, 28, 56, 365];

function Journal() {
  const { date } = Route.useSearch();
  const [days, setDays] = useState(date ? 56 : 14);
  const [types, setTypes] = useState<EventType[]>([]);
  const [tag, setTag] = useState<string>("");
  const tags = useLiveQuery(() => db().tags.orderBy("name").toArray(), []) ?? [];

  const events = useLiveQuery(async () => {
    const to = endOfDay(new Date()).getTime();
    const from = startOfDay(subDays(new Date(), days - 1)).getTime();
    let ev = await eventsBetween(from, to, types);
    if (tag) {
      const ids = new Set((await db().event_tags.where("tag_id").equals(tag).toArray()).map((l) => l.event_id));
      ev = ev.filter((e) => ids.has(e.id));
    }
    return ev;
  }, [days, types, tag]);

  useEffect(() => {
    const target = date ?? new Date().toISOString().slice(0, 10);
    if (events) setTimeout(() => document.getElementById(`day-${target}`)?.scrollIntoView({ block: "start" }), 50);
  }, [events?.length, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleType = (t: EventType) => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  return (
    <div className="space-y-4 px-4 pt-6">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl">Journal</h1>
        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
          Aujourd'hui
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setDays(p)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs", days === p ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {p === 365 ? "1 an" : `${p} j`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {EVENT_TYPES.map((t) => (
            <button key={t} onClick={() => toggleType(t)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", types.includes(t) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
          <option value="">Tous les tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.usage_count})</option>)}
        </select>
      </div>
      {events && events.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucun événement pour ces filtres.</p>}
      {events && <GroupedEvents events={events} />}
    </div>
  );
}
