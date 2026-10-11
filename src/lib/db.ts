import Dexie, { type Table } from "dexie";
import { format } from "date-fns";

export type EventType = "meal" | "sleep" | "activity" | "medication" | "symptom_physical" | "psy";

export const EVENT_TYPES: EventType[] = ["meal", "sleep", "activity", "medication", "symptom_physical", "psy"];

export const TYPE_LABEL: Record<EventType, string> = {
  meal: "Repas",
  sleep: "Sommeil",
  activity: "Activité",
  medication: "Médicament",
  symptom_physical: "Symptôme",
  psy: "Check-in psy",
};

export interface EventRow {
  id: string;
  timestamp: number;
  type: EventType;
  payload_json: string;
  note: string;
  created_at: number;
  updated_at: number;
}
export interface TagRow {
  id: string;
  name: string;
  created_at: number;
  usage_count: number;
}
export interface EventTagRow {
  event_id: string;
  tag_id: string;
}
export interface DailyAggregate {
  date: string;
  sleep_duration_min: number | null;
  sleep_quality: number | null;
  mood_avg: number | null;
  stress_avg: number | null;
  anxiety_avg: number | null;
  mental_energy_avg: number | null;
  digestion_symptom_count: number;
  digestion_max_intensity: number | null;
  activity_duration_min: number;
  activity_intensity_avg: number | null;
}
export interface SettingRow {
  key: string;
  value: unknown;
}

// Payloads
export interface MealPayload { kind: string; heaviness: number }
export interface SleepPayload {
  duration_min: number; quality: number; bedtime?: string; wakeup?: string;
  awakenings?: number | null; nap_time?: string; nap_min?: number | null;
}
export interface ActivityPayload { kind: string; duration_min: number; intensity: number }
export interface MedicationPayload { name: string; dose?: string; category: string; recurring: boolean }
export interface SymptomPayload { symptom: string; intensity: number; zone?: string }
export interface PsyPayload { mood?: number | null; stress?: number | null; anxiety?: number | null; energy?: number | null }

export interface FullEvent extends EventRow {
  payload: any;
  tags: TagRow[];
}

class AppDB extends Dexie {
  events!: Table<EventRow, string>;
  tags!: Table<TagRow, string>;
  event_tags!: Table<EventTagRow, [string, string]>;
  daily_aggregates!: Table<DailyAggregate, string>;
  settings!: Table<SettingRow, string>;
  constructor() {
    super("rythme-db");
    this.version(1).stores({
      events: "id, timestamp, type, [type+timestamp]",
      tags: "id, &name",
      event_tags: "[event_id+tag_id], event_id, tag_id",
      daily_aggregates: "date",
      settings: "key",
    });
  }
}

let _db: AppDB | null = null;
export function db(): AppDB {
  if (!_db) _db = new AppDB();
  return _db;
}

export const uid = () => crypto.randomUUID();
export const dayKey = (ts: number | Date) => format(ts, "yyyy-MM-dd");

export const DEFAULT_TAGS = ["gluten", "lactose", "alcool", "caféine", "gras", "sucré", "épicé", "repas copieux", "travail", "famille", "fatigue"];

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db().settings.get(key);
  return (r?.value as T) ?? fallback;
}
export async function setSetting(key: string, value: unknown) {
  await db().settings.put({ key, value });
}

export async function hydrate(rows: EventRow[]): Promise<FullEvent[]> {
  const ids = rows.map((r) => r.id);
  const links = ids.length ? await db().event_tags.where("event_id").anyOf(ids).toArray() : [];
  const tags = await db().tags.toArray();
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const byEvent = new Map<string, TagRow[]>();
  for (const l of links) {
    const t = tagMap.get(l.tag_id);
    if (!t) continue;
    if (!byEvent.has(l.event_id)) byEvent.set(l.event_id, []);
    byEvent.get(l.event_id)!.push(t);
  }
  return rows.map((r) => ({ ...r, payload: safeParse(r.payload_json), tags: byEvent.get(r.id) ?? [] }));
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}

export async function eventsBetween(from: number, to: number, types?: EventType[]): Promise<FullEvent[]> {
  let rows: EventRow[];
  if (types && types.length && types.length < EVENT_TYPES.length) {
    const parts = await Promise.all(
      types.map((t) => db().events.where("[type+timestamp]").between([t, from], [t, to], true, true).toArray()),
    );
    rows = parts.flat().sort((a, b) => a.timestamp - b.timestamp);
  } else {
    rows = await db().events.where("timestamp").between(from, to, true, true).sortBy("timestamp");
  }
  return hydrate(rows);
}

export async function ensureTag(name: string): Promise<TagRow> {
  const clean = name.trim().toLowerCase();
  const existing = await db().tags.where("name").equals(clean).first();
  if (existing) return existing;
  const t: TagRow = { id: uid(), name: clean, created_at: Date.now(), usage_count: 0 };
  await db().tags.add(t);
  return t;
}

async function refreshUsage(tagIds: string[]) {
  for (const id of new Set(tagIds)) {
    const n = await db().event_tags.where("tag_id").equals(id).count();
    await db().tags.update(id, { usage_count: n });
  }
}

export async function saveEvent(input: {
  id?: string; type: EventType; timestamp: number; payload: object; note: string; tagIds: string[];
}) {
  const d = db();
  const now = Date.now();
  return d.transaction("rw", [d.events, d.event_tags, d.tags, d.daily_aggregates], async () => {
    const prev = input.id ? await d.events.get(input.id) : undefined;
    const id = input.id ?? uid();
    const row: EventRow = {
      id, type: input.type, timestamp: input.timestamp,
      payload_json: JSON.stringify(input.payload), note: input.note,
      created_at: prev?.created_at ?? now, updated_at: now,
    };
    await d.events.put(row);
    const oldLinks = await d.event_tags.where("event_id").equals(id).toArray();
    await d.event_tags.where("event_id").equals(id).delete();
    await d.event_tags.bulkPut(input.tagIds.map((tag_id) => ({ event_id: id, tag_id })));
    await refreshUsage([...oldLinks.map((l) => l.tag_id), ...input.tagIds]);
    const days = new Set([dayKey(row.timestamp)]);
    if (prev) days.add(dayKey(prev.timestamp));
    for (const day of days) await recomputeDay(day);
    return id;
  });
}

export async function deleteEvent(id: string) {
  const d = db();
  await d.transaction("rw", [d.events, d.event_tags, d.tags, d.daily_aggregates], async () => {
    const prev = await d.events.get(id);
    const links = await d.event_tags.where("event_id").equals(id).toArray();
    await d.event_tags.where("event_id").equals(id).delete();
    await d.events.delete(id);
    await refreshUsage(links.map((l) => l.tag_id));
    if (prev) await recomputeDay(dayKey(prev.timestamp));
  });
}

export async function renameTag(id: string, name: string) {
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  const clash = await db().tags.where("name").equals(clean).first();
  if (clash && clash.id !== id) throw new Error("Ce tag existe déjà");
  await db().tags.update(id, { name: clean });
}
export async function deleteTag(id: string) {
  const d = db();
  await d.transaction("rw", [d.tags, d.event_tags], async () => {
    await d.event_tags.where("tag_id").equals(id).delete();
    await d.tags.delete(id);
  });
}

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export async function recomputeDay(day: string) {
  const start = new Date(day + "T00:00:00").getTime();
  const end = start + 86400000 - 1;
  const rows = await db().events.where("timestamp").between(start, end, true, true).toArray();
  const ev = rows.map((r) => ({ ...r, p: safeParse(r.payload_json) }));
  const sleeps = ev.filter((e) => e.type === "sleep");
  const psy = ev.filter((e) => e.type === "psy");
  const sym = ev.filter((e) => e.type === "symptom_physical");
  const act = ev.filter((e) => e.type === "activity");
  const agg: DailyAggregate = {
    date: day,
    sleep_duration_min: sleeps.length ? sleeps.reduce((a, e) => a + (e.p.duration_min || 0), 0) : null,
    sleep_quality: avg(sleeps.map((e) => e.p.quality)),
    mood_avg: avg(psy.map((e) => e.p.mood)),
    stress_avg: avg(psy.map((e) => e.p.stress)),
    anxiety_avg: avg(psy.map((e) => e.p.anxiety)),
    mental_energy_avg: avg(psy.map((e) => e.p.energy)),
    digestion_symptom_count: sym.length,
    digestion_max_intensity: sym.length ? Math.max(...sym.map((e) => e.p.intensity ?? 0)) : null,
    activity_duration_min: act.reduce((a, e) => a + (e.p.duration_min || 0), 0),
    activity_intensity_avg: avg(act.map((e) => e.p.intensity)),
  };
  if (!rows.length) await db().daily_aggregates.delete(day);
  else await db().daily_aggregates.put(agg);
}

export async function recomputeAll() {
  const d = db();
  await d.daily_aggregates.clear();
  const all = await d.events.toArray();
  const days = new Set(all.map((e) => dayKey(e.timestamp)));
  for (const day of days) await recomputeDay(day);
}

export function eventTitle(e: FullEvent): string {
  const p = e.payload ?? {};
  switch (e.type) {
    case "meal": return `${cap(p.kind || "Repas")} · lourdeur ${p.heaviness ?? "–"}/10`;
    case "sleep": return `Sommeil ${fmtDur(p.duration_min)} · qualité ${p.quality ?? "–"}/10`;
    case "activity": return `${cap(p.kind || "Activité")} ${fmtDur(p.duration_min)} · intensité ${p.intensity ?? "–"}/10`;
    case "medication": return `${p.name || "Prise"}${p.dose ? " · " + p.dose : ""}`;
    case "symptom_physical": return `${cap(p.symptom || "Symptôme")} · ${p.intensity ?? "–"}/10`;
    case "psy": {
      const parts = [
        p.mood != null && `humeur ${p.mood}`, p.stress != null && `stress ${p.stress}`,
        p.anxiety != null && `anxiété ${p.anxiety}`, p.energy != null && `énergie ${p.energy}`,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "Check-in (détail)";
    }
  }
}
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export function fmtDur(min?: number | null) {
  if (min == null || isNaN(min)) return "–";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}
