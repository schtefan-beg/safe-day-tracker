import { Capacitor, registerPlugin, WebPlugin } from "@capacitor/core";

/** Contract of the Kotlin ScreenTime plugin (native/android/sleep-tracker/.../ScreenTimePlugin.kt). */
export type AppCategory = "game" | "video" | "social" | "productivity" | "news" | "audio" | "other";
export interface AppUsage { packageName: string; label: string; category: AppCategory; minutes: number }
export interface ScreenTimePlugin {
  getStatus(): Promise<{ native: boolean; granted: boolean }>;
  openUsageSettings(): Promise<void>;
  getUsage(opts: { from: number; to: number }): Promise<{ apps: AppUsage[] }>;
}

class ScreenTimeWeb extends WebPlugin {
  async getStatus() { return { native: false, granted: false }; }
  async openUsageSettings() {}
  async getUsage(): Promise<{ apps: AppUsage[] }> { throw this.unavailable("Disponible uniquement dans l'app Android"); }
}

export const ScreenTime = registerPlugin<ScreenTimePlugin>("ScreenTime", {
  web: () => new ScreenTimeWeb() as unknown as ScreenTimePlugin,
});
export const isNativeScreenTime = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("ScreenTime");
