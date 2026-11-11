package com.bbtred.redloop

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class SignedScriptReleaseTest {
    private val script = "// ==UserScript==\n// @version 0.5.1\n// ==/UserScript==\n(() => {const marker='red-loop-root'; const host='__RED_LOOP_HOST__'; const b='rl-start rl-stop'; void marker; void host; void b;})();"

    @Test fun nodeSignedFixtureIsVerifiedNatively() {
        val pem = """-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzz7pHtAZHOTw/EHsW8zJgnDmGItC
OIuRRxjOS63xlkZ96DFaoLcPb77RXIyUQamMSadLNFwVkQ1wvG5iTzzlnA==
-----END PUBLIC KEY-----"""
        val manifest = SignedScriptRelease.Manifest("red-loop-script-v1", "0.5.1", 17,
            "7f04139db8ec17744e9fa79daf7306db3a283052f917d4cf3caa19737471e925",
            "MEUCIQCHQrSZXGvTkPxqRKN3C/tyYPz9P7YykG/d54fia4X70AIgGTmQMn8MXNIbboZq6/9da60IIbY+zBZFe7aOnanBGCk=")
        val original = script.toByteArray(Charsets.UTF_8)
        assertTrue(SignedScriptRelease.verify(original, manifest, pem, minimumSequence=17, minimumVersion="0.5.1"))
        assertFalse(SignedScriptRelease.verify(original, manifest, pem, minimumSequence=18))
        assertFalse(SignedScriptRelease.verify(original, manifest, pem, minimumVersion="0.5.2"))
        assertFalse(SignedScriptRelease.verify(original, manifest.copy(sequence=18), pem))
        assertFalse(SignedScriptRelease.verify(("// injected\n"+script).toByteArray(), manifest, pem))
        assertFalse(SignedScriptRelease.verify(original, manifest.copy(signature="wrong"), pem))
        assertFalse(SignedScriptRelease.verify(original, manifest, null))
    }

    @Test fun generatedP256KeySignsCanonicalMessageAndRejectsWrongKeys() {
        val generator = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }
        val key = generator.generateKeyPair()
        val other = generator.generateKeyPair()
        val digest = MessageDigest.getInstance("SHA-256").digest(script.toByteArray())
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val message = "RED_LOOP_SCRIPT_V1\n0.5.1\n2\n" + digest + "\n"
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(key.private); update(message.toByteArray()); sign()
        }
        fun pem(bytes: ByteArray) = "-----BEGIN PUBLIC KEY-----\n" +
            Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(bytes) + "\n-----END PUBLIC KEY-----"
        val manifest = SignedScriptRelease.Manifest("red-loop-script-v1", "0.5.1", 2, digest,
            Base64.getEncoder().encodeToString(signature))
        assertTrue(SignedScriptRelease.verify(script.toByteArray(), manifest, pem(key.public.encoded)))
        assertFalse(SignedScriptRelease.verify(script.toByteArray(), manifest, pem(other.public.encoded)))
        assertFalse(SignedScriptRelease.verify(script.toByteArray(), manifest.copy(version="0.5.2"), pem(key.public.encoded)))
    }
}
