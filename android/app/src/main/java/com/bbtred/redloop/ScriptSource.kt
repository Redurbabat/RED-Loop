package com.bbtred.redloop

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

enum class ScriptOrigin(val label: String) {
    CLOUD("Cloudflare"), CACHE("Zwischenspeicher"), BUNDLE("App")
}

data class LoopScript(val origin: ScriptOrigin, val version: String, val body: String)

/**
 * The continuation script for the in-app ChatGPT views. The copy published by
 * the private Worker wins, so a ChatGPT layout fix ships with a deploy instead
 * of a new APK; the last good download and the bundled asset are the
 * fallbacks. The script is injected into pages the user is signed in to, so
 * only HTTPS and only the configured private server are accepted.
 */
object ScriptSource {
    const val PATH = "/red-loop-webview.js"
    const val ASSET = "red-loop-webview.js"
    const val MAX_BYTES = 262_144
    const val DEFAULT_SERVER = "https://red-loop.redurbabat7.workers.dev"
    private const val CACHE_NAME = "red-loop-webview.js"
    private val REQUIRED = listOf("red-loop-root", "__RED_LOOP_HOST__", "rl-start", "rl-stop")

    /** Only HTTPS, and only the host of the configured private server. */
    fun url(server: String?): URL? {
        val address = server?.trim().orEmpty().ifEmpty { return null }
        val parsed = runCatching { URL(address) }.getOrNull() ?: return null
        if (!parsed.protocol.equals("https", ignoreCase = true)) return null
        if (parsed.host.isNullOrEmpty()) return null
        val base = parsed.path.trimEnd('/')
        return runCatching { URL("https", parsed.host, parsed.port, base + PATH) }.getOrNull()
    }

    /**
     * A content check, not a trust check: it rejects error pages and truncated
     * downloads. Trust rests on HTTPS to the owner's own Worker.
     */
    fun validate(text: String?): String? {
        if (text.isNullOrEmpty()) return null
        if (text.toByteArray(Charsets.UTF_8).size > MAX_BYTES) return null
        if (!REQUIRED.all { text.contains(it) }) return null
        if (!text.trim().endsWith(")();")) return null
        return text
    }

    fun version(body: String): String {
        body.lineSequence().take(24).forEach { line ->
            if (line.startsWith("// @version")) {
                val value = line.removePrefix("// @version").trim()
                if (value.isNotEmpty()) return value
            }
        }
        return "unbekannt"
    }

    /** Settings the script reads before it builds its panel. No credentials. */
    fun hostPrologue(bottomInset: Int): String =
        "window.__RED_LOOP_HOST__ = {app: 'android-webview', bottomInset: ${bottomInset.coerceIn(0, 240)}};\n"

    /** Cloud copy, else the last good download, else the bundled asset. */
    fun load(context: Context, server: String?, allowCloud: Boolean): LoopScript? {
        if (allowCloud) {
            val downloaded = validate(download(url(server)))
            if (downloaded != null) {
                runCatching { cacheFile(context).writeText(downloaded) }
                return LoopScript(ScriptOrigin.CLOUD, version(downloaded), downloaded)
            }
        }
        val cached = runCatching { cacheFile(context).takeIf { it.isFile }?.readText() }.getOrNull()
        validate(cached)?.let { return LoopScript(ScriptOrigin.CACHE, version(it), it) }
        val bundled = runCatching {
            context.assets.open(ASSET).use { it.readBytes().toString(Charsets.UTF_8) }
        }.getOrNull()
        validate(bundled)?.let { return LoopScript(ScriptOrigin.BUNDLE, version(it), it) }
        return null
    }

    private fun cacheFile(context: Context) = File(context.filesDir, CACHE_NAME)

    private fun download(url: URL?): String? {
        val target = url ?: return null
        var connection: HttpURLConnection? = null
        return try {
            connection = (target.openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 12_000
                requestMethod = "GET"
                setRequestProperty("User-Agent", "REDLoop-App")
            }
            if (connection.responseCode != 200) return null
            connection.inputStream.use { stream ->
                val bytes = stream.readBytes()
                if (bytes.size > MAX_BYTES) null else bytes.toString(Charsets.UTF_8)
            }
        } catch (error: Exception) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * The default WebView agent marks itself with "; wv". ChatGPT serves its
     * ordinary mobile layout to Chrome, and this view is Chromium.
     */
    fun userAgent(default: String?): String {
        val base = default.orEmpty()
        return if (base.contains("; wv)")) base.replace("; wv)", ")") else base
    }
}
