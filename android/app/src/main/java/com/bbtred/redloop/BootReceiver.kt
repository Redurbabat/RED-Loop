package com.bbtred.redloop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/**
 * Brings the service back after the tablet restarts, so the chats reopen on
 * their conversations without anyone touching the app. Off unless the user
 * turned it on, and a chat still only resumes when its own automatic start
 * is on. The manufacturer's autostart permission is a separate hurdle.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val preferences = context.getSharedPreferences(LoopService.PREFERENCES, Context.MODE_PRIVATE)
        if (!preferences.getBoolean("startAtBoot", false)) return
        runCatching { ContextCompat.startForegroundService(context, Intent(context, LoopService::class.java)) }
    }
}
