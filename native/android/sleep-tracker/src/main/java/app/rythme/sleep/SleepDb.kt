package app.rythme.sleep

import android.content.Context
import androidx.room.*

@Entity(tableName = "session")
data class SessionEntity(
    @PrimaryKey val id: String,
    val startedAt: Long,
    val endedAt: Long? = null,
    val useMic: Boolean,
    val alarmEarliest: Long? = null,
    val alarmLatest: Long? = null,
    val lightEpochs: Int = 4,
    val smartAlarmFiredAt: Long? = null,
    val status: String = "running",          // running | finalized | acknowledged
    val summaryJson: String? = null,
    val lowBattery: Boolean = false,
)

/** One row per 30 s epoch. Only derived numbers — never raw audio. */
@Entity(tableName = "epoch", primaryKeys = ["sessionId", "idx"])
data class EpochEntity(
    val sessionId: String,
    val idx: Int,
    val t: Long,
    val activity: Double,      // sum |Δ magnitude| over the epoch
    val samples: Int,
    val rmsDbMax: Double?,     // max of per-second RMS levels (dBFS)
    val rmsDbMean: Double?,
    val tiltChanged: Boolean,  // gravity vector moved > 45° => phone likely off-bed
)

@Dao
interface SleepDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) fun upsertSession(s: SessionEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) fun insertEpoch(e: EpochEntity)
    @Query("SELECT * FROM session WHERE id = :id") fun session(id: String): SessionEntity?
    @Query("SELECT * FROM session WHERE status = 'running' LIMIT 1") fun running(): SessionEntity?
    @Query("SELECT * FROM session WHERE status = 'finalized' ORDER BY startedAt") fun pending(): List<SessionEntity>
    @Query("SELECT * FROM epoch WHERE sessionId = :id ORDER BY idx") fun epochs(id: String): List<EpochEntity>
    @Query("SELECT COUNT(*) FROM epoch WHERE sessionId = :id") fun epochCount(id: String): Int
    @Query("SELECT * FROM epoch WHERE sessionId = :id ORDER BY idx DESC LIMIT :n") fun lastEpochs(id: String, n: Int): List<EpochEntity>
    @Query("UPDATE session SET status = 'acknowledged' WHERE id = :id") fun acknowledge(id: String)
    @Query("DELETE FROM epoch WHERE sessionId IN (SELECT id FROM session WHERE status = 'acknowledged')") fun purgeAcknowledgedEpochs()
}

@Database(entities = [SessionEntity::class, EpochEntity::class], version = 1, exportSchema = false)
abstract class SleepDb : RoomDatabase() {
    abstract fun dao(): SleepDao
    companion object {
        @Volatile private var inst: SleepDb? = null
        fun get(ctx: Context): SleepDb = inst ?: synchronized(this) {
            inst ?: Room.databaseBuilder(ctx.applicationContext, SleepDb::class.java, "sleep-tracker.db")
                .build().also { inst = it }
        }
    }
}
