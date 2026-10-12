import { Capacitor } from "@capacitor/core";
import { db, getSetting, setSetting } from "./db";

export interface ReminderSettings {
  enabled: boolean;
  sleepTime: string | null; // "08:00"
  psySlots: string[];
  medTime: string | null;
  backupDays: number | null; // rappel in-app tous les N jours (fallback web)
  monthlyExport?: boolean; // notification douce le 1er de chaque mois (Android)
}
export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false, sleepTime: null, psySlots: [], medTime: null, backupDays: 14, monthlyExport: true,
};

const isNative = () => Capacitor.isNativePlatform();
const MONTHLY_EXPORT_ID = 9001;

async function localNotifications() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

async function ensureChannels() {
  const LN = await localNotifications();
  // importance 2 = discret : pas de son ni de vibration.
  await LN.createChannel({ id: "export", name: "Rappel de sauvegarde", importance: 2 });
  await LN.createChannel({ id: "reminders", name: "Rappels", importance: 3 });
}

export async function requestPermission() {
  if (isNative()) {
    const LN = await localNotifications();
    const res = await LN.requestPermissions();
    return (res.display === "granted" ? "granted" : "denied") as NotificationPermission;
  }
  if (!("Notification" in window)) return "unsupported" as const;
  return Notification.requestPermission();
}

async function notify(title: string, body: string) {
  if (isNative()) {
    const LN = await localNotifications();
    if ((await LN.checkPermissions()).display !== "granted") return;
    await ensureChannels();
    await LN.schedule({
      notifications: [{ id: Math.floor(Date.now() / 1000) % 2000000000, title, body, channelId: "reminders" }],
    });
    return;
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/icon-192.png" });
}

// Notification mensuelle (le 1er à 10h) pour penser à exporter ses données.
// Planifiée par Android lui-même : fonctionne app fermée, sans serveur.
export async function syncMonthlyExportReminder() {
  if (!isNative()) return;
  const r = { ...DEFAULT_REMINDERS, ...(await getSetting<ReminderSettings>("reminders", DEFAULT_REMINDERS)) };
  const LN = await localNotifications();
  await LN.cancel({ notifications: [{ id: MONTHLY_EXPORT_ID }] });
  if (!r.monthlyExport) return;

  let perm = (await LN.checkPermissions()).display;
  if (perm === "prompt" || perm === "prompt-with-rationale") {
    const asked = await getSetting<boolean>("notifPermissionAsked", false);
    if (asked) return;
    await setSetting("notifPermissionAsked", true);
    perm = (await LN.requestPermissions()).display;
  }
  if (perm !== "granted") return;

  await ensureChannels();
  await LN.schedule({
    notifications: [{
      id: MONTHLY_EXPORT_ID,
      title: "Une petite sauvegarde ?",
      body: "Tes données restent sur ce téléphone. Pense à exporter une copie ce mois-ci.",
      channelId: "export",
      schedule: { on: { day: 1, hour: 10, minute: 0 }, allowWhileIdle: false },
    }],
  });
}

let monthlySynced = false;

// Vérifie les rappels quand l'app est ouverte ou reprise.
export async function checkReminders() {
  if (!monthlySynced) {
    monthlySynced = true;
    syncMonthlyExportReminder().catch((e) => console.warn("monthly reminder", e));
  }
  const r = { ...DEFAULT_REMINDERS, ...(await getSetting<ReminderSettings>("reminders", DEFAULT_REMINDERS)) };
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
  // Sur Android, le rappel mensuel natif remplace le rappel in-app.
  if (r.backupDays && !(isNative() && r.monthlyExport)) {
    const last = await getSetting<number>("lastExport", 0);
    if (Date.now() - last > r.backupDays * 86400000 && fired["backup"] !== today) {
      fired["backup"] = today;
      await notify("Sauvegarde", "Pense à exporter une sauvegarde de tes données.");
    }
  }
  await setSetting("remindersFired", fired);
}
