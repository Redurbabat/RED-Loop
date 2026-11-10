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
    fun `sha256 pin rejects a modified script even with a newer version and valid markers`() {
        val bundled = body(version = "1.0.0")
        val modified = "// modified remote source\n" + bundled
        assertNotNull(ScriptSource.validate(modified))
        assertTrue(ScriptSource.trusted(bundled, bundled))
        assertFalse(ScriptSource.trusted(modified, bundled))
        assertFalse(ScriptSource.trusted(body(version = "9.9.9"), bundled))
    }

    @Test
    fun `the version comes from the user script header`() {
        assertEquals("1.2.3", ScriptSource.version(body(version = "1.2.3")))
        assertEquals("unbekannt", ScriptSource.version("(() => {})();"))
    }

    @Test
    fun `the host prologue announces android and clamps the inset`() {
        assertEquals(
            "window.__RED_LOOP_HOST__ = {app: 'android-webview', bottomInset: 12, autoStart: false, autoRetry: false};\n",
            ScriptSource.hostPrologue(12)
        )
        assertTrue(ScriptSource.hostPrologue(12, autoStart = true).contains("autoStart: true"))
        assertTrue(ScriptSource.hostPrologue(12, autoRetry = true).contains("autoRetry: true"))
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

class ChatTitlesTest {
    @Test
    fun `the conversation name is taken from the page title`() {
        assertEquals("Projektplan", ChatTitles.clean("Projektplan", "Chat 1"))
        assertEquals("Projektplan", ChatTitles.clean("ChatGPT - Projektplan", "Chat 1"))
        assertEquals("Projektplan", ChatTitles.clean("Projektplan | ChatGPT", "Chat 1"))
    }

    @Test
    fun `a title that says nothing falls back to the tab name`() {
        assertEquals("Chat 3", ChatTitles.clean("ChatGPT", "Chat 3"))
        assertEquals("Chat 3", ChatTitles.clean("   ", "Chat 3"))
        assertEquals("Chat 3", ChatTitles.clean(null, "Chat 3"))
    }

    @Test
    fun `a long title is shortened so the tab stays readable`() {
        val cleaned = ChatTitles.clean("x".repeat(100), "Chat 1")
        assertEquals(ChatTitles.MAX_LENGTH, cleaned.length)
        assertTrue(cleaned.endsWith("…"))
    }
}

class SessionStoreTest {
    @Test
    fun `only real conversation addresses are worth restoring`() {
        assertTrue(SessionStore.isRestorable("https://chatgpt.com/c/abc"))
        assertFalse(SessionStore.isRestorable("https://chatgpt.com.example.com/c/abc"))
        assertFalse(SessionStore.isRestorable("http://chatgpt.com/c/abc"))
        assertFalse(SessionStore.isRestorable("https://accounts.google.com/signin"))
        assertFalse(SessionStore.isRestorable(null))
    }

    @Test
    fun `chats survive a restart with their address and their name`() {
        val chats = listOf(
            SavedChat("https://chatgpt.com/c/one", "Projektplan", autoStart = true, autoRetry = true),
            SavedChat("https://chatgpt.com/c/two", null)
        )
        val restored = SessionStore.decode(SessionStore.encode(chats))
        assertEquals(2, restored.size)
        assertEquals("https://chatgpt.com/c/one", restored[0].url)
        assertEquals("Projektplan", restored[0].name)
        assertTrue("the automatic start comes back", restored[0].autoStart)
        assertTrue("bridging errors comes back", restored[0].autoRetry)
        assertNull(restored[1].name)
        assertFalse("a chat without automation stays manual", restored[1].autoStart)
        assertFalse(restored[1].autoRetry)
    }

    @Test
    fun `broken or foreign entries are dropped instead of restored`() {
        assertTrue(SessionStore.decode(null).isEmpty())
        assertTrue(SessionStore.decode("").isEmpty())
        assertTrue(SessionStore.decode("not json").isEmpty())
        // A stored entry with no automation flags must not switch itself on.
        val legacy = SessionStore.decode("""[{"url":"https://chatgpt.com/c/old"}]""")
        assertEquals(1, legacy.size)
        assertFalse(legacy[0].autoStart)
        assertFalse(legacy[0].autoRetry)
        assertTrue(SessionStore.decode("""[{"url":"https://evil.test/c/x"}]""").isEmpty())
        assertEquals(1, SessionStore.decode("""[{"url":"https://evil.test/x"},{"url":"https://chatgpt.com/c/ok"}]""").size)
    }

    @Test
    fun `no more chats are restored than the app can hold`() {
        val many = (1..20).map { SavedChat("https://chatgpt.com/c/$it", null) }
        assertEquals(LoopService.MAX_SESSIONS, SessionStore.decode(SessionStore.encode(many)).size)
    }
}

class ResumeAfterStopTest {
    @Test
    fun `a chat that was working when the app ended is marked for resuming`() {
        val chats = listOf(
            SavedChat("https://chatgpt.com/c/one", null, wasRunning = true),
            SavedChat("https://chatgpt.com/c/two", null, wasRunning = false)
        )
        val restored = SessionStore.decode(SessionStore.encode(chats))
        assertTrue("the interrupted chat is recognised", restored[0].wasRunning)
        assertFalse("a chat the user had stopped stays stopped", restored[1].wasRunning)
    }

    @Test
    fun `an entry from before this feature never resumes by itself`() {
        val restored = SessionStore.decode("""[{"url":"https://chatgpt.com/c/old","name":"Alt"}]""")
        assertEquals(1, restored.size)
        assertFalse(restored[0].wasRunning)
    }
}

class EventLogTest {
    @Test
    fun `the newest entries survive and the oldest fall away`() {
        var entries = emptyList<LogEntry>()
        for (index in 1..(EventLog.MAX + 10)) {
            entries = EventLog.append(entries, LogEntry(index.toLong(), "Chat 1", "Ereignis $index"))
        }
        assertEquals(EventLog.MAX, entries.size)
        assertEquals("Ereignis ${EventLog.MAX + 10}", entries.last().text)
        assertEquals("Ereignis 11", entries.first().text)
    }

    @Test
    fun `a long line is shortened instead of filling the storage`() {
        val entries = EventLog.append(emptyList(), LogEntry(1L, "Chat 1", "x".repeat(500)))
        assertEquals(120, entries.first().text.length)
    }

    @Test
    fun `the history survives a restart`() {
        val entries = listOf(
            LogEntry(1_700_000_000_000L, "Projektplan", "Gestartet"),
            LogEntry(1_700_000_060_000L, "Projektplan", "Auftrag abgeschlossen · 12 / ∞")
        )
        val restored = EventLog.decode(EventLog.encode(entries))
        assertEquals(2, restored.size)
        assertEquals("Projektplan", restored[1].chat)
        assertEquals("Auftrag abgeschlossen · 12 / ∞", restored[1].text)
        assertEquals(1_700_000_060_000L, restored[1].time)
    }

    @Test
    fun `broken storage is dropped rather than shown`() {
        assertTrue(EventLog.decode(null).isEmpty())
        assertTrue(EventLog.decode("not json").isEmpty())
        assertTrue(EventLog.decode("""[{"c":"Chat","m":"ohne Zeit"}]""").isEmpty())
        assertTrue(EventLog.decode("""[{"t":1,"c":"Chat","m":"   "}]""").isEmpty())
        assertEquals("Chat", EventLog.decode("""[{"t":1,"m":"ohne Namen"}]""").first().chat)
    }
}

class ScriptVersionTest {
    @Test
    fun `a newer or equal version is accepted`() {
        assertTrue(ScriptSource.atLeast("0.4.0", "0.4.0"))
        assertTrue(ScriptSource.atLeast("0.4.1", "0.4.0"))
        assertTrue(ScriptSource.atLeast("0.5", "0.4.9"))
        assertTrue(ScriptSource.atLeast("1.0.0", "0.9.9"))
        assertTrue(ScriptSource.atLeast("0.4.0.1", "0.4.0"))
    }

    @Test
    fun `an older server copy must not beat the one shipped with the app`() {
        assertFalse(ScriptSource.atLeast("0.3.9", "0.4.0"))
        assertFalse(ScriptSource.atLeast("0.4.0", "0.4.1"))
        assertFalse(ScriptSource.atLeast("0.9.9", "1.0.0"))
    }

    @Test
    fun `an unreadable version counts as older`() {
        assertFalse(ScriptSource.atLeast("unbekannt", "0.4.0"))
        assertFalse(ScriptSource.atLeast("", "0.4.0"))
        assertFalse(ScriptSource.atLeast("0.4.x", "0.4.0"))
        // With nothing to compare against, anything is allowed through.
        assertTrue(ScriptSource.atLeast("0.4.0", "unbekannt"))
    }
}
