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

## Phase 2 (not implemented)
Snore/cough detection with a small TFLite audio classifier (e.g. YAMNet-derived) running on 1 s frames in the service; clips saved locally only with an explicit opt-in.

## Recovery
State lives in Room. `START_STICKY` restarts the service and resumes the running session. After reboot, `BootReceiver` re-arms the fallback alarm and finalizes the partial session (Android 14 forbids restarting a mic FGS from boot); the gap marks it `partial`.

## Test matrix
| Device | Cases |
|---|---|
| Pixel (Android 14/15) | screen off 8 h, charger / no charger, battery saver, DND (alarm must ring), reboot mid-night |
| Samsung One UI | same + "Put unused apps to sleep" / deep-sleeping apps list |
| Xiaomi MIUI/HyperOS | same + Autostart permission, battery "No restrictions" |
Check for each: epochs without gaps, fallback alarm rings even if the service was killed, smart alarm only inside the window, session appears in the journal after reopening the app.
