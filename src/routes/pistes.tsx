import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Info } from "lucide-react";
import { computePistes, lagLabel, MIN_OCC } from "@/lib/analysis";
import { PeriodPicker } from "@/components/app/PeriodPicker";

export const Route = createFileRoute("/pistes")({
  head: () => ({
    meta: [
      { title: "Pistes — Rythme" },
      { name: "description", content: "Associations exploratoires entre ton quotidien, ta digestion et ton état psychologique." },
      { property: "og:title", content: "Pistes — Rythme" },
      { property: "og:description", content: "Des associations à explorer, sans conclusion médicale." },
    ],
  }),
  component: Pistes,
});

const f1 = (n: number) => n.toFixed(1).replace(".", ",");

function Pistes() {
  const [days, setDays] = useState(28);
  const res = useLiveQuery(() => computePistes(days), [days]);
  return (
    <div className="space-y-5 px-4 pt-6">
      <h1 className="text-3xl">Pistes</h1>
      <PeriodPicker value={days} onChange={setDays} />
      <div className="flex gap-2 rounded-2xl bg-secondary p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Une association observée ne prouve pas une causalité. Ce sont des pistes à explorer, éventuellement avec un·e professionnel·le.</p>
      </div>
      {res && res.pistes.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Pas encore assez de données. Une piste apparaît quand un facteur est observé au moins {MIN_OCC} fois et comparé à au moins {MIN_OCC} jours sans ce facteur, avec un écart d'au moins 1 point.
        </p>
      )}
      <div className="space-y-3">
        {res?.pistes.map((p) => (
          <article key={p.factor + p.impact} className="space-y-2 rounded-2xl bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">Observé sur {days} jours · {lagLabel(p.lag)}</div>
            <h2 className="text-base leading-snug">
              {p.factor} <span className="text-muted-foreground">est associé à</span> {p.direction === "hausse" ? "plus" : "moins"} de {p.impact}
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-muted p-2"><div className="font-display text-xl">{f1(p.withMean)}</div><div className="text-xs text-muted-foreground">avec le facteur ({p.occurrences} jours)</div></div>
              <div className="rounded-xl bg-muted p-2"><div className="font-display text-xl">{f1(p.withoutMean)}</div><div className="text-xs text-muted-foreground">sans ({p.withoutDays} jours)</div></div>
            </div>
            <p className="text-xs text-muted-foreground">À explorer : écart de {f1(Math.abs(p.diff))} point(s) sur 10.</p>
          </article>
        ))}
      </div>
    </div>
  );
}
