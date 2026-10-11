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
    val detectSounds: Boolean = false,
    val saveClips: Boolean = false,
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

@Entity(tableName = "sound_event", primaryKeys = ["sessionId", "t", "kind"])
data class SoundEventEntity(
    val sessionId: String,
    val t: Long,
    val kind: String,   // snore | cough
    val score: Double,
    val clip: String?,  // file name in filesDir/sleep-clips/<sessionId>, only when opted in
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
    @Insert(onConflict = OnConflictStrategy.IGNORE) fun insertSound(e: SoundEventEntity)
    @Query("SELECT * FROM sound_event WHERE sessionId = :id ORDER BY t") fun sounds(id: String): List<SoundEventEntity>
    @Query("UPDATE sound_event SET clip = NULL WHERE sessionId = :id AND clip = :clip") fun clearClip(id: String, clip: String)
    @Query("UPDATE session SET status = 'acknowledged' WHERE id = :id") fun acknowledge(id: String)
    @Query("DELETE FROM epoch WHERE sessionId IN (SELECT id FROM session WHERE status = 'acknowledged')") fun purgeAcknowledgedEpochs()
}

@Database(entities = [SessionEntity::class, EpochEntity::class, SoundEventEntity::class], version = 2, exportSchema = false)
abstract class SleepDb : RoomDatabase() {
    abstract fun dao(): SleepDao
    companion object {
        @Volatile private var inst: SleepDb? = null
        fun get(ctx: Context): SleepDb = inst ?: synchronized(this) {
            inst ?: Room.databaseBuilder(ctx.applicationContext, SleepDb::class.java, "sleep-tracker.db")
                .addMigrations(object : androidx.room.migration.Migration(1, 2) {
                    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL("ALTER TABLE session ADD COLUMN detectSounds INTEGER NOT NULL DEFAULT 0")
                        db.execSQL("ALTER TABLE session ADD COLUMN saveClips INTEGER NOT NULL DEFAULT 0")
                        db.execSQL("CREATE TABLE IF NOT EXISTS sound_event (sessionId TEXT NOT NULL, t INTEGER NOT NULL, kind TEXT NOT NULL, score REAL NOT NULL, clip TEXT, PRIMARY KEY(sessionId, t, kind))")
                    }
                })
                .build().also { inst = it }
        }
    }
}
