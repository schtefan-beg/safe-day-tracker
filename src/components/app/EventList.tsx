import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { eventTitle, TYPE_LABEL, type FullEvent } from "@/lib/db";
import { TYPE_COLOR, TYPE_ICON } from "./icons";
import { useApp } from "./AppShell";
import { cn } from "@/lib/utils";

export function EventItem({ e, compact }: { e: FullEvent; compact?: boolean }) {
  const { openEdit } = useApp();
  const Icon = TYPE_ICON[e.type];
  return (
    <button onClick={() => openEdit(e)} className="flex w-full gap-3 rounded-2xl bg-card p-3 text-left shadow-sm active:bg-accent">
      <div className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{format(e.timestamp, "HH:mm")}</div>
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TYPE_COLOR[e.type])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{TYPE_LABEL[e.type]}</div>
        <div className="text-sm font-medium">{eventTitle(e)}</div>
        {!compact && e.note && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.note}</p>}
        {e.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {e.tags.map((t) => <span key={t.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t.name}</span>)}
          </div>
        )}
      </div>
    </button>
  );
}

export function GroupedEvents({ events }: { events: FullEvent[] }) {
  const groups = new Map<string, FullEvent[]>();
  for (const e of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
    const k = format(e.timestamp, "yyyy-MM-dd");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([day, list]) => (
        <section key={day} id={`day-${day}`} className="space-y-2">
          <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-sm font-semibold capitalize backdrop-blur">
            {format(new Date(day + "T12:00:00"), "EEEE d MMMM", { locale: fr })}
          </h3>
          {list.map((e) => <EventItem key={e.id} e={e} />)}
        </section>
      ))}
    </div>
  );
}
