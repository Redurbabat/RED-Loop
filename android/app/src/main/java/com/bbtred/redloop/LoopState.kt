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

/** Turns ChatGPT's own page title into a short tab name. */
object ChatTitles {
    const val MAX_LENGTH = 28
    private val noise = listOf("ChatGPT", "OpenAI")

    fun clean(raw: String?, fallback: String): String {
        var value = raw.orEmpty().replace('\n', ' ').trim()
        for (word in noise) {
            value = value.removePrefix(word).removeSuffix(word).trim(' ', '-', '–', '—', '|', '·', ':')
        }
        if (value.isEmpty() || noise.any { value.equals(it, ignoreCase = true) }) return fallback
        return if (value.length > MAX_LENGTH) value.take(MAX_LENGTH - 1).trimEnd() + "…" else value
    }
}

/** What survives a restart: which conversation a tab had open, and its name. */
data class SavedChat(val url: String, val name: String?)

object SessionStore {
    const val KEY = "chats"
    private const val MAX = LoopService.MAX_SESSIONS

    fun encode(chats: List<SavedChat>): String {
        val array = org.json.JSONArray()
        chats.take(MAX).forEach { chat ->
            array.put(org.json.JSONObject().put("url", chat.url).apply { chat.name?.let { put("name", it) } })
        }
        return array.toString()
    }

    fun decode(stored: String?): List<SavedChat> {
        if (stored.isNullOrBlank()) return emptyList()
        val array = runCatching { org.json.JSONArray(stored) }.getOrNull() ?: return emptyList()
        val chats = mutableListOf<SavedChat>()
        for (index in 0 until minOf(array.length(), MAX)) {
            val item = array.optJSONObject(index) ?: continue
            val url = item.optString("url").trim()
            // Only a real ChatGPT conversation address is worth restoring.
            if (!isRestorable(url)) continue
            val name = item.optString("name").trim().takeIf { it.isNotEmpty() }?.take(ChatTitles.MAX_LENGTH)
            chats.add(SavedChat(url, name))
        }
        return chats
    }

    fun isRestorable(url: String?): Boolean {
        val value = url.orEmpty()
        if (!value.startsWith("https://")) return false
        val host = runCatching { java.net.URI(value).host }.getOrNull()
        return ChatHosts.isChat(host)
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
