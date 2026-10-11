package app.rythme.sleep

import android.Manifest
import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.Executors

@CapacitorPlugin(
    name = "SleepTracker",
    permissions = [
        Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO]),
        Permission(alias = "notifications", strings = ["android.permission.POST_NOTIFICATIONS"]),
    ],
)
class SleepTrackerPlugin : Plugin() {
    companion object {
        private var ref: WeakReference<SleepTrackerPlugin>? = null
        fun emitFinished(summary: JSONObject) {
            ref?.get()?.notifyListeners("sessionFinished", JSObject.fromJSONObject(summary), true)
        }
    }
    private val io = Executors.newSingleThreadExecutor()
    private val dao by lazy { SleepDb.get(context).dao() }

    override fun load() { ref = WeakReference(this) }

    private fun caps(): JSObject {
        val ctx = context
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pm = ctx.getSystemService(PowerManager::class.java)
        val sm = ctx.getSystemService(android.hardware.SensorManager::class.java)
        val mic = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        return JSObject().apply {
            put("native", true)
            put("accelerometer", sm.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER) != null)
            put("microphone", ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE))
            put("canScheduleExactAlarms", Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
            put("ignoringBatteryOptimizations", pm.isIgnoringBatteryOptimizations(ctx.packageName))
            put("notificationsGranted", NotificationManagerCompat.from(ctx).areNotificationsEnabled())
            put("micPermission", if (mic) "granted" else if (getPermissionState("microphone") == PermissionState.DENIED) "denied" else "prompt")
            put("androidSdk", Build.VERSION.SDK_INT)
            put("manufacturer", Build.MANUFACTURER)
        }
    }

    @PluginMethod fun getCapabilities(call: PluginCall) = call.resolve(caps())

    @PluginMethod fun requestPermissions(call: PluginCall) {
        val aliases = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) aliases += "notifications"
        if (call.getBoolean("microphone", false) == true) aliases += "microphone"
        if (aliases.isEmpty()) return call.resolve(caps())
        requestPermissionForAliases(aliases.toTypedArray(), call, "permsDone")
    }
    @PermissionCallback private fun permsDone(call: PluginCall) = call.resolve(caps())

    /** Guides the user to settings instead of REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (Play policy). */
    @PluginMethod fun openBatterySettings(call: PluginCall) {
        activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); call.resolve()
    }

    @PluginMethod fun openExactAlarmSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 31) activity.startActivity(
            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName)))
        call.resolve()
    }

    @PluginMethod fun start(call: PluginCall) {
        // Android 14: a mic FGS may only start while an activity is visible — we're called from the WebView UI.
        if (activity == null || !activity.hasWindowFocus()) return call.reject("L'app doit être au premier plan")
        val useMic = call.getBoolean("useMicrophone", false) == true &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val earliest = call.getLong("alarmEarliest"); val latest = call.getLong("alarmLatest")
        io.execute {
            dao.running()?.let { Finalizer.finalize(context, it.id) }
            val s = SessionEntity(UUID.randomUUID().toString(), System.currentTimeMillis(), useMic = useMic,
                alarmEarliest = earliest, alarmLatest = latest, lightEpochs = call.getInt("lightEpochs", 4) ?: 4)
            dao.upsertSession(s)
            if (latest != null) AlarmScheduler.scheduleFallback(context, s.id, latest)
            activity.runOnUiThread {
                ContextCompat.startForegroundService(context,
                    Intent(context, SleepTrackingService::class.java).putExtra(SleepTrackingService.EXTRA_ID, s.id))
                call.resolve(JSObject().put("id", s.id))
            }
        }
    }

    @PluginMethod fun stop(call: PluginCall) {
        io.execute {
            val id = dao.running()?.id
            context.startService(Intent(context, SleepTrackingService::class.java).setAction(SleepTrackingService.ACTION_STOP))
            if (id != null) Finalizer.finalize(context, id)
            call.resolve(JSObject().put("id", id))
        }
    }

    @PluginMethod fun getStatus(call: PluginCall) {
        io.execute {
            val s = dao.running()
            call.resolve(JSObject().put("running", s != null).put("id", s?.id).put("startedAt", s?.startedAt)
                .put("epochs", s?.let { dao.epochCount(it.id) } ?: 0))
        }
    }

    @PluginMethod fun getPendingSessions(call: PluginCall) {
        io.execute {
            val arr = JSONArray()
            dao.pending().forEach { s -> s.summaryJson?.let { arr.put(JSONObject(it)) } }
            call.resolve(JSObject().put("sessions", arr))
        }
    }

    @PluginMethod fun acknowledgeSession(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id requis")
        io.execute { dao.acknowledge(id); dao.purgeAcknowledgedEpochs(); call.resolve() }
    }
}
