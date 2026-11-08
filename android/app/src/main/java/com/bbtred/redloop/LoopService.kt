package com.bbtred.redloop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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
    private var wakeLock: PowerManager.WakeLock? = null
    private var listener: (() -> Unit)? = null

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
            main.post {
                if (loaded == null) {
                    scriptError = "Loop-Skript nicht gefunden. Verbindung prüfen."
                } else {
                    script = loaded
                    // Every tab comes back on the conversation it had open.
                    if (_sessions.isEmpty()) {
                        if (restored.isEmpty()) addSession()
                        else restored.forEach { addSession(it.url, it.name) }
                    }
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
        releaseWakeLock()
        _sessions.forEach { it.destroy() }
        _sessions.clear()
        super.onDestroy()
    }

    fun setListener(callback: (() -> Unit)?) {
        listener = callback
    }

    fun addSession(startUrl: String = ChatHosts.START, savedName: String? = null): ChatSession? {
        val loaded = script ?: return null
        if (_sessions.size >= MAX_SESSIONS) return null
        val session = ChatSession(nextId++, applicationContext, loaded, startUrl, savedName, this)
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

    override fun onState(session: ChatSession, previous: LoopState, current: LoopState) {
        refreshWakeLock()
        StopClassifier.notice(previous, current, session.title)?.let { announce(session.id, it) }
        notifyListener()
        updateNotification()
    }

    override fun onDetails(session: ChatSession) {
        persistSessions()
        notifyListener()
    }

    private fun persistSessions() {
        val stored = SessionStore.encode(_sessions.mapNotNull { it.saved() })
        getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
            .putString(SessionStore.KEY, stored).apply()
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
