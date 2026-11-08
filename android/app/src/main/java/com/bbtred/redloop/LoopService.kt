package com.bbtred.redloop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.ComponentCallbacks2
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Owns every chat and keeps them working while the activity is gone and the
 * screen is off. A foreground service plus a partial wake lock is the only
 * supported way to do that on Android; the ongoing notification is what the
 * system requires in return, and it carries the Pause action.
 */
class LoopService : Service(), SessionListener {

    companion object {
        const val ACTION_PAUSE_ALL = "com.bbtred.redloop.PAUSE_ALL"
        const val MAX_SESSIONS = 8
        private const val RUNNING_CHANNEL = "red-loop.running"
        private const val STOPS_CHANNEL = "red-loop.stops"
        private const val RUNNING_ID = 1
        private const val WAKE_TAG = "RedLoop::loops"
        const val PREFERENCES = "red-loop"
        private const val CLEAN_SHUTDOWN = "cleanShutdown"
        private const val RUNNING_BEFORE = "runningBefore"
        private const val KILLED_ID = 900
        private const val KILL_COUNT = "killCount"
    }

    inner class LocalBinder : Binder() {
        val service: LoopService get() = this@LoopService
    }

    private val binder = LocalBinder()
    private val main = Handler(Looper.getMainLooper())
    private val _sessions = mutableListOf<ChatSession>()
    val sessions: List<ChatSession> get() = _sessions

    var script: LoopScript? = null
        private set
    var scriptError: String? = null
        private set

    private var nextId = 1
    private var events: List<LogEntry> = emptyList()
    /** The chat an activity currently shows; never unloaded for memory. */
    var visibleSession: ChatSession? = null
    private val overlay by lazy { OverlayHost(this) }
    private var wakeLock: PowerManager.WakeLock? = null
    private var listener: (() -> Unit)? = null

    /** False while chats that nobody looks at cannot be parked in a window. */
    val backgroundLayoutReady: Boolean get() = overlay.permitted

    /** Newest last. */
    val log: List<LogEntry> get() = events

    val runningCount: Int get() = _sessions.count { it.state.running }
    val totalContinuations: Int get() = _sessions.sumOf { it.state.count }

    override fun onCreate() {
        super.onCreate()
        createChannels()
        startForegroundNotice()
        Thread {
            val preferences = getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            val server = preferences.getString("server", ScriptSource.DEFAULT_SERVER)
            val allowCloud = preferences.getBoolean("cloudScript", true)
            val loaded = ScriptSource.load(applicationContext, server, allowCloud)
            val restored = SessionStore.decode(preferences.getString(SessionStore.KEY, null))
            val storedLog = EventLog.decode(preferences.getString(EventLog.KEY, null))
            // The system kills background apps silently. If the last run ended
            // without onDestroy, say so instead of leaving it a mystery.
            val killedWith = if (preferences.getBoolean(CLEAN_SHUTDOWN, true)) 0
            else preferences.getInt(RUNNING_BEFORE, 0)
            val resume = killedWith > 0 && preferences.getBoolean("resumeAfterStop", true)
            val kills = if (killedWith > 0) preferences.getInt(KILL_COUNT, 0) + 1 else preferences.getInt(KILL_COUNT, 0)
            if (killedWith > 0) preferences.edit().putInt(KILL_COUNT, kills).apply()
            preferences.edit().putBoolean(CLEAN_SHUTDOWN, false).putInt(RUNNING_BEFORE, 0).apply()
            main.post {
                if (loaded == null) {
                    scriptError = "Loop-Skript nicht gefunden. Verbindung prüfen."
                } else {
                    script = loaded
                    // Every tab comes back on the conversation it had open.
                    if (_sessions.isEmpty()) {
                        if (restored.isEmpty()) addSession()
                        else restored.forEach {
                            // A chat the system interrupted picks its work back
                            // up; one the user had stopped stays stopped.
                            addSession(it.url, it.name, it.autoStart, it.autoRetry, resume && it.wasRunning)
                        }
                    }
                }
                events = storedLog
                if (killedWith > 0) {
                    note("App", "Vom System beendet, $killedWith Lauf/Läufe betroffen")
                    announceKilled(killedWith, resume, kills)
                }
                notifyListener()
                updateNotification()
            }
        }.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_PAUSE_ALL) pauseAll()
        startForegroundNotice()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        // A deliberate stop is not something to recover from.
        persistSessions(running = false)
        preferences().edit().putBoolean(CLEAN_SHUTDOWN, true).putInt(RUNNING_BEFORE, 0).apply()
        releaseWakeLock()
        _sessions.forEach { it.destroy() }
        _sessions.clear()
        overlay.release()
        super.onDestroy()
    }

    fun setListener(callback: (() -> Unit)?) {
        listener = callback
    }

    fun addSession(
        startUrl: String = ChatHosts.START,
        savedName: String? = null,
        autoStart: Boolean = false,
        autoRetry: Boolean = false,
        resumeNow: Boolean = false
    ): ChatSession? {
        val loaded = script ?: return null
        if (_sessions.size >= MAX_SESSIONS) return null
        val session = ChatSession(
            nextId++, applicationContext, loaded, startUrl, savedName, autoStart, autoRetry, resumeNow, this
        )
        session.parkingLot = overlay.ensure()
        _sessions.add(session)
        persistSessions()
        notifyListener()
        updateNotification()
        return session
    }

    fun removeSession(session: ChatSession) {
        if (!_sessions.remove(session)) return
        session.destroy()
        refreshWakeLock()
        persistSessions()
        notifyListener()
        updateNotification()
    }

    fun pauseAll() = _sessions.forEach { it.pause() }

    /** Called after the user grants the overlay permission. */
    fun refreshParking() {
        // Cheap and self-terminating, so the UI may call it on every render.
        if (_sessions.none { it.parkingLot == null }) return
        val lot = overlay.ensure() ?: return
        _sessions.forEach { session ->
            if (session.parkingLot == null) {
                session.parkingLot = lot
                session.webView?.let { if (it.parent == null) session.detachAndLayout() }
            }
        }
        notifyListener()
    }

    override fun onState(session: ChatSession, previous: LoopState, current: LoopState) {
        refreshWakeLock()
        preferences().edit().putInt(RUNNING_BEFORE, runningCount).apply()
        if (previous.running != current.running) {
            note(session.title, if (current.running) "Gestartet" else "${current.status} · ${current.progress}")
        }
        StopClassifier.notice(previous, current, session.title)?.let { announce(session.id, it) }
        notifyListener()
        updateNotification()
    }

    override fun onDetails(session: ChatSession) {
        persistSessions()
        notifyListener()
    }

    private fun note(chat: String, text: String) {
        events = EventLog.append(events, LogEntry(System.currentTimeMillis(), chat, text))
        preferences().edit().putString(EventLog.KEY, EventLog.encode(events)).apply()
    }

    fun clearLog() {
        events = emptyList()
        preferences().edit().remove(EventLog.KEY).apply()
        notifyListener()
    }

    /**
     * Several ChatGPT pages are heavy. When the system says memory is short,
     * give back the chats nobody is looking at and that are not working; they
     * keep their address and come back when opened.
     */
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level < ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) return
        val freed = _sessions.count { it !== visibleSession && it.unload() }
        if (freed > 0) {
            note("App", "Speicher knapp: $freed Chat(s) entladen")
            notifyListener()
            updateNotification()
        }
    }

    /** Frees every idle chat except the one on screen, on request. */
    fun unloadIdle(): Int {
        val freed = _sessions.count { it !== visibleSession && it.unload() }
        if (freed > 0) {
            note("App", "$freed Chat(s) von Hand entladen")
            notifyListener()
            updateNotification()
        }
        return freed
    }

    private fun preferences() = getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    var startAtBoot: Boolean
        get() = preferences().getBoolean("startAtBoot", false)
        set(value) {
            preferences().edit().putBoolean("startAtBoot", value).apply()
            notifyListener()
        }

    var useCloudScript: Boolean
        get() = preferences().getBoolean("cloudScript", true)
        set(value) {
            preferences().edit().putBoolean("cloudScript", value).apply()
            notifyListener()
        }

    /**
     * Fetches the script again and reloads the chats that are idle. A running
     * chat keeps the script it started with, because a reload would end its
     * run; reload it yourself once it has stopped.
     */
    fun reloadScript() {
        val allowCloud = useCloudScript
        Thread {
            val loaded = ScriptSource.load(applicationContext, preferences().getString("server", ScriptSource.DEFAULT_SERVER), allowCloud)
            main.post {
                if (loaded == null) {
                    scriptError = "Loop-Skript nicht gefunden. Verbindung prüfen."
                } else {
                    scriptError = null
                    script = loaded
                    _sessions.forEach { session ->
                        session.script = loaded
                        if (!session.state.running) session.reload()
                    }
                }
                notifyListener()
                updateNotification()
            }
        }.start()
    }

    /** On by default: an interrupted night should not need a hand. */
    var resumeAfterStop: Boolean
        get() = preferences().getBoolean("resumeAfterStop", true)
        set(value) {
            preferences().edit().putBoolean("resumeAfterStop", value).apply()
            notifyListener()
        }

    /** How often the system has ended the app since the last reset. */
    val killCount: Int get() = preferences().getInt(KILL_COUNT, 0)

    fun clearKillCount() {
        preferences().edit().putInt(KILL_COUNT, 0).apply()
        notifyListener()
    }

    private fun announceKilled(count: Int, resumed: Boolean, kills: Int) {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val tail = if (resumed) "Sie werden fortgesetzt, sobald die Unterhaltungen geladen sind. "
        else "Starte sie in der App wieder. "
        val often = if (kills >= 3) "Das ist bereits das $kills. Mal — prüfe in der Übersicht die Freigaben für Hintergrundbetrieb. "
        else "Prüfe in der Übersicht die Freigaben für Hintergrundbetrieb. "
        val body = "Das System hat RED Loop beendet, während $count Lauf/Läufe aktiv waren. " + tail + often
        val notification = NotificationCompat.Builder(this, STOPS_CHANNEL)
            .setContentTitle("Läufe wurden vom System gestoppt")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(KILLED_ID, notification) }
    }

    private fun persistSessions(running: Boolean? = null) {
        val stored = SessionStore.encode(_sessions.mapNotNull { session ->
            if (running == null) session.saved() else session.saved(running)
        })
        preferences().edit().putString(SessionStore.KEY, stored).apply()
    }

    private fun notifyListener() = listener?.invoke()

    private fun refreshWakeLock() {
        if (runningCount > 0) acquireWakeLock() else releaseWakeLock()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_TAG).apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(RUNNING_CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
                .apply { description = getString(R.string.channel_description) }
        )
        manager.createNotificationChannel(
            NotificationChannel(STOPS_CHANNEL, getString(R.string.stops_channel_name), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = getString(R.string.stops_channel_description) }
        )
    }

    private fun startForegroundNotice() {
        val notification = buildRunningNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(RUNNING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(RUNNING_ID, notification)
        }
    }

    private fun updateNotification() {
        runCatching {
            NotificationManagerCompat.from(this).notify(RUNNING_ID, buildRunningNotification())
        }
    }

    private fun buildRunningNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val pause = PendingIntent.getService(
            this, 1, Intent(this, LoopService::class.java).setAction(ACTION_PAUSE_ALL),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val running = runningCount
        val text = when {
            script == null && scriptError != null -> scriptError
            script == null -> getString(R.string.loading_script)
            running == 0 -> "Keine Fortsetzung aktiv · ${_sessions.size} Chats geöffnet"
            else -> "$running von ${_sessions.size} Chats aktiv · $totalContinuations Fortsetzungen"
        }
        return NotificationCompat.Builder(this, RUNNING_CHANNEL)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, getString(R.string.pause_all), pause)
            .build()
    }

    private fun announce(sessionId: Int, notice: StopNotice) {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, STOPS_CHANNEL)
            .setContentTitle(notice.title)
            .setContentText(notice.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notice.body))
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(1000 + sessionId, notification) }
    }
}
