import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScreenTime, isNativeScreenTime } from "@/plugins/screen-time";
import { importScreenDay } from "@/lib/screen-sync";
import { fmtDur } from "@/lib/db";

export function ScreenTimeCard() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const native = isNativeScreenTime();
  const refresh = () => ScreenTime.getStatus().then((s) => setGranted(s.granted)).catch(() => setGranted(false));
  useEffect(() => {
    if (!native) return;
    refresh();
    const f = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [native]);

  const run = async (offset: number) => {
    try {
      const d = new Date(); d.setDate(d.getDate() - offset);
      const min = await importScreenDay(d);
      toast.success(`Temps d'écran importé : ${fmtDur(min)}`);
    } catch (e: any) { toast.error(e?.message ?? "Import impossible"); }
  };

  if (!native) return (
    <p className="text-sm text-muted-foreground">
      L'import automatique fonctionne dans l'app Android. Ici, ajoute ton temps d'écran à la main avec « Écran » (travail, jeux vidéo, vidéos…).
    </p>
  );
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">Lit le temps passé par application, calculé par Android. Rien ne quitte le téléphone.</p>
      {!granted ? (
        <button className="h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground" onClick={() => ScreenTime.openUsageSettings()}>
          Autoriser l'accès aux données d'utilisation
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="h-11 rounded-xl bg-primary font-bold text-primary-foreground" onClick={() => run(0)}>Importer aujourd'hui</button>
          <button className="h-11 rounded-xl border border-border bg-card font-bold" onClick={() => run(1)}>Importer hier</button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Le travail sur ordinateur, la console ou la TV s'ajoutent à la main via « Écran ».</p>
    </div>
  );
}
