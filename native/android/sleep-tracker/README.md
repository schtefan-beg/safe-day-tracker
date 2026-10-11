# SleepTracker (Capacitor plugin, Kotlin)

On-device sleep tracking: accelerometer (20 Hz) + optional per-second microphone RMS. No raw audio is ever stored. TS contract: `src/plugins/sleep-tracker/definitions.ts`.

## Install into the Capacitor Android project
1. `npx cap add android`, then copy `src/main/java/app/rythme/sleep/*.kt` into `android/app/src/main/java/app/rythme/sleep/`.
2. `android/app/build.gradle`:
```gradle
plugins { id 'kotlin-android'; id 'kotlin-kapt' }
dependencies {
  implementation "androidx.room:room-runtime:2.6.1"
  kapt "androidx.room:room-compiler:2.6.1"
  implementation "androidx.core:core-ktx:1.13.1"
}
```
3. Register in `MainActivity`: `registerPlugin(SleepTrackerPlugin::class.java)` before `super.onCreate`.
4. Merge into `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_HEALTH"/>
<uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS" tools:ignore="ProtectedPermissions"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.BODY_SENSORS" android:maxSdkVersion="33"/>
<!-- FGS type "health" on API 34+ requires one of: ACTIVITY_RECOGNITION / BODY_SENSORS / HIGH_SAMPLING_RATE_SENSORS. -->
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION"/>

<application>
  <service android:name="app.rythme.sleep.SleepTrackingService" android:exported="false"
           android:foregroundServiceType="health|microphone"/>
  <receiver android:name="app.rythme.sleep.AlarmReceiver" android:exported="false"/>
  <receiver android:name="app.rythme.sleep.BootReceiver" android:exported="false">
    <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED"/></intent-filter>
  </receiver>
  <activity android:name="app.rythme.sleep.AlarmActivity" android:exported="false"
            android:showWhenLocked="true" android:turnScreenOn="true" android:launchMode="singleInstance"/>
</application>
```

## Play policy notes (verify before publishing)
- FGS type: `microphone` only when mic enabled; otherwise `health` (sleep tracking is an explicitly listed health use). Declare both in the Play Console FGS form with a demo video.
- `USE_FULL_SCREEN_INTENT` is auto-granted only to alarm/calling apps on Android 14+; otherwise the alarm falls back to a heads-up notification + `setAlarmClock` sound — check `NotificationManager.canUseFullScreenIntent()`.
- We never request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; `openBatterySettings()` opens the system list.
- Exact alarms: `SCHEDULE_EXACT_ALARM` (user-granted). Without it the fallback uses `setAndAllowWhileIdle` (may be late) and `canScheduleExactAlarms=false` is surfaced in the UI.

## Algorithm (`ck92-phone-norm-1`)
Cole-Kripke 1992 on 1-min epochs (pairs of 30 s phone epochs), counts normalised to the session 90th percentile, simplified Webster rescoring. Light/deep from percentiles within 90-min windows; REM is a low-confidence heuristic. Calibrate against a reference device before trusting stages.

## Phase 2 — snore / cough detection
- `SoundEventDetector.kt` runs YAMNet (TFLite Task Audio) on each 1 s mic frame (skipped below -55 dBFS to save battery). Labels "Snoring"/"Snort" → snore, "Cough"/"Throat clearing" → cough, score > 0.35, debounced (snore 30 s, cough 3 s). Stored in Room table `sound_event` (DB v2 migration).
- Model: download `yamnet.tflite` (with metadata) from https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite and place it at `android/app/src/main/assets/yamnet.tflite` (~4 MB). Without it, `soundModel=false` and the option is disabled.
- Gradle: `implementation "org.tensorflow:tensorflow-lite-task-audio:0.4.4"` and `android { aaptOptions { noCompress "tflite" } }`.
- Clips (opt-in `saveClips`): 6 s WAV (3 s before/after), max 20 per night, in app-private `filesDir/sleep-clips/<session>/`, excluded from backups — add `android:allowBackup="false"` or a `dataExtractionRules` excluding `sleep-clips`. `getClip` returns base64 for local playback; `deleteClips` wipes them.
- Summary adds `snoreMinutes`, `coughCount`, `clips`, `soundDetection` (model version).
- Extra tests: partner snoring next to the phone (false positives), fan/white noise, battery drain with detection on over 8 h.

## Recovery
State lives in Room. `START_STICKY` restarts the service and resumes the running session. After reboot, `BootReceiver` re-arms the fallback alarm and finalizes the partial session (Android 14 forbids restarting a mic FGS from boot); the gap marks it `partial`.

## Test matrix
| Device | Cases |
|---|---|
| Pixel (Android 14/15) | screen off 8 h, charger / no charger, battery saver, DND (alarm must ring), reboot mid-night |
| Samsung One UI | same + "Put unused apps to sleep" / deep-sleeping apps list |
| Xiaomi MIUI/HyperOS | same + Autostart permission, battery "No restrictions" |
Check for each: epochs without gaps, fallback alarm rings even if the service was killed, smart alarm only inside the window, session appears in the journal after reopening the app.
