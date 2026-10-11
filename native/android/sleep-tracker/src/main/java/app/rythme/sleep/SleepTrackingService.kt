package app.rythme.sleep

import android.Manifest
import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.*
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import kotlin.math.*

class SleepTrackingService : Service(), SensorEventListener {
    companion object {
        const val CHANNEL = "sleep_tracking"
        const val NOTIF_ID = 4201
        const val EXTRA_ID = "sessionId"
        const val ACTION_STOP = "app.rythme.sleep.STOP"
        const val EPOCH_MS = 30_000L
        @Volatile var runningId: String? = null
    }

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var dao: SleepDao
    private var wake: PowerManager.WakeLock? = null
    private var sm: SensorManager? = null
    private var session: SessionEntity? = null
    private val handler = Handler(Looper.getMainLooper())

    // epoch accumulators (sensor thread = main looper)
    private var lastMag = Double.NaN
    private var activity = 0.0
    private var samples = 0
    private var gx = 0.0; private var gy = 0.0; private var gz = 0.0
    private var refG: DoubleArray? = null
    private var epochIdx = 0
    private var epochStart = 0L

    // mic: per-second RMS only
    @Volatile private var micRun = false
    private val secRms = mutableListOf<Double>()
    private var micThread: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        dao = SleepDb.get(this).dao()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Suivi du sommeil", NotificationManager.IMPORTANCE_LOW))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { finishAndStop(); return START_NOT_STICKY }
        io.execute {
            // Recover after process kill (START_STICKY redelivers null intent) or explicit start.
            val s = intent?.getStringExtra(EXTRA_ID)?.let { dao.session(it) } ?: dao.running()
            if (s == null || s.status != "running") { handler.post { stopSelf() }; return@execute }
            epochIdx = dao.epochCount(s.id)
            handler.post { begin(s) }
        }
        return START_STICKY
    }

    private fun begin(s: SessionEntity) {
        session = s
        runningId = s.id
        val stopPi = PendingIntent.getService(this, 1,
            Intent(this, SleepTrackingService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        val notif = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Suivi du sommeil en cours")
            .setContentText(if (s.useMic) "Mouvements et niveau sonore, analysés sur le téléphone" else "Mouvements, analysés sur le téléphone")
            .setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true)
            .addAction(0, "Arrêter", stopPi).build()
        val micOk = s.useMic && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val type = if (Build.VERSION.SDK_INT >= 34) {
            if (micOk) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            else ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        } else if (Build.VERSION.SDK_INT >= 30 && micOk) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
        ServiceCompat.startForeground(this, NOTIF_ID, notif, type)

        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rythme:sleep").apply { acquire(12 * 3600_000L) }

        sm = getSystemService(SensorManager::class.java)
        sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sm?.registerListener(this, it, 50_000 /* 20 Hz */, 5_000_000 /* batch 5 s */)
        }
        if (micOk) startMic()
        epochStart = System.currentTimeMillis()
        handler.postDelayed(::closeEpoch, EPOCH_MS)
    }

    override fun onSensorChanged(e: SensorEvent) {
        val (x, y, z) = Triple(e.values[0].toDouble(), e.values[1].toDouble(), e.values[2].toDouble())
        val mag = sqrt(x * x + y * y + z * z)
        if (!lastMag.isNaN()) activity += abs(mag - lastMag)
        lastMag = mag
        samples++
        gx += x; gy += y; gz += z
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}

    @SuppressLint("MissingPermission")
    private fun startMic() {
        micRun = true
        micThread = Thread {
            val rate = 16000
            val buf = max(AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), rate / 5)
            val rec = AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, buf)
            val pcm = ShortArray(rate) // 1 s; overwritten every second, never persisted
            try {
                rec.startRecording()
                while (micRun) {
                    var read = 0
                    while (read < pcm.size && micRun) { val n = rec.read(pcm, read, pcm.size - read); if (n <= 0) break; read += n }
                    var sum = 0.0
                    for (i in 0 until read) sum += pcm[i].toDouble() * pcm[i]
                    val rms = sqrt(sum / max(1, read)) / 32768.0
                    val db = 20 * log10(max(rms, 1e-6))
                    synchronized(secRms) { secRms.add(db) }
                }
            } catch (_: Exception) { } finally { try { rec.stop() } catch (_: Exception) {}; rec.release() }
        }.apply { start() }
    }

    private fun closeEpoch() {
        val s = session ?: return
        val now = System.currentTimeMillis()
        val n = max(samples, 1)
        val g = doubleArrayOf(gx / n, gy / n, gz / n)
        val tilt = refG?.let { angle(it, g) > 45.0 } ?: false
        if (refG == null && samples > 0) refG = g
        val rms = synchronized(secRms) { val c = secRms.toList(); secRms.clear(); c }
        val epoch = EpochEntity(s.id, epochIdx++, epochStart, activity, samples,
            rms.maxOrNull(), if (rms.isEmpty()) null else rms.average(), tilt)
        activity = 0.0; samples = 0; gx = 0.0; gy = 0.0; gz = 0.0; epochStart = now
        val battery = (getSystemService(BATTERY_SERVICE) as BatteryManager).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        io.execute {
            dao.insertEpoch(epoch)
            if (battery in 0..10 && !s.lowBattery) session = s.copy(lowBattery = true).also { dao.upsertSession(it) }
            checkSmartAlarm(now)
        }
        handler.postDelayed(::closeEpoch, EPOCH_MS)
    }

    private fun checkSmartAlarm(now: Long) {
        val s = session ?: return
        val e = s.alarmEarliest ?: return
        val l = s.alarmLatest ?: return
        if (s.smartAlarmFiredAt != null || now < e || now >= l) return
        val recent = dao.lastEpochs(s.id, s.lightEpochs)
        if (SleepAlgorithm.isLightNow(recent, dao.epochs(s.id), s.lightEpochs)) {
            session = s.copy(smartAlarmFiredAt = now).also { dao.upsertSession(it) }
            AlarmScheduler.ring(this, s.id, smart = true)
        }
    }

    private fun angle(a: DoubleArray, b: DoubleArray): Double {
        val dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
        val na = sqrt(a.sumOf { it * it }); val nb = sqrt(b.sumOf { it * it })
        if (na < 1e-6 || nb < 1e-6) return 0.0
        return Math.toDegrees(acos((dot / (na * nb)).coerceIn(-1.0, 1.0)))
    }

    private fun finishAndStop() {
        val id = session?.id ?: runningId
        teardown()
        if (id != null) io.execute { Finalizer.finalize(this, id); handler.post { stopSelf() } } else stopSelf()
    }

    private fun teardown() {
        handler.removeCallbacksAndMessages(null)
        sm?.unregisterListener(this)
        micRun = false
        micThread?.join(1500)
        wake?.let { if (it.isHeld) it.release() }
        wake = null
        runningId = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    }

    override fun onDestroy() { if (runningId != null) teardown(); super.onDestroy() }
}

object Finalizer {
    /** Idempotent: computes the summary from Room and marks the session pending for JS. */
    fun finalize(ctx: Context, id: String, endedAt: Long = System.currentTimeMillis()) {
        val dao = SleepDb.get(ctx).dao()
        val s = dao.session(id) ?: return
        if (s.status != "running") return
        val epochs = dao.epochs(id)
        val end = epochs.lastOrNull()?.let { it.t + SleepTrackingService.EPOCH_MS }?.coerceAtMost(endedAt) ?: endedAt
        val json = SleepAlgorithm.summarize(s, epochs, end)
        dao.upsertSession(s.copy(endedAt = end, status = "finalized", summaryJson = json.toString()))
        AlarmScheduler.cancel(ctx, id)
        SleepTrackerPlugin.emitFinished(json)
    }
}
