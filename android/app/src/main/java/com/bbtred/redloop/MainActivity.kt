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
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Shows one chat at a time. Every chat belongs to the service, so switching
 * away from one, or leaving the app entirely, does not stop it.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var tabs: LinearLayout
    private lateinit var container: FrameLayout
    private lateinit var placeholder: TextView
    private lateinit var status: TextView
    private lateinit var pauseButton: Button

    private var service: LoopService? = null
    private var bound = false
    private var selected: ChatSession? = null

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
        status = findViewById(R.id.status)
        pauseButton = findViewById(R.id.pauseButton)
        pauseButton.setOnClickListener { selected?.pause() }

        requestNotificationPermission()
        ContextCompat.startForegroundService(this, Intent(this, LoopService::class.java))

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (selected?.goBack() != true) moveTaskToBack(true)
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
        renderContent(active, sessions)
        renderStatus(active)
    }

    private fun renderTabs(sessions: List<ChatSession>) {
        tabs.removeAllViews()
        sessions.forEach { session ->
            tabs.addView(tabButton(session))
        }
        if (sessions.size < LoopService.MAX_SESSIONS) {
            tabs.addView(Button(this).apply {
                text = "+"
                contentDescription = getString(R.string.add_chat)
                minimumHeight = dp(48)
                setOnClickListener {
                    if (service?.addSession() == null) {
                        Toast.makeText(context, "Noch kein Loop-Skript geladen.", Toast.LENGTH_SHORT).show()
                    } else {
                        selected = service?.sessions?.lastOrNull()
                        render()
                    }
                }
            })
        }
    }

    private fun tabButton(session: ChatSession) = Button(this).apply {
        val mark = if (session.state.running) "● " else ""
        text = mark + session.title
        isAllCaps = false
        minimumHeight = dp(48)
        alpha = if (session === selected) 1f else 0.6f
        setOnClickListener {
            if (session !== selected) {
                selected?.detachAndLayout()
                selected = session
            }
            render()
        }
        setOnLongClickListener {
            confirmClose(session)
            true
        }
    }

    private fun confirmClose(session: ChatSession) {
        AlertDialog.Builder(this)
            .setTitle("${session.title} schließen?")
            .setMessage("Der Lauf dieses Chats endet. Die Unterhaltung bei ChatGPT bleibt erhalten.")
            .setPositiveButton("Schließen") { _, _ ->
                if (session === selected) selected = null
                service?.removeSession(session)
                render()
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun renderContent(active: LoopService, sessions: List<ChatSession>) {
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
        (placeholder.parent as? FrameLayout)?.removeView(placeholder)
        placeholder.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER }
        return placeholder
    }

    private fun renderStatus(active: LoopService) {
        val current = selected
        val script = active.script
        val source = if (script == null) "Skript wird geladen …" else "Skript ${script.version} · ${script.origin.label}"
        status.text = if (current == null) source
        else "${current.state.status}\n${current.state.progress} · ${active.runningCount} von ${active.sessions.size} Chats aktiv · $source"
        pauseButton.isEnabled = current?.state?.running == true
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
