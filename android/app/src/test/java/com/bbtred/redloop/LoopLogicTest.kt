package com.bbtred.redloop

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LoopStateTest {
    @Test
    fun `only a well formed state report is accepted`() {
        assertNull(LoopState.fromBridge(null))
        assertNull(LoopState.fromBridge(""))
        assertNull(LoopState.fromBridge("weiter"))
        assertNull(LoopState.fromBridge("""{"type":"command","run":true}"""))
        assertNull(LoopState.fromBridge("x".repeat(5000)))
        val state = LoopState.fromBridge(
            """{"type":"state","running":true,"count":7,"limit":10,"endless":true,"status":"Endlos aktiv"}"""
        )
        assertNotNull(state)
        assertEquals(7, state!!.count)
        assertTrue(state.running)
        assertEquals("7 / ∞", state.progress)
    }

    @Test
    fun `a long status is bounded and an empty one falls back`() {
        val long = LoopState.fromBridge("""{"type":"state","status":"${"x".repeat(400)}"}""")
        assertEquals(LoopState.MAX_STATUS, long!!.status.length)
        val empty = LoopState.fromBridge("""{"type":"state","status":"   "}""")
        assertEquals("Bereit", empty!!.status)
        assertEquals("0 / 10", empty.progress)
    }
}

class StopClassifierTest {
    private fun state(running: Boolean, count: Int = 0, limit: Int = 10, endless: Boolean = false, status: String) =
        LoopState(running = running, count = count, limit = limit, endless = endless, status = status)

    @Test
    fun `only a finished run is announced`() {
        val running = state(true, 2, status = "Endlos aktiv")
        assertNull(StopClassifier.notice(running, state(true, 3, status = "Fortsetzung gesendet"), "Chat 1"))
        assertNull(StopClassifier.notice(state(false, status = "Bereit"), state(false, status = "Antwortfehler erkannt"), "Chat 1"))
    }

    @Test
    fun `stops the user caused stay silent`() {
        val running = state(true, 4, endless = true, status = "Endlos aktiv")
        for (status in listOf(
            "Pausiert · Start setzt fort", "Pausiert: Seite verlassen",
            "Gestoppt: Konversation gewechselt", "Zurückgesetzt", "Bereit · 0/10", "   "
        )) {
            assertNull(status, StopClassifier.notice(running, state(false, 4, endless = true, status = status), "Chat 1"))
        }
    }

    @Test
    fun `completion question and limit are classified apart and name the chat`() {
        val running = state(true, 5, limit = 5, status = "Aktiv")
        val finished = StopClassifier.notice(running, state(false, 5, limit = 5, status = "Auftrag abgeschlossen"), "Chat ab12")
        assertEquals(StopNotice.Kind.FINISHED, finished!!.kind)
        assertTrue(finished.title.startsWith("Chat ab12"))
        assertTrue(finished.body.contains("5 / 5 Fortsetzungen"))

        assertEquals(
            StopNotice.Kind.QUESTION,
            StopClassifier.notice(running, state(false, 5, limit = 5, status = "Rückfrage – bitte Chat prüfen"), "Chat 1")!!.kind
        )
        assertEquals(
            StopNotice.Kind.LIMIT,
            StopClassifier.notice(running, state(false, 5, limit = 5, status = "Limit erreicht"), "Chat 1")!!.kind
        )
    }

    @Test
    fun `any other stop keeps its reason and counter`() {
        val running = state(true, 7, endless = true, status = "Endlos aktiv")
        for (status in listOf(
            "Antwortfehler erkannt", "Entwurf erkannt – nicht überschrieben",
            "Senden nicht verfügbar – bitte prüfen", "Keine neue Antwort – bitte ChatGPT prüfen"
        )) {
            val notice = StopClassifier.notice(running, state(false, 7, endless = true, status = status), "Chat 2")
            assertEquals(status, StopNotice.Kind.FAILURE, notice!!.kind)
            assertTrue(status, notice.body.contains(status))
            assertTrue(status, notice.body.contains("7 / ∞ Fortsetzungen"))
        }
    }
}

class ScriptSourceTest {
    private fun body(version: String = "0.4.0", marker: Boolean = true) = """
        // ==UserScript==
        // @version      $version
        // ==/UserScript==
        (() => {
          const host = window.${if (marker) "__RED_LOOP_HOST__" else "__OTHER__"};
          const root = 'red-loop-root';
          const controls = ['rl-start', 'rl-stop'];
          void host; void root; void controls;
        })();
    """.trimIndent()

    @Test
    fun `the script url is https only and keeps the published path`() {
        assertEquals(
            "https://example.workers.dev/red-loop-webview.js",
            ScriptSource.url("https://example.workers.dev").toString()
        )
        assertEquals(
            "https://example.workers.dev/red-loop-webview.js",
            ScriptSource.url("https://example.workers.dev/").toString()
        )
        assertNull(ScriptSource.url("http://example.workers.dev"))
        assertNull(ScriptSource.url("not a url"))
        assertNull(ScriptSource.url(null))
    }

    @Test
    fun `validation rejects error pages truncated downloads and foreign scripts`() {
        assertNotNull(ScriptSource.validate(body()))
        assertNull(ScriptSource.validate("<!doctype html><title>404</title>"))
        assertNull(ScriptSource.validate(""))
        assertNull(ScriptSource.validate(null))
        assertNull(ScriptSource.validate(body(marker = false)))
        assertNull(ScriptSource.validate(body().dropLast(20)))
        assertNull(ScriptSource.validate("a".repeat(ScriptSource.MAX_BYTES + 1)))
    }

    @Test
    fun `the version comes from the user script header`() {
        assertEquals("1.2.3", ScriptSource.version(body(version = "1.2.3")))
        assertEquals("unbekannt", ScriptSource.version("(() => {})();"))
    }

    @Test
    fun `the host prologue announces android and clamps the inset`() {
        assertEquals(
            "window.__RED_LOOP_HOST__ = {app: 'android-webview', bottomInset: 12};\n",
            ScriptSource.hostPrologue(12)
        )
        assertTrue(ScriptSource.hostPrologue(-5).contains("bottomInset: 0"))
        assertTrue(ScriptSource.hostPrologue(9000).contains("bottomInset: 240"))
    }

    @Test
    fun `the webview marker is removed from the user agent`() {
        assertEquals(
            "Mozilla/5.0 (Linux; Android 14)",
            ScriptSource.userAgent("Mozilla/5.0 (Linux; Android 14; wv)")
        )
    }
}

class ChatHostsTest {
    @Test
    fun `only chatgpt origins may report panel state`() {
        assertTrue(ChatHosts.isChat("chatgpt.com"))
        assertTrue(ChatHosts.isChat("chat.openai.com"))
        assertFalse(ChatHosts.isChat("chatgpt.com.example.com"))
        assertFalse(ChatHosts.isChat(null))
    }

    @Test
    fun `only chatgpt and its sign in hosts stay in the app`() {
        for (host in listOf("chatgpt.com", "auth.openai.com", "accounts.google.com", "appleid.apple.com", "cdn.oaistatic.com")) {
            assertTrue(host, ChatHosts.staysInApp(host))
        }
        for (host in listOf("example.com", "chatgpt.com.example.com", "openai.com.evil.test")) {
            assertFalse(host, ChatHosts.staysInApp(host))
        }
    }
}
