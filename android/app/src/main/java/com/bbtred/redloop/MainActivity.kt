package com.bbtred.redloop

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.text.InputType
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
        text = (if (session.state.running) "● " else "") + session.title
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
        showingOverview = false
        render()
    }

    private fun chatMenu(session: ChatSession) {
        AlertDialog.Builder(this)
            .setTitle(session.title)
            .setItems(arrayOf(getString(R.string.rename), getString(R.string.close_chat))) { _, index ->
                if (index == 0) renameDialog(session) else confirmClose(session)
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
        if (current == null) {
            container.removeAllViews()
            container.addView(placeholderView(active, sessions))
            return
        }
        if (current.webView.parent !== container) {
            container.removeAllViews()
            current.attachTo(container)
        }
    }

    private fun placeholderView(active: LoopService, sessions: List<ChatSession>): View {
        placeholder.text = when {
            active.scriptError != null -> active.scriptError
            active.script == null -> getString(R.string.loading_script)
            sessions.isEmpty() -> "Mit + einen Chat öffnen."
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
        overviewButton.setText(R.string.back_to_chat)
        overviewList.removeAllViews()

        overviewList.addView(TextView(this).apply {
            text = "${active.runningCount} von ${sessions.size} Chats aktiv · ${active.totalContinuations} Fortsetzungen gesamt"
            textSize = 15f
            setPadding(0, 0, 0, dp(12))
        })

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
                text = "${session.state.progress} · ${session.state.status}"
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
