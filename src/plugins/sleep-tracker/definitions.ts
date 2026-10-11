import type { PluginListenerHandle } from "@capacitor/core";

/** Contract shared by the Kotlin plugin (native/android/sleep-tracker) and the web fallback. */
export interface SleepCapabilities {
  native: boolean;
  accelerometer: boolean;
  microphone: boolean;
  canScheduleExactAlarms: boolean;
  ignoringBatteryOptimizations: boolean;
  notificationsGranted: boolean;
  micPermission: "granted" | "denied" | "prompt";
  androidSdk: number | null;
  manufacturer: string | null;
}

export interface StartOptions {
  useMicrophone: boolean;
  /** Smart alarm window, epoch ms. Omit both for no alarm. */
  alarmEarliest?: number;
  alarmLatest?: number;
  /** Number of consecutive light-sleep epochs required to fire early (default 4 = 2 min). */
  lightEpochs?: number;
}

export type Stage = "wake" | "light" | "deep" | "rem";

export interface SleepEventMark {
  t: number;
  kind: "awakening" | "noise" | "snore" | "cough" | "phone_moved";
}

export interface SleepSession {
  id: string;
  algoVersion: string;
  startedAt: number;
  endedAt: number;
  usedMicrophone: boolean;
  asleepMin: number;
  onsetLatencyMin: number;
  awakenings: number;
  efficiency: number; // 0..1
  /** One stage per 5-min bucket from startedAt. REM is low confidence. */
  hypnogram: Stage[];
  events: SleepEventMark[];
  quality: "good" | "partial" | "poor";
  qualityReasons: string[];
  smartAlarmFiredAt: number | null;
  avgNoiseDb: number | null;
}

export interface SleepTrackerPlugin {
  getCapabilities(): Promise<SleepCapabilities>;
  requestPermissions(opts: { microphone: boolean }): Promise<SleepCapabilities>;
  openBatterySettings(): Promise<void>;
  openExactAlarmSettings(): Promise<void>;
  start(opts: StartOptions): Promise<{ id: string }>;
  stop(): Promise<{ id: string | null }>;
  getStatus(): Promise<{ running: boolean; id: string | null; startedAt: number | null; epochs: number }>;
  getPendingSessions(): Promise<{ sessions: SleepSession[] }>;
  acknowledgeSession(opts: { id: string }): Promise<void>;
  addListener(event: "sessionFinished", fn: (s: SleepSession) => void): Promise<PluginListenerHandle>;
}
