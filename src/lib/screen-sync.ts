import { db, dayKey, saveEvent } from "./db";
import { ScreenTime, type AppCategory } from "@/plugins/screen-time";

const MAP: Record<AppCategory, string> = {
  game: "jeux vidéo", video: "vidéos", social: "réseaux sociaux", productivity: "travail",
  news: "lecture", audio: "autre", other: "autre",
};

/** Imports one day of phone usage as one "screen" event per category. Re-running replaces that day's auto events. */
export async function importScreenDay(day: Date) {
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86400000 - 1;
  const { apps } = await ScreenTime.getUsage({ from: start.getTime(), to: end });
  const groups = new Map<string, { label: string; min: number }[]>();
  for (const a of apps) {
    const c = MAP[a.category] ?? "autre";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push({ label: a.label, min: Math.round(a.minutes) });
  }
  const key = dayKey(start);
  // Remove stale auto categories of that day
  const existing = await db().events.where("[type+timestamp]").between(["screen", start.getTime()], ["screen", end]).toArray();
  for (const e of existing) if (e.id.startsWith(`screen-auto-${key}-`) && !groups.has(e.id.slice(`screen-auto-${key}-`.length)))
    await db().events.delete(e.id);
  const ts = Math.min(end, Date.now());
  let total = 0;
  for (const [category, list] of groups) {
    const duration_min = list.reduce((a, x) => a + x.min, 0);
    if (!duration_min) continue;
    total += duration_min;
    await saveEvent({
      id: `screen-auto-${key}-${category}`, type: "screen", timestamp: ts,
      payload: { category, duration_min, source: "auto", apps: list.sort((a, b) => b.min - a.min).slice(0, 8) },
      note: list.slice(0, 3).map((x) => `${x.label} ${x.min} min`).join(" · "), tagIds: [],
    });
  }
  return total;
}
