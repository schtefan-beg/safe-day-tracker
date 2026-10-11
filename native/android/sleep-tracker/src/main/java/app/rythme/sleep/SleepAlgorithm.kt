package app.rythme.sleep

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max

/**
 * Cole-Kripke (1992) on 1-min epochs built from pairs of 30 s phone epochs.
 * Phone counts are not wrist-actigraph counts: they are normalised to the session's
 * 90th percentile so the published weights/threshold apply. Stages are heuristic.
 */
object SleepAlgorithm {
    const val ALGO_VERSION = "ck92-phone-norm-1"
    private val W = doubleArrayOf(404.0, 598.0, 326.0, 441.0, 1408.0, 508.0, 350.0) // A-4..A+2
    private const val SCALE = 0.00001
    private const val NORM_TARGET = 300.0 // typical CK count for "clearly awake" minute

    /** true = asleep, per 1-min epoch. */
    fun classify(minuteCounts: DoubleArray): BooleanArray {
        val sorted = minuteCounts.sorted()
        val p90 = if (sorted.isEmpty()) 1.0 else max(sorted[(sorted.size * 0.9).toInt().coerceAtMost(sorted.size - 1)], 1e-6)
        val a = DoubleArray(minuteCounts.size) { minuteCounts[it] / p90 * NORM_TARGET }
        val asleep = BooleanArray(a.size) { i ->
            var d = 0.0
            for (k in -4..2) { val j = i + k; if (j in a.indices) d += W[k + 4] * a[j] }
            d * SCALE < 1.0
        }
        // Webster rescoring (simplified): after >=4 min wake, next 1 min sleep -> wake; short sleep bouts (<=6 min) inside >=10 min wake -> wake
        var wakeRun = 0
        for (i in asleep.indices) {
            if (!asleep[i]) wakeRun++ else { if (wakeRun >= 4) asleep[i] = false; wakeRun = 0 }
        }
        return asleep
    }

    /** Light vs deep inside ~90 min windows: below the 35th percentile of the window = deep. */
    fun stages(minuteCounts: DoubleArray, asleep: BooleanArray): Array<String> {
        val out = Array(asleep.size) { if (asleep[it]) "light" else "wake" }
        val win = 90
        var s = 0
        while (s < asleep.size) {
            val e = minOf(asleep.size, s + win)
            val vals = (s until e).filter { asleep[it] }.map { minuteCounts[it] }.sorted()
            if (vals.isNotEmpty()) {
                val p35 = vals[(vals.size * 0.35).toInt().coerceAtMost(vals.size - 1)]
                val p70 = vals[(vals.size * 0.70).toInt().coerceAtMost(vals.size - 1)]
                for (i in s until e) if (asleep[i]) {
                    out[i] = when {
                        minuteCounts[i] <= p35 -> "deep"
                        // REM (low confidence): late in the cycle, sleep with small twitches
                        (i - s) > 60 && minuteCounts[i] in p35..p70 -> "rem"
                        else -> "light"
                    }
                }
            }
            s = e
        }
        return out
    }

    fun summarize(s: SessionEntity, epochs: List<EpochEntity>, endedAt: Long): JSONObject {
        val minutes = (epochs.size + 1) / 2
        val counts = DoubleArray(minutes) { m ->
            epochs.getOrNull(2 * m)?.activity.orZero() + epochs.getOrNull(2 * m + 1)?.activity.orZero()
        }
        val asleep = classify(counts)
        val st = stages(counts, asleep)
        val first = asleep.indexOfFirst { it }.let { if (it < 0) minutes else it }
        // onset = first run of >=10 consecutive sleep minutes
        var onset = minutes
        run { var r = 0; for (i in asleep.indices) { if (asleep[i]) { r++; if (r >= 10) { onset = i - 9; return@run } } else r = 0 } }
        if (onset == minutes) onset = first
        val last = asleep.indexOfLast { it }
        var awak = 0; var inWake = 0
        if (last > onset) for (i in onset..last) {
            if (!asleep[i]) { inWake++; if (inWake == 2) awak++ } else inWake = 0 // wake bout >= 2 min
        }
        val asleepMin = asleep.count { it }
        val inBed = max(1, ((endedAt - s.startedAt) / 60000).toInt())

        val hyp = JSONArray()
        for (b in 0 until (minutes + 4) / 5) {
            val sl = st.slice(b * 5 until minOf(minutes, b * 5 + 5))
            hyp.put(sl.groupingBy { it }.eachCount().maxByOrNull { it.value }?.key ?: "wake")
        }

        val events = JSONArray()
        val reasons = JSONArray()
        var gaps = 0; var moved = 0
        var noiseSum = 0.0; var noiseN = 0
        epochs.forEachIndexed { i, e ->
            if (i > 0 && e.t - epochs[i - 1].t > 90_000) gaps++
            if (e.samples < 100) gaps++ // < ~3 Hz effective
            if (e.tiltChanged) { moved++; events.put(JSONObject().put("t", e.t).put("kind", "phone_moved")) }
            e.rmsDbMean?.let { noiseSum += it; noiseN++ }
            if (e.rmsDbMax != null && e.rmsDbMean != null && e.rmsDbMax - e.rmsDbMean > 15)
                events.put(JSONObject().put("t", e.t).put("kind", "noise"))
        }
        var lastWake = -10
        for (i in asleep.indices) if (i in (onset + 1)..last && !asleep[i] && i - lastWake > 5) {
            events.put(JSONObject().put("t", s.startedAt + i * 60_000L).put("kind", "awakening")); lastWake = i
        }
        if (gaps > epochs.size / 20) reasons.put("gaps")
        if (moved > 3) reasons.put("phone_moved")
        if (s.lowBattery) reasons.put("low_battery")
        if (minutes < 120) reasons.put("short")
        val quality = when { reasons.length() == 0 -> "good"; reasons.length() == 1 -> "partial"; else -> "poor" }

        return JSONObject()
            .put("id", s.id).put("algoVersion", ALGO_VERSION)
            .put("startedAt", s.startedAt).put("endedAt", endedAt)
            .put("usedMicrophone", s.useMic)
            .put("asleepMin", asleepMin)
            .put("onsetLatencyMin", onset.coerceAtMost(minutes))
            .put("awakenings", awak)
            .put("efficiency", asleepMin.toDouble() / inBed)
            .put("hypnogram", hyp).put("events", events)
            .put("quality", quality).put("qualityReasons", reasons)
            .put("smartAlarmFiredAt", s.smartAlarmFiredAt ?: JSONObject.NULL)
            .put("avgNoiseDb", if (noiseN > 0) noiseSum / noiseN else JSONObject.NULL)
    }

    /** Smart alarm: last n epochs are light/awake-ish if each is above the session's median activity. */
    fun isLightNow(recent: List<EpochEntity>, all: List<EpochEntity>, n: Int): Boolean {
        if (recent.size < n || all.size < 20) return false
        val med = all.map { it.activity }.sorted()[all.size / 2]
        return recent.take(n).count { it.activity > med * 1.5 } >= (n + 1) / 2
    }

    private fun Double?.orZero() = this ?: 0.0
}
