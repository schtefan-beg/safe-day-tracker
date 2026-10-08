import { addDays, format, startOfDay, subDays } from "date-fns";
import { db, dayKey, eventsBetween, type DailyAggregate, type FullEvent } from "./db";

export function periodRange(days: number, end = new Date()) {
  const to = end.getTime();
  const from = startOfDay(subDays(end, days - 1)).getTime();
  return { from, to };
}

export function dayList(days: number, end = new Date()) {
  return Array.from({ length: days }, (_, i) => dayKey(subDays(end, days - 1 - i)));
}

export async function aggregatesFor(days: number) {
  const keys = dayList(days);
  const rows = await db().daily_aggregates.where("date").between(keys[0], keys[keys.length - 1], true, true).toArray();
  const map = new Map(rows.map((r) => [r.date, r]));
  return keys.map((k) => map.get(k) ?? ({ date: k } as Partial<DailyAggregate> & { date: string }));
}

export interface Piste {
  factor: string;
  impact: string;
  lag: 0 | 1 | 2;
  occurrences: number;
  withMean: number;
  withoutMean: number;
  withoutDays: number;
  diff: number;
  direction: "hausse" | "baisse";
}

type Impact = { label: string; get: (a: Partial<DailyAggregate> | undefined, hasData: boolean) => number | null };

const IMPACTS: Impact[] = [
  { label: "intensité digestive max", get: (a, has) => (a?.digestion_max_intensity ?? (has ? 0 : null)) },
  { label: "stress", get: (a) => a?.stress_avg ?? null },
  { label: "anxiété", get: (a) => a?.anxiety_avg ?? null },
  { label: "humeur", get: (a) => a?.mood_avg ?? null },
  { label: "énergie mentale", get: (a) => a?.mental_energy_avg ?? null },
];

export const MIN_OCC = 5;

export async function computePistes(days: number): Promise<{ pistes: Piste[]; factorsTested: number }> {
  const { from, to } = periodRange(days);
  const events = await eventsBetween(from, to);
  const keys = dayList(days);
  const aggs = await aggregatesFor(days + 2);
  const aggMap = new Map(aggs.map((a) => [a.date, a]));
  const daysWithData = new Set(events.map((e) => dayKey(e.timestamp)));

  const factors = new Map<string, Set<string>>();
  const add = (name: string, day: string) => {
    if (!factors.has(name)) factors.set(name, new Set());
    factors.get(name)!.add(day);
  };
  for (const e of events) {
    const d = dayKey(e.timestamp);
    if (e.type === "meal") for (const t of e.tags) add(`Repas tagué « ${t.name} »`, d);
    if (e.type === "sleep" && e.payload.duration_min < 360) add("Sommeil inférieur à 6 h", d);
    if (e.type === "sleep" && e.payload.quality <= 4) add("Qualité de sommeil ≤ 4/10", d);
    if (e.type === "activity" && e.payload.intensity >= 7) add("Activité intense (≥ 7/10)", d);
    if (e.type === "activity") add("Activité physique (toute intensité)", d);
    if (e.type === "medication" && e.payload.name) add(`Prise : ${e.payload.name}`, d);
  }

  const pistes: Piste[] = [];
  for (const [factor, fdays] of factors) {
    for (const lag of [0, 1, 2] as const) {
      for (const imp of IMPACTS) {
        const withV: number[] = [];
        const withoutV: number[] = [];
        for (const k of keys) {
          const target = format(addDays(new Date(k + "T12:00:00"), lag), "yyyy-MM-dd");
          const v = imp.get(aggMap.get(target), daysWithData.has(target));
          if (v == null) continue;
          (fdays.has(k) ? withV : withoutV).push(v);
        }
        if (withV.length < MIN_OCC || withoutV.length < MIN_OCC) continue;
        const m1 = withV.reduce((a, b) => a + b, 0) / withV.length;
        const m0 = withoutV.reduce((a, b) => a + b, 0) / withoutV.length;
        const diff = m1 - m0;
        if (Math.abs(diff) < 1) continue;
        pistes.push({
          factor, impact: imp.label, lag, occurrences: withV.length, withMean: m1, withoutMean: m0,
          withoutDays: withoutV.length, diff, direction: diff > 0 ? "hausse" : "baisse",
        });
      }
    }
  }
  // keep strongest lag per factor/impact
  const best = new Map<string, Piste>();
  for (const p of pistes) {
    const k = p.factor + "|" + p.impact;
    const cur = best.get(k);
    if (!cur || Math.abs(p.diff) > Math.abs(cur.diff)) best.set(k, p);
  }
  return {
    pistes: [...best.values()].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    factorsTested: factors.size,
  };
}

export const lagLabel = (l: number) => (l === 0 ? "même jour" : `J+${l}`);

export interface Summary {
  from: number; to: number; generated: number; days: number;
  psy: { key: string; label: string; avg: number | null; firstHalf: number | null; secondHalf: number | null; n: number }[];
  sleep: { avgMin: number | null; avgQuality: number | null; nights: number; under6: number };
  digestion: { count: number; avgIntensity: number | null; top: [string, number][] };
  notable: FullEvent[];
  meds: { name: string; count: number; category: string }[];
  checkins: FullEvent[];
  allCheckinsWithNote: FullEvent[];
  series: { date: string; humeur: number | null; stress: number | null; anxiété: number | null; énergie: number | null }[];
  pistes: Piste[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function buildSummary(days: number): Promise<Summary> {
  const { from, to } = periodRange(days);
  const events = await eventsBetween(from, to);
  const aggs = await aggregatesFor(days);
  const mid = from + (to - from) / 2;
  const psyEv = events.filter((e) => e.type === "psy");
  const keys = [
    ["mood", "Humeur"], ["stress", "Stress"], ["anxiety", "Anxiété"], ["energy", "Énergie mentale"],
  ] as const;
  const psy = keys.map(([key, label]) => {
    const all = psyEv.filter((e) => typeof e.payload[key] === "number");
    return {
      key, label, n: all.length,
      avg: mean(all.map((e) => e.payload[key])),
      firstHalf: mean(all.filter((e) => e.timestamp < mid).map((e) => e.payload[key])),
      secondHalf: mean(all.filter((e) => e.timestamp >= mid).map((e) => e.payload[key])),
    };
  });
  const sleeps = events.filter((e) => e.type === "sleep");
  const sym = events.filter((e) => e.type === "symptom_physical");
  const symCount = new Map<string, number>();
  for (const s of sym) symCount.set(s.payload.symptom, (symCount.get(s.payload.symptom) ?? 0) + 1);

  const intensity = (e: FullEvent) => {
    const p = e.payload;
    if (e.type === "psy") {
      return Math.max(
        p.mood != null ? Math.abs(p.mood - 5) * 2 : 0, p.stress ?? 0, p.anxiety ?? 0,
        p.energy != null && p.energy <= 2 ? 10 - p.energy : 0,
      );
    }
    if (e.type === "symptom_physical") return p.intensity ?? 0;
    return 0;
  };
  const notable = events
    .filter((e) => {
      const p = e.payload;
      if (e.type === "psy")
        return (p.mood != null && (p.mood <= 2 || p.mood >= 9)) || (p.stress ?? 0) >= 8 || (p.anxiety ?? 0) >= 8 || (p.energy != null && p.energy <= 2);
      if (e.type === "symptom_physical") return (p.intensity ?? 0) >= 8;
      if (e.type === "sleep") return p.duration_min < 300 || p.quality <= 2;
      return false;
    })
    .sort((a, b) => intensity(b) - intensity(a))
    .slice(0, 12)
    .sort((a, b) => a.timestamp - b.timestamp);

  const medMap = new Map<string, { name: string; count: number; category: string }>();
  for (const m of events.filter((e) => e.type === "medication")) {
    const k = (m.payload.name || "?").toLowerCase();
    const cur = medMap.get(k) ?? { name: m.payload.name, count: 0, category: m.payload.category };
    cur.count++;
    medMap.set(k, cur);
  }
  const withNote = psyEv.filter((e) => e.note.trim());
  const checkins = [...withNote].sort((a, b) => intensity(b) - intensity(a)).slice(0, 6);
  const { pistes } = await computePistes(days);
  return {
    from, to, generated: Date.now(), days, psy,
    sleep: {
      avgMin: mean(sleeps.map((e) => e.payload.duration_min)),
      avgQuality: mean(sleeps.map((e) => e.payload.quality)),
      nights: sleeps.length,
      under6: sleeps.filter((e) => e.payload.duration_min < 360).length,
    },
    digestion: {
      count: sym.length, avgIntensity: mean(sym.map((e) => e.payload.intensity)),
      top: [...symCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    },
    notable,
    meds: [...medMap.values()].sort((a, b) => b.count - a.count),
    checkins,
    allCheckinsWithNote: withNote,
    series: aggs.map((a) => ({
      date: a.date, humeur: a.mood_avg ?? null, stress: a.stress_avg ?? null,
      anxiété: a.anxiety_avg ?? null, énergie: a.mental_energy_avg ?? null,
    })),
    pistes: pistes.slice(0, 5),
  };
}
