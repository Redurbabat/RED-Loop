package com.bbtred.redloop

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/** Pure verifier. Not connected to the script loader until a release public key
 * is pinned in the signed APK and a persisted anti-rollback counter exists. */
object SignedScriptRelease {
    const val FORMAT = "red-loop-script-v1"
    const val MAX_SCRIPT_BYTES = 262_144
    const val MAX_MANIFEST_BYTES = 4096
    const val MAX_SEQUENCE = 2_147_483_647

    data class Manifest(val format: String, val version: String, val sequence: Int, val sha256: String, val signature: String)

    private val semver = Regex("^(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})$")
    private val sha256Hex = Regex("^[a-f0-9]{64}$")

    private fun parts(value: String): List<Int>? {
        if (!semver.matches(value)) return null
        return value.split('.').map { it.toInt() }
    }

    fun verify(script: ByteArray, manifest: Manifest, publicKeyPEM: String?, minimumSequence: Int = 1, minimumVersion: String = "0.0.0"): Boolean {
        if (publicKeyPEM.isNullOrBlank() || minimumSequence !in 1..MAX_SEQUENCE || manifest.sequence !in 1..MAX_SEQUENCE ||
            manifest.format != FORMAT || !sha256Hex.matches(manifest.sha256) ||
            script.isEmpty() || script.size > MAX_SCRIPT_BYTES) return false
        val actualParts = parts(manifest.version) ?: return false
        val minimumParts = parts(minimumVersion) ?: return false
        if (manifest.sequence < minimumSequence) return false
        if (actualParts.zip(minimumParts).firstOrNull { (a,b) -> a != b }?.let { (a,b) -> a < b } == true) return false

        return runCatching {
            val decoded = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(script)).toString()
            if (!listOf("red-loop-root", "__RED_LOOP_HOST__", "rl-start", "rl-stop").all(decoded::contains) ||
                !decoded.trimEnd().endsWith(")();")) return false
            val actualVersion = decoded.lineSequence().take(25).firstOrNull { it.startsWith("// @version") }
                ?.removePrefix("// @version")?.trim() ?: return false
            if (actualVersion != manifest.version) return false
            val hash = MessageDigest.getInstance("SHA-256").digest(script)
                .joinToString("") { "%02x".format(it.toInt() and 0xff) }
            if (hash != manifest.sha256) return false
            val signature = Base64.getDecoder().decode(manifest.signature)
            if (signature.size !in 64..80 || Base64.getEncoder().encodeToString(signature) != manifest.signature) return false
            val pem = publicKeyPEM.trim()
            if (!pem.startsWith("-----BEGIN PUBLIC KEY-----") || !pem.endsWith("-----END PUBLIC KEY-----")) return false
            val encoded = pem.removePrefix("-----BEGIN PUBLIC KEY-----").removeSuffix("-----END PUBLIC KEY-----")
                .replace(Regex("\\s+"), "")
            val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(encoded))) as? ECPublicKey ?: return false
            // Do not accidentally accept a different EC curve with the same hash algorithm.
            val parameters = AlgorithmParameters.getInstance("EC")
            parameters.init(ECGenParameterSpec("secp256r1"))
            val required = parameters.getParameterSpec(ECParameterSpec::class.java)
            if (key.params.order != required.order || key.params.generator != required.generator ||
                key.params.cofactor != required.cofactor || key.params.curve != required.curve) return false
            val canonical = "RED_LOOP_SCRIPT_V1\n" + manifest.version + "\n" + manifest.sequence + "\n" + manifest.sha256 + "\n"
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(key)
                update(canonical.toByteArray(StandardCharsets.UTF_8))
                verify(signature)
            }
        }.getOrDefault(false)
    }
}
