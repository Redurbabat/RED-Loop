package com.bbtred.redloop

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.os.Bundle
import android.os.IBinder
import android.text.InputType
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Shows one chat at a time, or an overview of all of them. Every chat belongs
 * to the service, so switching away from one, or leaving the app entirely,
 * does not stop it.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var tabs: LinearLayout
    private lateinit var container: FrameLayout
    private lateinit var placeholder: TextView
    private lateinit var overview: ScrollView
    private lateinit var overviewList: LinearLayout
    private lateinit var status: TextView
    private lateinit var pauseButton: Button
    private lateinit var overviewButton: Button

    private var service: LoopService? = null
    private var bound = false
    private var selected: ChatSession? = null
    private var showingOverview = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = (binder as? LoopService.LocalBinder)?.service
            bound = true
            service?.setListener(::render)
            render()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
            bound = false
        }
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Toast.makeText(
                    this,
                    "Ohne Mitteilungen hält Android den Hintergrundbetrieb nicht zuverlässig am Leben.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        tabs = findViewById(R.id.chatTabs)
        container = findViewById(R.id.webContainer)
        placeholder = findViewById(R.id.placeholder)
        overview = findViewById(R.id.overview)
        overviewList = findViewById(R.id.overviewList)
        status = findViewById(R.id.status)
        pauseButton = findViewById(R.id.pauseButton)
        overviewButton = findViewById(R.id.overviewButton)

        pauseButton.setOnClickListener { selected?.pause() }
        overviewButton.setOnClickListener {
            showingOverview = !showingOverview
            if (showingOverview) selected?.detachAndLayout()
            render()
        }

        requestNotificationPermission()
        ContextCompat.startForegroundService(this, Intent(this, LoopService::class.java))

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    showingOverview -> { showingOverview = false; render() }
                    selected?.goBack() == true -> Unit
                    else -> moveTaskToBack(true)
                }
            }
        })
    }

    override fun onStart() {
        super.onStart()
        bindService(Intent(this, LoopService::class.java), connection, Context.BIND_AUTO_CREATE)
    }

    override fun onStop() {
        // Hand the view back so the page keeps a viewport while nothing shows it.
        selected?.detachAndLayout()
        service?.setListener(null)
        if (bound) {
            unbindService(connection)
            bound = false
        }
        super.onStop()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun render() {
        val active = service ?: return
        // Picks up a permission the user just granted; returns at once once
        // every chat has its parking window.
        active.refreshParking()
        val sessions = active.sessions
        val current = selected
        if (current == null || !sessions.contains(current)) selected = sessions.firstOrNull()
        renderTabs(sessions)
        if (showingOverview) renderOverview(active, sessions) else renderChat(active, sessions)
        renderStatus(active)
    }

    private fun renderTabs(sessions: List<ChatSession>) {
        tabs.removeAllViews()
        sessions.forEach { tabs.addView(tabButton(it)) }
        if (sessions.size < LoopService.MAX_SESSIONS) {
            tabs.addView(Button(this).apply {
                text = "+"
                contentDescription = getString(R.string.add_chat)
                minimumHeight = dp(48)
                setOnClickListener {
                    val added = service?.addSession()
                    if (added == null) {
                        Toast.makeText(context, "Noch kein Loop-Skript geladen.", Toast.LENGTH_SHORT).show()
                    } else {
                        selected?.detachAndLayout()
                        selected = added
                        showingOverview = false
                        render()
                    }
                }
            })
        }
    }

    private fun tabButton(session: ChatSession) = Button(this).apply {
        text = (if (session.state.running) "● " else if (!session.loaded) "· " else "") + session.title
        isAllCaps = false
        minimumHeight = dp(48)
        alpha = if (session === selected && !showingOverview) 1f else 0.6f
        setOnClickListener { open(session) }
        setOnLongClickListener { chatMenu(session); true }
    }

    private fun open(session: ChatSession) {
        if (session !== selected) {
            selected?.detachAndLayout()
            selected = session
        }
        // A chat that gave its view back under memory pressure comes back.
        if (!session.loaded) session.load()
        showingOverview = false
        render()
    }

    private fun chatMenu(session: ChatSession) {
        val actions = listOf<Pair<String, () -> Unit>>(
            getString(R.string.rename) to { renameDialog(session) },
            getString(R.string.automatic) to { automaticDialog(session) },
            getString(R.string.reveal_panel) to { session.revealPanel() },
            getString(R.string.reload_page) to { session.reload() },
            getString(R.string.chat_list) to { session.goHome() },
            getString(R.string.unload_chat) to { unload(session) },
            getString(R.string.close_chat) to { confirmClose(session) }
        )
        AlertDialog.Builder(this)
            .setTitle(session.title)
            .setItems(actions.map { it.first }.toTypedArray()) { _, index -> actions[index].second() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** Both automatic options for one chat, in one place. */
    private fun automaticDialog(session: ChatSession) {
        val labels = arrayOf(getString(R.string.auto_start), getString(R.string.auto_retry))
        val chosen = booleanArrayOf(session.autoStart, session.autoRetry)
        AlertDialog.Builder(this)
            .setTitle("${session.title}: ${getString(R.string.automatic)}")
            .setMultiChoiceItems(labels, chosen) { _, index, value -> chosen[index] = value }
            .setPositiveButton(R.string.save) { _, _ ->
                session.setAutomatic(chosen[0], chosen[1])
                render()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun renameDialog(session: ChatSession) {
        val input = EditText(this).apply {
            setText(session.customName ?: session.title)
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.rename)
            .setMessage("Leer lassen, um wieder den Titel der ChatGPT-Unterhaltung zu verwenden.")
            .setView(input)
            .setPositiveButton(R.string.rename) { _, _ ->
                session.rename(input.text?.toString())
                render()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun unload(session: ChatSession) {
        if (session.unload()) {
            render()
        } else {
            Toast.makeText(this, "Ein laufender Chat wird nicht entladen. Erst pausieren.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun confirmClose(session: ChatSession) {
        AlertDialog.Builder(this)
            .setTitle("${session.title} schließen?")
            .setMessage("Der Lauf dieses Chats endet. Die Unterhaltung bei ChatGPT bleibt erhalten.")
            .setPositiveButton(R.string.close_chat) { _, _ ->
                if (session === selected) selected = null
                service?.removeSession(session)
                render()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun renderChat(active: LoopService, sessions: List<ChatSession>) {
        overview.visibility = View.GONE
        container.visibility = View.VISIBLE
        overviewButton.setText(R.string.overview)
        val current = selected
        active.visibleSession = current
        val view = current?.webView
        if (view == null) {
            container.removeAllViews()
            container.addView(placeholderView(active, sessions))
            return
        }
        if (view.parent !== container) {
            container.removeAllViews()
            current.attachTo(container)
        }
    }

    private fun placeholderView(active: LoopService, sessions: List<ChatSession>): View {
        placeholder.text = when {
            active.scriptError != null -> active.scriptError
            active.script == null -> getString(R.string.loading_script)
            sessions.isEmpty() -> "Mit + einen Chat öffnen."
            selected?.loaded == false -> ChatSession.UNLOADED_STATUS
            else -> ""
        }
        (placeholder.parent as? ViewGroup)?.removeView(placeholder)
        placeholder.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER }
        return placeholder
    }

    /** One place that shows how far every chat has got. */
    private fun renderOverview(active: LoopService, sessions: List<ChatSession>) {
        container.visibility = View.GONE
        overview.visibility = View.VISIBLE
        active.visibleSession = selected
        overviewButton.setText(R.string.back_to_chat)
        overviewList.removeAllViews()

        overviewList.addView(TextView(this).apply {
            text = "${active.runningCount} von ${sessions.size} Chats aktiv · ${active.totalContinuations} Fortsetzungen gesamt"
            textSize = 15f
            setPadding(0, 0, 0, dp(12))
        })
        overviewList.addView(Button(this).apply {
            setText(if (active.autopilotEnabled) R.string.autopilot_disable else R.string.autopilot_enable)
            isAllCaps = false
            minimumHeight = dp(52)
            setOnClickListener { active.autopilotEnabled = !active.autopilotEnabled }
        })
        overviewList.addView(TextView(this).apply {
            setText(if (active.autopilotEnabled) R.string.autopilot_status_on else R.string.autopilot_status_off)
            textSize = 12f
            alpha = 0.75f
            setPadding(0, dp(4), 0, dp(14))
        })
        renderReadiness(active)

        if (sessions.isEmpty()) {
            overviewList.addView(TextView(this).apply { text = "Noch kein Chat geöffnet." })
            return
        }

        sessions.forEach { session -> overviewList.addView(overviewRow(session)) }

        overviewList.addView(Button(this).apply {
            setText(R.string.pause_all)
            minimumHeight = dp(48)
            isEnabled = active.runningCount > 0
            setOnClickListener { service?.pauseAll() }
        })
        overviewList.addView(Button(this).apply {
            setText(R.string.unload_idle)
            isAllCaps = false
            minimumHeight = dp(48)
            setOnClickListener {
                val freed = active.unloadIdle()
                Toast.makeText(
                    this@MainActivity,
                    if (freed > 0) "$freed Chat(s) entladen" else "Nichts zu entladen",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
        renderLog(active)
    }

    /** What happened while nobody watched, newest first. */
    private fun renderLog(active: LoopService) {
        val entries = active.log
        overviewList.addView(TextView(this).apply {
            setText(R.string.history)
            textSize = 14f
            setPadding(0, dp(16), 0, dp(4))
        })
        if (entries.isEmpty()) {
            overviewList.addView(TextView(this).apply {
                text = "Noch nichts passiert."
                textSize = 12f
                alpha = 0.75f
            })
            return
        }
        entries.asReversed().take(20).forEach { entry ->
            overviewList.addView(TextView(this).apply {
                text = "${DateFormat.format("dd.MM. HH:mm", entry.time)}  ${entry.chat}: ${entry.text}"
                textSize = 12f
                alpha = 0.8f
                setPadding(0, dp(2), 0, dp(2))
            })
        }
        overviewList.addView(Button(this).apply {
            setText(R.string.clear_history)
            isAllCaps = false
            minimumHeight = dp(48)
            setOnClickListener { active.clearLog() }
        })
    }

    private fun overviewRow(session: ChatSession): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
            setOnClickListener { open(session) }
        }
        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            addView(TextView(context).apply {
                text = (if (session.state.running) "● " else "○ ") + session.title
                textSize = 15f
            })
            addView(TextView(context).apply {
                val marks = listOfNotNull(
                    "A".takeIf { session.autoStart },
                    "F".takeIf { session.autoRetry }
                ).joinToString("")
                text = "${session.state.progress} · ${session.state.status}" +
                    if (marks.isEmpty()) "" else "  [$marks]"
                textSize = 12f
                alpha = 0.75f
            })
        })
        row.addView(Button(this).apply {
            setText(R.string.pause)
            minimumHeight = dp(48)
            isEnabled = session.state.running
            setOnClickListener { session.pause() }
        })
        return row
    }

    /**
     * What Android still has to allow before chats nobody looks at keep
     * working. Each line turns into a button that opens the right settings
     * page, because the system never grants these from inside the app.
     */
    private fun renderReadiness(active: LoopService) {
        val missing = mutableListOf<Pair<String, () -> Unit>>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(getString(R.string.fix_notifications) to { requestNotificationPermission() })
        }
        if (!active.backgroundLayoutReady) {
            missing.add(getString(R.string.fix_overlay) to {
                openSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            })
        }
        if (!ignoresBatteryOptimizations()) {
            missing.add(getString(R.string.fix_battery) to {
                openSettings(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            })
        }
        missing.add(getString(R.string.fix_autostart) to {
            openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        })

        overviewList.addView(TextView(this).apply {
            setText(R.string.readiness_title)
            textSize = 14f
            setPadding(0, dp(4), 0, dp(4))
        })
        if (active.killCount > 0) {
            overviewList.addView(TextView(this).apply {
                text = "Das System hat die App ${active.killCount}× beendet, seit du zuletzt zurückgesetzt hast."
                textSize = 12f
                setPadding(0, 0, 0, dp(4))
            })
            overviewList.addView(Button(this).apply {
                text = "Zähler der Systemstopps zurücksetzen"
                isAllCaps = false
                minimumHeight = dp(48)
                setOnClickListener { active.clearKillCount() }
            })
        }
        overviewList.addView(TextView(this).apply {
            text = if (active.backgroundLayoutReady) {
                "Chats, die du nicht ansiehst, laufen weiter."
            } else {
                "Ohne „Über anderen Apps anzeigen\" arbeitet nur der sichtbare Chat zuverlässig weiter."
            }
            textSize = 12f
            alpha = 0.75f
            setPadding(0, 0, 0, dp(6))
        })
        missing.forEach { (label, action) ->
            overviewList.addView(Button(this).apply {
                text = label
                isAllCaps = false
                minimumHeight = dp(48)
                setOnClickListener { action() }
            })
        }
        overviewList.addView(Button(this).apply {
            text = if (active.resumeAfterStop) getString(R.string.resume_on) else getString(R.string.resume_off)
            isAllCaps = false
            minimumHeight = dp(48)
            setOnClickListener { active.resumeAfterStop = !active.resumeAfterStop }
        })
        overviewList.addView(Button(this).apply {
            text = if (active.startAtBoot) getString(R.string.boot_on) else getString(R.string.boot_off)
            isAllCaps = false
            minimumHeight = dp(48)
            setOnClickListener { active.startAtBoot = !active.startAtBoot }
        })
        overviewList.addView(Button(this).apply {
            text = if (active.useCloudScript) getString(R.string.script_cloud_on) else getString(R.string.script_cloud_off)
            isAllCaps = false
            minimumHeight = dp(48)
            setOnClickListener {
                active.useCloudScript = !active.useCloudScript
                active.reloadScript()
            }
        })
        overviewList.addView(Button(this).apply {
            setText(R.string.script_reload)
            isAllCaps = false
            minimumHeight = dp(48)
            setOnClickListener {
                active.reloadScript()
                Toast.makeText(this@MainActivity, "Laufende Chats behalten ihr Skript bis zum nächsten Neuladen.", Toast.LENGTH_LONG).show()
            }
        })
        overviewList.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(12))
        })
    }

    private fun ignoresBatteryOptimizations(): Boolean {
        val power = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return power.isIgnoringBatteryOptimizations(packageName)
    }

    private fun openSettings(action: String) {
        val intent = Intent(action, Uri.parse("package:$packageName"))
        if (runCatching { startActivity(intent); true }.getOrDefault(false)) return
        runCatching {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }.onFailure {
            Toast.makeText(this, "Einstellungsseite nicht gefunden.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun renderStatus(active: LoopService) {
        val script = active.script
        val source = if (script == null) "Skript wird geladen …" else "Skript ${script.version} · ${script.origin.label}"
        val current = selected
        status.text = when {
            showingOverview -> source
            current == null -> source
            else -> "${current.state.status}\n${current.state.progress} · ${active.runningCount} von ${active.sessions.size} Chats aktiv · $source"
        }
        pauseButton.isEnabled = !showingOverview && current?.state?.running == true
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
