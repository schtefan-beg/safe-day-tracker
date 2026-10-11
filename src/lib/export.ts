import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { db, hydrate, recomputeAll, setSetting, TYPE_LABEL, fmtDur, type EventRow, type EventTagRow, type TagRow } from "./db";
import { lagLabel, type Summary } from "./analysis";

export const BACKUP_VERSION = 1;

export interface Backup {
  app: "rythme";
  version: number;
  exported_at: string;
  events: EventRow[];
  tags: TagRow[];
  event_tags: EventTagRow[];
  settings: { key: string; value: unknown }[];
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportJSON() {
  const d = db();
  const settings = (await d.settings.toArray()).filter((s) => s.key !== "pin");
  const backup: Backup = {
    app: "rythme", version: BACKUP_VERSION, exported_at: new Date().toISOString(),
    events: await d.events.toArray(), tags: await d.tags.toArray(),
    event_tags: await d.event_tags.toArray(), settings,
  };
  await shareOrDownload(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    `rythme-sauvegarde-${format(new Date(), "yyyy-MM-dd")}.json`,
  );
  await setSetting("lastExport", Date.now());
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCSV() {
  const rows = await hydrate(await db().events.orderBy("timestamp").toArray());
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r.payload ?? {}).forEach((k) => keys.add(k)));
  const pk = [...keys];
  const header = ["date", "heure", "type", ...pk, "tags", "note"];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        format(r.timestamp, "yyyy-MM-dd"), format(r.timestamp, "HH:mm"), TYPE_LABEL[r.type],
        ...pk.map((k) => r.payload?.[k]), r.tags.map((t) => t.name).join(", "), r.note,
      ].map(csvCell).join(";"),
    );
  }
  await shareOrDownload(
    new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `rythme-export-${format(new Date(), "yyyy-MM-dd")}.csv`,
  );
  await setSetting("lastExport", Date.now());
}

export async function parseBackup(file: File) {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== "rythme" || typeof data.version !== "number") throw new Error("Fichier non reconnu");
  if (data.version > BACKUP_VERSION) throw new Error("Version de sauvegarde plus récente que l'application");
  const existing = await db().events.toArray();
  const ids = new Set(existing.map((e) => e.id));
  const sig = new Set(existing.map((e) => e.type + e.timestamp));
  const duplicates = data.events.filter((e) => ids.has(e.id) || sig.has(e.type + e.timestamp)).length;
  return { data, count: data.events.length, duplicates };
}

export async function applyBackup(data: Backup, mode: "merge" | "replace") {
  const d = db();
  await d.transaction("rw", [d.events, d.tags, d.event_tags, d.settings], async () => {
    if (mode === "replace") {
      await Promise.all([d.events.clear(), d.tags.clear(), d.event_tags.clear()]);
    }
    // map tags by name to avoid unique conflicts
    const tagIdMap = new Map<string, string>();
    for (const t of data.tags) {
      const ex = await d.tags.where("name").equals(t.name).first();
      if (ex) tagIdMap.set(t.id, ex.id);
      else { await d.tags.add(t); tagIdMap.set(t.id, t.id); }
    }
    await d.events.bulkPut(data.events);
    await d.event_tags.bulkPut(
      data.event_tags.map((l) => ({ event_id: l.event_id, tag_id: tagIdMap.get(l.tag_id) ?? l.tag_id })),
    );
    for (const s of data.settings ?? []) if (s.key !== "pin") await d.settings.put(s);
    for (const t of await d.tags.toArray())
      await d.tags.update(t.id, { usage_count: await d.event_tags.where("tag_id").equals(t.id).count() });
  });
  await recomputeAll();
}

const f1 = (n: number | null) => (n == null ? "–" : n.toFixed(1).replace(".", ","));
const clean = (s: string) => s.replace(/[≤≥]/g, (c) => (c === "≤" ? "<=" : ">=")).replace(/[^\x00-\xFF€«»’–—…]/g, "");

export function summaryPDF(s: Summary, opts: { includeText: boolean; selectedIds: Set<string> }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16;
  let y = 18;
  const ensure = (h: number) => { if (y + h > 280) { doc.addPage(); y = 18; } };
  const h1 = (t: string) => { ensure(12); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(clean(t), M, y); y += 7; };
  const p = (t: string, size = 10) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(t), W - 2 * M);
    ensure(lines.length * 5);
    doc.text(lines, M, y); y += lines.length * 5;
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Résumé pour séance", M, y); y += 7;
  p(`Période : ${format(s.from, "dd/MM/yyyy")} – ${format(s.to, "dd/MM/yyyy")} (${s.days} jours) · généré le ${format(s.generated, "dd/MM/yyyy à HH:mm")}`, 9);
  y += 3;

  h1("État psychologique");
  for (const k of s.psy) {
    const ev = k.firstHalf != null && k.secondHalf != null ? ` · 1re moitié ${f1(k.firstHalf)} → 2e moitié ${f1(k.secondHalf)}` : "";
    p(`${k.label} : moyenne ${f1(k.avg)}/10 (${k.n} relevés)${ev}`);
  }
  // chart
  ensure(52);
  const cx = M, cy = y + 2, cw = W - 2 * M, ch = 40;
  doc.setDrawColor(200); doc.rect(cx, cy, cw, ch);
  const colors: Record<string, [number, number, number]> = {
    humeur: [70, 130, 90], stress: [200, 90, 60], "anxiété": [150, 90, 170], "énergie": [60, 120, 190],
  };
  const n = s.series.length;
  (Object.keys(colors) as (keyof typeof colors)[]).forEach((key, i) => {
    const color = colors[key];
    if (!color) return;
    doc.setDrawColor(...color); doc.setLineWidth(0.5);
    let prev: [number, number] | null = null;
    s.series.forEach((pt, j) => {
      const v = (pt as any)[key] as number | null;
      if (v == null) { return; }
      const x = cx + (n <= 1 ? cw / 2 : (j / (n - 1)) * cw), yy = cy + ch - (v / 10) * ch;
      if (prev) doc.line(prev[0], prev[1], x, yy);
      doc.circle(x, yy, 0.6, "F");
      prev = [x, yy];
    });
    doc.setFontSize(8); doc.setTextColor(...color);
    doc.text(clean(key), cx + i * 30, cy + ch + 5);
  });
  doc.setTextColor(0); doc.setLineWidth(0.2);
  y = cy + ch + 10;

  h1("Sommeil");
  p(`${s.sleep.nights} nuits saisies · durée moyenne ${fmtDur(s.sleep.avgMin)} · qualité moyenne ${f1(s.sleep.avgQuality)}/10 · ${s.sleep.under6} nuit(s) de moins de 6 h`);
  y += 2;
  h1("Digestion");
  p(`${s.digestion.count} symptôme(s) relevé(s), intensité moyenne ${f1(s.digestion.avgIntensity)}/10. ${s.digestion.top.map(([k, v]) => `${k} (${v})`).join(", ")}`);
  y += 2;
  h1("Médicaments et substances");
  p(s.meds.length ? s.meds.map((m) => `${m.name} : ${m.count} prise(s)`).join(" · ") : "Aucun relevé.");
  y += 2;
  h1("Événements marquants");
  if (!s.notable.length) p("Aucune valeur extrême relevée.");
  for (const e of s.notable) {
    const title = notableLine(e);
    p(`• ${format(e.timestamp, "dd/MM HH:mm")} — ${title}${opts.includeText && e.note ? ` — « ${e.note} »` : ""}`);
  }
  y += 2;
  if (s.pistes.length) {
    h1("Pistes à explorer (associations, pas de causalité)");
    for (const pi of s.pistes)
      p(`• ${pi.factor} → ${pi.impact} en ${pi.direction} (${lagLabel(pi.lag)}) : ${f1(pi.withMean)} vs ${f1(pi.withoutMean)}, ${pi.occurrences} occurrences`);
    y += 2;
  }
  if (opts.includeText) {
    const sel = s.allCheckinsWithNote.filter((e) => opts.selectedIds.has(e.id));
    if (sel.length) {
      h1("Check-ins détaillés");
      for (const e of sel) p(`${format(e.timestamp, "dd/MM HH:mm")} — ${notableLine(e)}\n« ${e.note} »`);
    }
  }
  y += 4;
  p("Relevé personnel exploratoire. Il ne constitue pas un diagnostic médical ou psychologique.", 9);
  return doc.output("blob");
}

function notableLine(e: { type: string; payload: any }) {
  const pl = e.payload;
  if (e.type === "psy")
    return [pl.mood != null && `humeur ${pl.mood}`, pl.stress != null && `stress ${pl.stress}`, pl.anxiety != null && `anxiété ${pl.anxiety}`, pl.energy != null && `énergie ${pl.energy}`].filter(Boolean).join(", ") || "check-in";
  if (e.type === "symptom_physical") return `${pl.symptom} ${pl.intensity}/10`;
  if (e.type === "sleep") return `sommeil ${fmtDur(pl.duration_min)}, qualité ${pl.quality}/10`;
  return e.type;
}
