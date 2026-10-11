import { db, getSetting, setSetting } from "./db";

export interface ReminderSettings {
  enabled: boolean;
  sleepTime: string | null; // "08:00"
  psySlots: string[];
  medTime: string | null;
  backupDays: number | null; // remind every N days
}
export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false, sleepTime: null, psySlots: [], medTime: null, backupDays: 14,
};

export async function requestPermission() {
  if (!("Notification" in window)) return "unsupported" as const;
  return Notification.requestPermission();
}

async function notify(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: "/icon-192.png", tag: title });
  else new Notification(title, { body, icon: "/icon-192.png" });
}

// Checks reminders while the app is open or resumed (no push server: data stays local).
export async function checkReminders() {
  const r = await getSetting<ReminderSettings>("reminders", DEFAULT_REMINDERS);
  if (!r.enabled) return;
  const fired = await getSetting<Record<string, string>>("remindersFired", {});
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hm = now.toTimeString().slice(0, 5);
  const due = async (key: string, time: string | null, title: string, body: string) => {
    if (!time || hm < time || fired[key] === today) return;
    fired[key] = today;
    await notify(title, body);
  };
  await due("sleep", r.sleepTime, "Sommeil", "Comment as-tu dormi ? Note ta nuit en quelques secondes.");
  for (const s of r.psySlots) await due("psy-" + s, s, "Check-in", "Un petit point sur ton humeur et ton stress ?");
  if (r.medTime) {
    const hasRecurring = (await db().events.where("type").equals("medication").toArray()).some((e) => {
      try { return JSON.parse(e.payload_json).recurring; } catch { return false; }
    });
    if (hasRecurring) await due("med", r.medTime, "Traitement", "Pense à ta prise habituelle.");
  }
  if (r.backupDays) {
    const last = await getSetting<number>("lastExport", 0);
    if (Date.now() - last > r.backupDays * 86400000 && fired["backup"] !== today) {
      fired["backup"] = today;
      await notify("Sauvegarde", "Pense à exporter une sauvegarde de tes données.");
    }
  }
  await setSetting("remindersFired", fired);
}
