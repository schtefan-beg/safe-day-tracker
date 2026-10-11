import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Moon, Square } from "lucide-react";
import { SleepTracker, isNativeSleep, type SleepCapabilities } from "@/plugins/sleep-tracker";
import { importSession, syncPendingSleep } from "@/lib/sleep-sync";

const input = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function nextAt(hm: string) {
  const [h = 7, m = 0] = hm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function SleepTrackerCard() {
  const native = isNativeSleep();
  const [caps, setCaps] = useState<SleepCapabilities | null>(null);
  const [running, setRunning] = useState(false);
  const [mic, setMic] = useState(false);
  const [alarm, setAlarm] = useState(true);
  const [latest, setLatest] = useState("07:30");
  const [win, setWin] = useState(30);

  useEffect(() => {
    if (!native) return;
    SleepTracker.getCapabilities().then(setCaps);
    SleepTracker.getStatus().then((s) => setRunning(s.running));
    syncPendingSleep().then((n) => n && toast.success(`${n} nuit(s) importée(s)`));
    const h = SleepTracker.addListener("sessionFinished", async (s) => {
      await importSession(s);
      setRunning(false);
      toast.success("Nuit enregistrée dans ton journal");
    });
    return () => { h.then((x) => x.remove()); };
  }, [native]);

  if (!native) {
    return (
      <p className="text-sm text-muted-foreground">
        Le suivi automatique (mouvements et bruit, analysés sur le téléphone) est disponible dans l'app Android installée.
      </p>
    );
  }

  const start = async () => {
    const c = await SleepTracker.requestPermissions({ microphone: mic });
    setCaps(c);
    if (mic && c.micPermission !== "granted") return void toast.error("Micro refusé — suivi par mouvements seulement possible");
    const l = nextAt(latest);
    try {
      await SleepTracker.start({ useMicrophone: mic, ...(alarm ? { alarmLatest: l, alarmEarliest: l - win * 60000 } : {}) });
      setRunning(true);
      toast.success("Bonne nuit ! Pose le téléphone sur le matelas.");
    } catch (e) { toast.error((e as Error).message); }
  };
  const stop = async () => { await SleepTracker.stop(); setRunning(false); };

  return (
    <div className="space-y-3 text-sm">
      {running ? (
        <button onClick={stop} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground"><Square className="h-4 w-4" /> Je suis réveillé·e</button>
      ) : (
        <>
          <label className="flex items-center justify-between">Utiliser le micro (niveau sonore seulement)
            <input type="checkbox" className="h-5 w-5" checked={mic} onChange={(e) => setMic(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between">Réveil intelligent
            <input type="checkbox" className="h-5 w-5" checked={alarm} onChange={(e) => setAlarm(e.target.checked)} />
          </label>
          {alarm && (
            <div className="grid grid-cols-2 gap-2">
              <label>Au plus tard<input type="time" className={input} value={latest} onChange={(e) => setLatest(e.target.value)} /></label>
              <label>Fenêtre (min)<input inputMode="numeric" className={input} value={win} onChange={(e) => setWin(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} /></label>
            </div>
          )}
          <button onClick={start} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground"><Moon className="h-4 w-4" /> Commencer la nuit</button>
        </>
      )}
      {caps && !caps.canScheduleExactAlarms && (
        <button onClick={() => SleepTracker.openExactAlarmSettings()} className="w-full rounded-xl border border-border py-2">Autoriser les alarmes exactes</button>
      )}
      {caps && !caps.ignoringBatteryOptimizations && (
        <button onClick={() => SleepTracker.openBatterySettings()} className="w-full rounded-xl border border-border py-2">Désactiver l'optimisation de batterie pour Rythme</button>
      )}
      <p className="text-xs text-muted-foreground">Aucun son n'est enregistré : seul un niveau sonore par seconde est calculé, et tout reste sur le téléphone. Les phases (léger/profond/paradoxal) sont des estimations.</p>
    </div>
  );
}
