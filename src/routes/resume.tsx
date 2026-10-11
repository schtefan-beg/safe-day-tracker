import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { buildSummary, lagLabel } from "@/lib/analysis";
import { eventTitle, fmtDur } from "@/lib/db";
import { shareOrDownload, summaryPDF } from "@/lib/export";
import { PeriodPicker } from "@/components/app/PeriodPicker";

export const Route = createFileRoute("/resume")({
  head: () => ({
    meta: [
      { title: "Résumé pour séance — Rythme" },
      { name: "description", content: "Résumé de 4 semaines à partager avec un·e psychologue, généré sur ton téléphone." },
      { property: "og:title", content: "Résumé pour séance — Rythme" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Un résumé clair et factuel pour ta prochaine séance." },
    ],
  }),
  component: Resume,
});

const f1 = (n: number | null) => (n == null ? "–" : n.toFixed(1).replace(".", ","));

function Resume() {
  const [days, setDays] = useState(28);
  const [includeText, setIncludeText] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const s = useLiveQuery(() => buildSummary(days), [days]);

  useEffect(() => { if (s) setSelected(new Set(s.checkins.map((c) => c.id))); }, [s?.generated]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportPdf = async () => {
    if (!s) return;
    const blob = summaryPDF(s, { includeText, selectedIds: selected });
    await shareOrDownload(blob, `resume-seance-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF prêt");
  };

  if (!s) return <div className="p-6 text-sm text-muted-foreground">Préparation…</div>;
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-5 px-4 pt-6">
      <h1 className="text-3xl">Résumé pour séance</h1>
      <PeriodPicker value={days} onChange={setDays} options={[14, 28, 56]} />
      <label className="flex items-center justify-between rounded-2xl bg-card p-4 text-sm shadow-sm">
        Inclure les détails textuels
        <input type="checkbox" className="h-5 w-5" checked={includeText} onChange={(e) => setIncludeText(e.target.checked)} />
      </label>

      <article className="space-y-5 rounded-2xl bg-card p-5 shadow-sm">
        <p className="text-xs text-muted-foreground">
          Du {format(s.from, "dd/MM/yyyy")} au {format(s.to, "dd/MM/yyyy")} · généré le {format(s.generated, "dd/MM/yyyy HH:mm")}
        </p>
        <Section title="État psychologique">
          <div className="grid grid-cols-2 gap-2">
            {s.psy.map((k) => (
              <div key={k.key} className="rounded-xl bg-muted p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="font-display text-xl">{f1(k.avg)}<span className="text-sm">/10</span></div>
                <div className="text-[11px] text-muted-foreground">{f1(k.firstHalf)} → {f1(k.secondHalf)} · {k.n} relevés</div>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={s.series}>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 10]} hide />
              <Line dataKey="humeur" stroke="var(--chart-1)" dot={false} connectNulls strokeWidth={2} />
              <Line dataKey="stress" stroke="var(--chart-2)" dot={false} connectNulls strokeWidth={2} />
              <Line dataKey="anxiété" stroke="var(--chart-3)" dot={false} connectNulls strokeWidth={2} />
              <Line dataKey="énergie" stroke="var(--chart-4)" dot={false} connectNulls strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Sommeil">
          <p className="text-sm">{s.sleep.nights} nuits · moyenne {fmtDur(s.sleep.avgMin)} · qualité {f1(s.sleep.avgQuality)}/10 · {s.sleep.under6} nuit(s) &lt; 6 h</p>
        </Section>
        <Section title="Digestion">
          <p className="text-sm">{s.digestion.count} symptôme(s), intensité moyenne {f1(s.digestion.avgIntensity)}/10{s.digestion.top.length ? " · " + s.digestion.top.map(([k, v]) => `${k} (${v})`).join(", ") : ""}</p>
        </Section>
        <Section title="Médicaments et substances">
          <p className="text-sm">{s.meds.length ? s.meds.map((m) => `${m.name} : ${m.count}×`).join(" · ") : "Aucun relevé."}</p>
        </Section>
        <Section title="Événements marquants">
          {s.notable.length === 0 && <p className="text-sm text-muted-foreground">Aucune valeur extrême.</p>}
          <ul className="space-y-1.5 text-sm">
            {s.notable.map((e) => (
              <li key={e.id}><span className="tabular-nums text-muted-foreground">{format(e.timestamp, "dd/MM HH:mm")}</span> — {eventTitle(e)}{includeText && e.note ? <em className="block text-muted-foreground">« {e.note} »</em> : null}</li>
            ))}
          </ul>
        </Section>
        {s.pistes.length > 0 && (
          <Section title="Pistes à explorer">
            <ul className="space-y-1 text-sm">
              {s.pistes.map((p) => <li key={p.factor + p.impact}>{p.factor} → {p.impact} en {p.direction} ({lagLabel(p.lag)})</li>)}
            </ul>
          </Section>
        )}
        {includeText && (
          <Section title="Check-ins détaillés à inclure">
            {s.allCheckinsWithNote.length === 0 && <p className="text-sm text-muted-foreground">Aucun check-in avec détail.</p>}
            <div className="space-y-2">
              {s.allCheckinsWithNote.map((e) => (
                <label key={e.id} className="flex gap-3 rounded-xl bg-muted p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  <span><span className="text-xs text-muted-foreground">{format(e.timestamp, "dd/MM HH:mm")} · {eventTitle(e)}</span><span className="block">{e.note}</span></span>
                </label>
              ))}
            </div>
          </Section>
        )}
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Relevé personnel exploratoire. Il ne constitue pas un diagnostic médical ou psychologique.
        </p>
      </article>

      <button onClick={exportPdf} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground">
        <Share2 className="h-5 w-5" /> Exporter / partager en PDF
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="text-lg">{title}</h2>{children}</section>;
}
