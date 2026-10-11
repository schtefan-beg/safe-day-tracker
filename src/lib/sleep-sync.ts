import { getSetting, saveEvent, setSetting } from "./db";
import { SleepTracker, type SleepSession } from "@/plugins/sleep-tracker";

/** Turns a finished native session into a local sleep event, then acknowledges it. Idempotent. */
export async function importSession(s: SleepSession) {
  const done = await getSetting<string[]>("sleepImported", []);
  if (!done.includes(s.id)) {
    const hm = (t: number) => new Date(t).toTimeString().slice(0, 5);
    await saveEvent({
      type: "sleep",
      timestamp: s.endedAt,
      payload: {
        duration_min: Math.round(s.asleepMin),
        quality: Math.max(0, Math.min(10, Math.round(s.efficiency * 10))),
        bedtime: hm(s.startedAt),
        wakeup: hm(s.endedAt),
        awakenings: s.awakenings,
        tracker: s,
      },
      note: [
        `Suivi automatique (${s.algoVersion}) · fiabilité ${s.quality}`,
        s.soundDetection ? `ronflements ~${Math.round(s.snoreMinutes ?? 0)} min · toux ${s.coughCount ?? 0}` : "",
      ].filter(Boolean).join(" · "),
      tagIds: [],
    });
    await setSetting("sleepImported", [...done, s.id].slice(-200));
  }
  await SleepTracker.acknowledgeSession({ id: s.id });
}

export async function syncPendingSleep() {
  const { sessions } = await SleepTracker.getPendingSessions();
  for (const s of sessions) await importSession(s);
  return sessions.length;
}
