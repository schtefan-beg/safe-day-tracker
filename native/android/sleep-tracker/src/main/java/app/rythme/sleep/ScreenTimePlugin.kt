package app.rythme.sleep

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import java.util.concurrent.Executors

/**
 * Reads Android's own screen-time statistics (UsageStatsManager) on the device.
 * Requires the user to grant "Accès aux données d'utilisation" in system settings.
 * Nothing is sent anywhere: results are returned to the WebView and stored in IndexedDB.
 */
@CapacitorPlugin(name = "ScreenTime")
class ScreenTimePlugin : Plugin() {
    private val io = Executors.newSingleThreadExecutor()

    private fun granted(): Boolean {
        val ops = context.getSystemService(AppOpsManager::class.java)
        val mode = if (Build.VERSION.SDK_INT >= 29)
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        else @Suppress("DEPRECATION") ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    @PluginMethod fun getStatus(call: PluginCall) = call.resolve(JSObject().put("native", true).put("granted", granted()))

    @PluginMethod fun openUsageSettings(call: PluginCall) {
        activity.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); call.resolve()
    }

    /** Foreground time per app between from/to (epoch ms), computed from resume/pause events. */
    @PluginMethod fun getUsage(call: PluginCall) {
        if (!granted()) return call.reject("Accès aux données d'utilisation non autorisé")
        val from = call.getLong("from") ?: return call.reject("from requis")
        val to = call.getLong("to") ?: System.currentTimeMillis()
        io.execute {
            val usm = context.getSystemService(UsageStatsManager::class.java)
            val ev = usm.queryEvents(from, to)
            val e = UsageEvents.Event()
            val open = HashMap<String, Long>()
            val total = HashMap<String, Long>()
            while (ev.hasNextEvent()) {
                ev.getNextEvent(e)
                when (e.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED -> open[e.packageName] = e.timeStamp
                    UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED ->
                        open.remove(e.packageName)?.let { total[e.packageName] = (total[e.packageName] ?: 0) + (e.timeStamp - it) }
                    UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
                        open.forEach { (p, t) -> total[p] = (total[p] ?: 0) + (e.timeStamp - t) }; open.clear()
                    }
                }
            }
            val end = minOf(to, System.currentTimeMillis())
            open.forEach { (p, t) -> total[p] = (total[p] ?: 0) + (end - t) }
            val pm = context.packageManager
            val arr = JSONArray()
            total.filter { it.value >= 60_000 && it.key != context.packageName }.forEach { (pkg, ms) ->
                val info = try { pm.getApplicationInfo(pkg, 0) } catch (_: Exception) { null }
                if (info != null && pm.getLaunchIntentForPackage(pkg) == null) return@forEach // skip launcher/system UI
                val cat = if (info != null && Build.VERSION.SDK_INT >= 26) when (info.category) {
                    ApplicationInfo.CATEGORY_GAME -> "game"
                    ApplicationInfo.CATEGORY_VIDEO -> "video"
                    ApplicationInfo.CATEGORY_SOCIAL -> "social"
                    ApplicationInfo.CATEGORY_PRODUCTIVITY -> "productivity"
                    ApplicationInfo.CATEGORY_NEWS -> "news"
                    ApplicationInfo.CATEGORY_AUDIO -> "audio"
                    else -> "other"
                } else "other"
                arr.put(JSObject().put("packageName", pkg)
                    .put("label", info?.let { pm.getApplicationLabel(it).toString() } ?: pkg)
                    .put("category", cat).put("minutes", ms / 60_000.0))
            }
            call.resolve(JSObject().put("apps", arr))
        }
    }
}
