package app.rythme.sleep

import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

object AlarmScheduler {
    private const val CH = "sleep_alarm"
    private const val NOTIF = 4202

    private fun pi(ctx: Context, id: String, flags: Int = PendingIntent.FLAG_UPDATE_CURRENT) =
        PendingIntent.getBroadcast(ctx, id.hashCode(),
            Intent(ctx, AlarmReceiver::class.java).putExtra("id", id), flags or PendingIntent.FLAG_IMMUTABLE)

    /** Guaranteed fallback, independent of the service. */
    fun scheduleFallback(ctx: Context, id: String, at: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        val show = PendingIntent.getActivity(ctx, 0, Intent(ctx, AlarmActivity::class.java).putExtra("id", id), PendingIntent.FLAG_IMMUTABLE)
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(ctx, id)) // degraded, flagged in caps
        } else am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi(ctx, id))
    }

    fun cancel(ctx: Context, id: String) {
        ctx.getSystemService(AlarmManager::class.java).cancel(pi(ctx, id))
    }

    fun ring(ctx: Context, id: String, smart: Boolean) {
        cancel(ctx, id)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH, "Réveil", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null, null); setBypassDnd(true)
        })
        val full = PendingIntent.getActivity(ctx, 2,
            Intent(ctx, AlarmActivity::class.java).putExtra("id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, CH)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(if (smart) "Bonjour ! Tu es en sommeil léger" else "C'est l'heure !")
            .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(full, true).setOngoing(true).build()
        nm.notify(NOTIF, n)
    }

    fun dismissNotif(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).cancel(NOTIF)
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        AlarmScheduler.ring(ctx, intent.getStringExtra("id") ?: return, smart = false)
    }
}

/** Re-arms the fallback alarm and finalizes stale sessions after reboot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val pending = goAsync()
        Executors.newSingleThreadExecutor().execute {
            try {
                val dao = SleepDb.get(ctx).dao()
                val s = dao.running() ?: return@execute
                val latest = s.alarmLatest
                if (latest != null && latest > System.currentTimeMillis()) AlarmScheduler.scheduleFallback(ctx, s.id, latest)
                // Android 14 forbids starting a mic FGS from boot; finalize what we have, the night is marked partial (gap).
                Finalizer.finalize(ctx, s.id)
            } finally { pending.finish() }
        }
    }
}

class AlarmActivity : Activity() {
    private var player: MediaPlayer? = null
    private val h = Handler(Looper.getMainLooper())
    private var vol = 0.05f

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        val id = intent.getStringExtra("id")
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(48, 48, 48, 48) }
        root.addView(TextView(this).apply { text = "☀️ Bonjour !"; textSize = 36f; gravity = Gravity.CENTER })
        root.addView(Button(this).apply { text = "Répéter (9 min)"; setOnClickListener { snooze(id) } })
        root.addView(Button(this).apply { text = "Je me lève"; setOnClickListener { dismiss(id) } })
        setContentView(root)
        startSound()
    }

    private fun startSound() {
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
            setDataSource(this@AlarmActivity, uri); isLooping = true; setVolume(vol, vol); prepare(); start()
        }
        val step = object : Runnable { override fun run() {
            vol = (vol + 0.05f).coerceAtMost(1f); player?.setVolume(vol, vol); if (vol < 1f) h.postDelayed(this, 3000)
        } }
        h.postDelayed(step, 3000) // full volume after ~1 min
    }

    private fun stopSound() { h.removeCallbacksAndMessages(null); player?.run { stop(); release() }; player = null; AlarmScheduler.dismissNotif(this) }

    private fun snooze(id: String?) {
        stopSound()
        if (id != null) AlarmScheduler.scheduleFallback(this, id, System.currentTimeMillis() + 9 * 60_000)
        finish()
    }

    private fun dismiss(id: String?) {
        stopSound()
        startService(Intent(this, SleepTrackingService::class.java).setAction(SleepTrackingService.ACTION_STOP))
        if (id != null) Executors.newSingleThreadExecutor().execute { Finalizer.finalize(applicationContext, id) }
        // Bring the app forward so JS imports the night.
        packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
        finish()
    }

    override fun onDestroy() { stopSound(); super.onDestroy() }
}
