import { Capacitor, registerPlugin, WebPlugin } from "@capacitor/core";
import type { SleepCapabilities, SleepTrackerPlugin } from "./definitions";

export * from "./definitions";

class SleepTrackerWeb extends WebPlugin {
  private caps(): SleepCapabilities {
    return {
      native: false, accelerometer: false, microphone: false, canScheduleExactAlarms: false,
      ignoringBatteryOptimizations: false, notificationsGranted: false, micPermission: "prompt",
      androidSdk: null, manufacturer: null,
    };
  }
  async getCapabilities() { return this.caps(); }
  async requestPermissions() { return this.caps(); }
  async openBatterySettings() {}
  async openExactAlarmSettings() {}
  async start(): Promise<{ id: string }> { throw this.unavailable("Suivi de nuit disponible uniquement dans l'app Android"); }
  async stop() { return { id: null }; }
  async getStatus() { return { running: false, id: null, startedAt: null, epochs: 0 }; }
  async getPendingSessions() { return { sessions: [] }; }
  async acknowledgeSession() {}
}

export const SleepTracker = registerPlugin<SleepTrackerPlugin>("SleepTracker", {
  web: () => new SleepTrackerWeb() as unknown as SleepTrackerPlugin,
});

export const isNativeSleep = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SleepTracker");
