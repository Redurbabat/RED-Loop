package com.bbtred.redloop

import android.content.Context
import java.io.File
import java.io.ByteArrayOutputStream
import android.util.AtomicFile
import org.json.JSONObject
import java.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

enum class ScriptOrigin(val label: String) {
    CLOUD("Cloudflare"), CACHE("Zwischenspeicher"), BUNDLE("App")
}

data class LoopScript(val origin: ScriptOrigin, val version: String, val body: String)

/**
 * The continuation script for the in-app ChatGPT views. The copy published by
 * remote and cached copies are accepted only when SHA-256 matches the
 * script bundled in the signed APK. A changed script requires a new trusted
 * build until a separate cryptographically signed update channel exists.
 */
object ScriptSource {
    const val PATH = "/red-loop-webview.js"
    const val ASSET = "red-loop-webview.js"
    const val MAX_BYTES = 262_144
    const val DEFAULT_SERVER = "https://red-loop.redurbabat7.workers.dev"
    private const val CACHE_NAME = "red-loop-webview.js"
    private const val SIGNED_CACHE = "red-loop-signed-cache.json"
    private const val PUBLIC_KEY_ASSET = "release-public.pem"
    private const val SIGNED_PREFS = "red-loop-signed-release"
    private const val MANIFEST_PATH = "/red-loop-webview.manifest.json"
    private val REQUIRED = listOf("red-loop-root", "__RED_LOOP_HOST__", "rl-start", "rl-stop")

    /** Strict manifest parser: no coercion and no unknown fields. */
    internal fun parseManifest(raw: String): SignedScriptRelease.Manifest? = runCatching {
        if (raw.toByteArray(Charsets.UTF_8).size !in 1..SignedScriptRelease.MAX_MANIFEST_BYTES) return null
        val obj = JSONObject(raw)
        val keys = mutableSetOf<String>()
        val names = obj.keys()
        while (names.hasNext()) keys += names.next()
        if (keys != setOf("format", "version", "sequence", "sha256", "signature")) return null
        val sequence = when (val value = obj.get("sequence")) {
            is Int -> value
            is Long -> if (value in 1..SignedScriptRelease.MAX_SEQUENCE.toLong()) value.toInt() else return null
            else -> return null
        }
        SignedScriptRelease.Manifest(
            format=obj.getString("format"),version=obj.getString("version"),
            sequence=sequence,sha256=obj.getString("sha256"),signature=obj.getString("signature")
        )
    }.getOrNull()

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
     * Structural checks complement the SHA-256 trust pin in load().
     */
    fun validate(text: String?): String? {
        if (text.isNullOrEmpty()) return null
        if (text.toByteArray(Charsets.UTF_8).size > MAX_BYTES) return null
        if (!REQUIRED.all { text.contains(it) }) return null
        if (!text.trim().endsWith(")();")) return null
        return text
    }

    /** Fail closed for untrusted remote/cache content despite matching markers. */
    fun trusted(candidate: String, bundled: String): Boolean {
        val digest = MessageDigest.getInstance("SHA-256")
        val expected = digest.digest(bundled.toByteArray(Charsets.UTF_8))
        val actual = digest.digest(candidate.toByteArray(Charsets.UTF_8))
        return MessageDigest.isEqual(actual, expected)
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

    /**
     * Settings the script reads before it builds its panel. No credentials.
     * The automatic options are seeded from here because the page's own
     * session storage does not survive the view being recreated.
     */
    fun hostPrologue(bottomInset: Int, autoStart: Boolean = false, autoRetry: Boolean = false): String =
        "window.__RED_LOOP_HOST__ = {app: 'android-webview', bottomInset: ${bottomInset.coerceIn(0, 240)}, " +
            "autoStart: $autoStart, autoRetry: $autoRetry};\n"

    /**
     * True when `candidate` is at least `reference`. An unreadable version
     * counts as older, so a surprise never wins over what ships with the app.
     */
    fun atLeast(candidate: String, reference: String): Boolean {
        val left = numbers(candidate) ?: return false
        val right = numbers(reference) ?: return true
        for (index in 0 until maxOf(left.size, right.size)) {
            val a = left.getOrElse(index) { 0 }
            val b = right.getOrElse(index) { 0 }
            if (a != b) return a > b
        }
        return true
    }

    private fun numbers(value: String): List<Int>? {
        val parts = value.trim().split('.')
        if (parts.isEmpty() || parts.any { part -> part.isEmpty() || !part.all(Char::isDigit) }) return null
        return parts.mapNotNull { it.toIntOrNull() }.takeIf { it.size == parts.size }
    }

    /**
     * Cloud copy, else the last good download, else the bundled asset — but
     * never a copy older than the one shipped with the app. A server that was
     * not redeployed must not quietly take features away.
     */
    @Synchronized
    fun load(context: Context, server: String?, allowCloud: Boolean): LoopScript? {
        val bundled = validate(
            runCatching { context.assets.open(ASSET).use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull()
        ) ?: return null // no trust anchor: do not load unverified remote/cache code
        val floor = version(bundled)
        val acceptable = { body: String ->
            atLeast(version(body), floor) && trusted(body, bundled)
        }

        // Trust anchors are shipped in APK assets, never accepted from HTTP.
        val trustedKey = runCatching {
            context.assets.open(PUBLIC_KEY_ASSET).bufferedReader().use { it.readText() }
        }.getOrNull()?.takeIf { it.isNotBlank() }
        if (trustedKey != null) {
            loadSigned(context, server, allowCloud, trustedKey, floor)?.let { return it }
        }

        if (allowCloud) {
            val downloaded = validate(download(url(server), MAX_BYTES)?.toString(Charsets.UTF_8))
            if (downloaded != null && acceptable(downloaded)) {
                runCatching { cacheFile(context).writeText(downloaded) }
                return LoopScript(ScriptOrigin.CLOUD, version(downloaded), downloaded)
            }
        }
        val cached = validate(runCatching { cacheFile(context).takeIf { it.isFile }?.readText() }.getOrNull())
        if (cached != null && acceptable(cached)) return LoopScript(ScriptOrigin.CACHE, version(cached), cached)
        return LoopScript(ScriptOrigin.BUNDLE, version(bundled), bundled)
    }

    private fun cacheFile(context: Context) = File(context.filesDir, CACHE_NAME)

    private fun fingerprint(key: String): String = MessageDigest.getInstance("SHA-256")
        .digest(key.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun minimumSequence(context: Context, keyId: String): Int? = runCatching {
        val prefs = context.getSharedPreferences(SIGNED_PREFS, Context.MODE_PRIVATE)
        val previous = prefs.getString("key-fingerprint", null)
        // A different trust anchor can only arrive in a newly installed APK.
        if (previous != null && previous != keyId) 1
        else {
            val saved = prefs.getInt("sequence", 0)
            if (saved !in 0..SignedScriptRelease.MAX_SEQUENCE) return null
            maxOf(saved, 1)
        }
    }.getOrNull()

    private fun persistSequence(context: Context, keyId: String, sequence: Int): Boolean = runCatching {
        context.getSharedPreferences(SIGNED_PREFS, Context.MODE_PRIVATE).edit()
            .putString("key-fingerprint",keyId).putInt("sequence",sequence).commit()
    }.getOrDefault(false)

    private fun manifestURL(server: String?): URL? {
        val scriptURL = url(server) ?: return null
        return runCatching {
            URL(scriptURL.protocol,scriptURL.host,scriptURL.port,scriptURL.path.removeSuffix(PATH)+MANIFEST_PATH)
        }.getOrNull()
    }

    private fun signedCache(context: Context) = AtomicFile(File(context.filesDir,SIGNED_CACHE))

    private fun storeSignedPair(context: Context, script: ByteArray, manifest: String): Boolean = runCatching {
        val record = JSONObject().put("script",Base64.getEncoder().encodeToString(script))
            .put("manifest",manifest).toString().toByteArray(Charsets.UTF_8)
        if (record.size>500_000) return false
        val file = signedCache(context)
        val stream = file.startWrite()
        try {
            stream.write(record)
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
        true
    }.getOrDefault(false)

    private fun readSignedPair(context: Context): Pair<ByteArray,String>? = runCatching {
        val file = signedCache(context)
        if (!file.baseFile.exists() || file.baseFile.length()>500_000) return null
        val obj = JSONObject(file.readFully().toString(Charsets.UTF_8))
        val script = Base64.getDecoder().decode(obj.getString("script"))
        if (script.size !in 1..MAX_BYTES) return null
        val manifest = obj.getString("manifest")
        if (manifest.toByteArray(Charsets.UTF_8).size>SignedScriptRelease.MAX_MANIFEST_BYTES) return null
        Pair(script,manifest)
    }.getOrNull()

    private fun loadSigned(context: Context, server: String?, allowCloud: Boolean,
                           publicKey: String, bundledVersion: String): LoopScript? {
        val keyId = fingerprint(publicKey)
        val floor = minimumSequence(context,keyId) ?: return null
        fun checked(script: ByteArray, text: String): SignedScriptRelease.Manifest? {
            val manifest = parseManifest(text) ?: return null
            if (!SignedScriptRelease.verify(script,manifest,publicKey,
                    minimumSequence=floor,minimumVersion=bundledVersion)) return null
            return manifest
        }
        if (allowCloud) {
            // The trust anchor is the APK, while the network is untrusted.
            val manifestText = download(manifestURL(server),SignedScriptRelease.MAX_MANIFEST_BYTES)
                ?.toString(Charsets.UTF_8)
            val script = if (manifestText != null) download(url(server),MAX_BYTES) else null
            if (manifestText != null && script != null) {
                val valid = checked(script,manifestText)
                if (valid != null && persistSequence(context,keyId,valid.sequence)) {
                    // Never make a partially written response a trusted cache.
                    storeSignedPair(context,script,manifestText)
                    return LoopScript(ScriptOrigin.CLOUD,valid.version,script.toString(Charsets.UTF_8))
                }
            }
        }
        val old = readSignedPair(context)
        if (old != null) {
            val valid = checked(old.first,old.second)
            if (valid != null) return LoopScript(ScriptOrigin.CACHE,valid.version,old.first.toString(Charsets.UTF_8))
        }
        return null
    }

    private fun download(url: URL?, limit: Int): ByteArray? {
        val target = url ?: return null
        var connection: HttpURLConnection? = null
        return try {
            connection = (target.openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 12_000
                requestMethod = "GET"
                instanceFollowRedirects = false
                setRequestProperty("User-Agent","REDLoop-App")
            }
            if (connection.responseCode != 200) return null
            connection.inputStream.use { stream ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val n = stream.read(buffer)
                    if (n < 0) break
                    if (out.size() + n > limit) return null
                    out.write(buffer,0,n)
                }
                out.toByteArray()
            }
        } catch (_: Exception) {
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
