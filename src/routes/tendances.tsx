import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { aggregatesFor, periodRange } from "@/lib/analysis";
import { dayKey, db, eventsBetween } from "@/lib/db";
import { cn } from "@/lib/utils";
import { PeriodPicker } from "@/components/app/PeriodPicker";

export const Route = createFileRoute("/tendances")({
  head: () => ({
    meta: [
      { title: "Tendances — Rythme" },
      { name: "description", content: "Humeur, stress, sommeil et digestion sur 14, 28 ou 56 jours." },
      { property: "og:title", content: "Tendances — Rythme" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Tes courbes psy, sommeil et digestion réunies." },
    ],
  }),
  component: Trends,
});

const PSY = [
  { key: "humeur", color: "var(--chart-1)" },
  { key: "stress", color: "var(--chart-2)" },
  { key: "anxiété", color: "var(--chart-3)" },
  { key: "énergie", color: "var(--chart-4)" },
] as const;

function Trends() {
  const [days, setDays] = useState(28);
  const [on, setOn] = useState<Record<string, boolean>>({ humeur: true, stress: true, anxiété: true, énergie: true });
  const [tag, setTag] = useState("");
  const navigate = useNavigate();
  const tags = useLiveQuery(() => db().tags.orderBy("name").toArray(), []) ?? [];

  const data = useLiveQuery(async () => {
    const aggs = await aggregatesFor(days);
    const { from, to } = periodRange(days);
    const ev = await eventsBetween(from, to, ["meal", "activity", "medication"]);
    const tagIds = tag ? new Set((await db().event_tags.where("tag_id").equals(tag).toArray()).map((l) => l.event_id)) : null;
    const marks = new Map<string, { meal: number; activity: number; medication: number; tagged: number }>();
    for (const e of ev) {
      const k = dayKey(e.timestamp);
      const m = marks.get(k) ?? { meal: 0, activity: 0, medication: 0, tagged: 0 };
      m[e.type as "meal"]++;
      if (tagIds?.has(e.id)) m.tagged++;
      marks.set(k, m);
    }
    if (tagIds) {
      const all = await eventsBetween(from, to);
      for (const e of all) if (tagIds.has(e.id) && !["meal", "activity", "medication"].includes(e.type)) {
        const k = dayKey(e.timestamp);
        const m = marks.get(k) ?? { meal: 0, activity: 0, medication: 0, tagged: 0 };
        m.tagged++; marks.set(k, m);
      }
    }
    return aggs.map((a) => {
      const m = marks.get(a.date);
      return {
        date: a.date,
        label: format(new Date(a.date + "T12:00:00"), "dd/MM"),
        humeur: a.mood_avg ?? null, stress: a.stress_avg ?? null, anxiété: a.anxiety_avg ?? null, énergie: a.mental_energy_avg ?? null,
        sommeilH: a.sleep_duration_min != null ? +(a.sleep_duration_min / 60).toFixed(1) : null,
        qualité: a.sleep_quality ?? null,
        digestion: a.digestion_max_intensity ?? null,
        symptômes: a.digestion_symptom_count ?? 0,
        repas: m?.meal ? 1 : null, activité: a.activity_duration_min || null, médicament: m?.medication ? 1 : null,
        tagged: m?.tagged ? 1 : null,
      };
    });
  }, [days, tag]);

  const openDay = (st: any) => {
    const d = st?.activePayload?.[0]?.payload?.date;
    if (d) navigate({ to: "/journal", search: { date: d } });
  };

  const axis = { tick: { fontSize: 10, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false };

  return (
    <div className="space-y-5 px-4 pt-6">
      <h1 className="text-3xl">Tendances</h1>
      <PeriodPicker value={days} onChange={setDays} />
      <p className="text-xs text-muted-foreground">Touche un jour pour l'ouvrir dans le journal.</p>

      <Card title="État psychologique (moyenne par jour)">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PSY.map((s) => (
            <button key={s.key} onClick={() => setOn((o) => ({ ...o, [s.key]: !o[s.key] }))}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on[s.key] ? "border-border bg-card" : "border-transparent opacity-40")}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.key}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} onClick={openDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
            <YAxis domain={[0, 10]} {...axis} width={20} />
            <Tooltip />
            {PSY.filter((s) => on[s.key]).map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls type="monotone" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Sommeil : durée (h) et qualité">
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={data} onClick={openDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
            <YAxis domain={[0, 12]} {...axis} width={20} />
            <Tooltip />
            <Bar dataKey="sommeilH" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
            <Line dataKey="qualité" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Digestion et marqueurs">
        <div className="mb-2">
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs">
            <option value="">Mettre en évidence un tag…</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} onClick={openDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
            <YAxis domain={[0, 10]} {...axis} width={20} />
            <Tooltip />
            <Bar dataKey="digestion" name="symptôme max" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            <Scatter dataKey={(d: any) => (d.repas ? 9.5 : null)} name="repas" fill="var(--chart-5)" />
            <Scatter dataKey={(d: any) => (d.activité ? 8.7 : null)} name="activité" fill="var(--chart-1)" />
            <Scatter dataKey={(d: any) => (d.médicament ? 7.9 : null)} name="médicament" fill="var(--chart-3)" />
            {tag && <Scatter dataKey={(d: any) => (d.tagged ? 7.1 : null)} name="tag" fill="var(--foreground)" shape="diamond" />}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <Legend c="var(--chart-2)" l="Symptôme (intensité max)" /><Legend c="var(--chart-5)" l="Repas" />
          <Legend c="var(--chart-1)" l="Activité" /><Legend c="var(--chart-3)" l="Médicament" />
          {tag && <Legend c="var(--foreground)" l="Tag choisi" />}
        </div>
      </Card>
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl bg-card p-4 shadow-sm"><h2 className="mb-3 text-base">{title}</h2>{children}</section>;
}
