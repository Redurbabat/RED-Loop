package com.bbtred.redloop

import org.json.JSONObject

/**
 * What the injected panel reports back. Counters and the panel's own status
 * line only: no conversation text and no follow-up text crosses the bridge.
 */
data class LoopState(
    val running: Boolean = false,
    val count: Int = 0,
    val limit: Int = 10,
    val endless: Boolean = false,
    val status: String = "Panel wird vorbereitet …"
) {
    val progress: String get() = if (endless) "$count / ∞" else "$count / $limit"

    companion object {
        const val MAX_STATUS = 160

        /** Returns null for anything that is not a well formed state report. */
        fun fromBridge(message: String?): LoopState? {
            if (message.isNullOrBlank() || message.length > 4096) return null
            val payload = runCatching { JSONObject(message) }.getOrNull() ?: return null
            if (payload.optString("type") != "state") return null
            val status = payload.optString("status").trim().take(MAX_STATUS)
            return LoopState(
                running = payload.optBoolean("running", false),
                count = payload.optInt("count", 0).coerceAtLeast(0),
                limit = payload.optInt("limit", 10).coerceAtLeast(1),
                endless = payload.optBoolean("endless", false),
                status = status.ifEmpty { "Bereit" }
            )
        }
    }
}

data class StopNotice(val kind: Kind, val title: String, val body: String) {
    enum class Kind { FINISHED, QUESTION, LIMIT, FAILURE }
}

/**
 * Decides, from the panel's own status line, whether a finished run is worth
 * announcing. Pure, so unit tests cover it without a device.
 */
object StopClassifier {
    private val silentPrefixes = listOf("Pausiert", "Gestoppt", "Zurückgesetzt", "Bereit")

    fun notice(previous: LoopState, current: LoopState, chat: String): StopNotice? {
        if (!previous.running || current.running) return null
        val status = current.status.trim()
        // Stops the user caused need no announcement.
        if (status.isEmpty() || silentPrefixes.any { status.startsWith(it) }) return null
        val progress = "${current.progress} Fortsetzungen"
        return when {
            status.contains("Auftrag abgeschlossen") -> StopNotice(
                StopNotice.Kind.FINISHED, "$chat: Auftrag abgeschlossen",
                "ChatGPT meldet alle Aufgaben als erledigt. Bitte prüfen · $progress"
            )
            status.contains("Rückfrage") -> StopNotice(
                StopNotice.Kind.QUESTION, "$chat: ChatGPT hat eine Rückfrage",
                "Der Loop wartet auf deine Antwort im Chat · $progress"
            )
            status.contains("Limit erreicht") -> StopNotice(
                StopNotice.Kind.LIMIT, "$chat: Limit erreicht",
                "Der Loop hat sein Limit erreicht und angehalten · $progress"
            )
            else -> StopNotice(StopNotice.Kind.FAILURE, "$chat: Loop angehalten", "$status · $progress")
        }
    }
}

/** Which hosts may stay inside the app, and which page may report state. */
object ChatHosts {
    const val START = "https://chatgpt.com/"

    private val allowed = setOf(
        "chatgpt.com", "chat.openai.com", "openai.com", "auth.openai.com", "auth0.openai.com",
        "platform.openai.com", "cdn.oaistatic.com", "cdn.auth0.com", "challenges.cloudflare.com",
        "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com", "login.live.com"
    )

    fun isChat(host: String?): Boolean {
        val value = host?.lowercase() ?: return false
        return value == "chatgpt.com" || value == "chat.openai.com" || value.endsWith(".chatgpt.com")
    }

    fun staysInApp(host: String?): Boolean {
        val value = host?.lowercase() ?: return false
        return allowed.contains(value) || value.endsWith(".openai.com") ||
            value.endsWith(".chatgpt.com") || value.endsWith(".oaistatic.com")
    }
}
