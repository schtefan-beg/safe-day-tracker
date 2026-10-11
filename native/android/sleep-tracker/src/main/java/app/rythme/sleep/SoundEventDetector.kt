package app.rythme.sleep

import android.content.Context
import org.tensorflow.lite.support.audio.TensorAudio
import org.tensorflow.lite.task.audio.classifier.AudioClassifier
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Phase 2: on-device snore / cough detection with YAMNet (AudioSet, 521 classes) via TFLite Task Audio.
 * Model file: assets/yamnet.tflite (see README). Runs on 1 s mono 16 kHz frames handed over by the
 * service; frames are never persisted unless the user explicitly opted into clips.
 */
class SoundEventDetector(private val ctx: Context, private val sessionId: String, private val saveClips: Boolean) {
    companion object {
        const val MODEL_VERSION = "yamnet-v1"
        const val RATE = 16000
        private val SNORE = setOf("Snoring", "Snort")
        private val COUGH = setOf("Cough", "Throat clearing")
        private const val THRESH = 0.35f
        private const val CLIP_SECONDS = 6
        private const val MAX_CLIPS_PER_NIGHT = 20
        private const val MIN_DB = -55.0 // skip inference in silence to save battery
        fun clipsDir(ctx: Context, id: String) = File(ctx.filesDir, "sleep-clips/$id")
        fun available(ctx: Context) = try { ctx.assets.open("yamnet.tflite").close(); true } catch (_: Exception) { false }
    }

    data class Detection(val t: Long, val kind: String, val score: Float, val clip: String?)

    private val classifier: AudioClassifier? = try { AudioClassifier.createFromFile(ctx, "yamnet.tflite") } catch (_: Exception) { null }
    private val tensor: TensorAudio? = classifier?.createInputTensorAudio()
    private val ring = ArrayDeque<ShortArray>() // last CLIP_SECONDS seconds, RAM only
    private var clips = 0
    private var lastKindAt = mutableMapOf<String, Long>()
    private var pendingClip: Pair<String, Int>? = null // name, seconds still to record after the event

    val ready get() = classifier != null

    /** Call once per second with that second of PCM and its RMS dBFS. Returns a detection or null. */
    fun onSecond(pcm: ShortArray, len: Int, db: Double, now: Long): Detection? {
        if (saveClips) {
            ring.addLast(pcm.copyOf(len)); while (ring.size > CLIP_SECONDS) ring.removeFirst()
            pendingClip?.let { (name, left) ->
                if (left <= 1) { writeWav(name); pendingClip = null } else pendingClip = name to left - 1
            }
        }
        val c = classifier ?: return null
        val t = tensor ?: return null
        if (db < MIN_DB) return null
        val f = FloatArray(len) { pcm[it] / 32768f }
        t.load(f)
        val cats = c.classify(t).firstOrNull()?.categories ?: return null
        var kind: String? = null; var best = 0f
        for (cat in cats) {
            val k = when (cat.label) { in SNORE -> "snore"; in COUGH -> "cough"; else -> null } ?: continue
            if (cat.score > THRESH && cat.score > best) { kind = k; best = cat.score }
        }
        kind ?: return null
        // debounce: one snore mark per 30 s, one cough mark per 3 s
        val gap = if (kind == "snore") 30_000 else 3_000
        if (now - (lastKindAt[kind] ?: 0) < gap) return null
        lastKindAt[kind] = now
        var clipName: String? = null
        if (saveClips && clips < MAX_CLIPS_PER_NIGHT && pendingClip == null) {
            clipName = "${now}_$kind.wav"; clips++
            pendingClip = clipName to CLIP_SECONDS / 2 // keep 3 s before + 3 s after
        }
        return Detection(now, kind, best, clipName)
    }

    fun close() { pendingClip?.let { writeWav(it.first) }; pendingClip = null; classifier?.close() }

    private fun writeWav(name: String) {
        val dir = clipsDir(ctx, sessionId).apply { mkdirs() }
        val samples = ring.sumOf { it.size }
        RandomAccessFile(File(dir, name), "rw").use { f ->
            val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            h.put("RIFF".toByteArray()).putInt(36 + samples * 2).put("WAVE".toByteArray())
                .put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(RATE).putInt(RATE * 2)
                .putShort(2).putShort(16).put("data".toByteArray()).putInt(samples * 2)
            f.write(h.array())
            val b = ByteBuffer.allocate(samples * 2).order(ByteOrder.LITTLE_ENDIAN)
            ring.forEach { s -> s.forEach { b.putShort(it) } }
            f.write(b.array())
        }
    }
}
