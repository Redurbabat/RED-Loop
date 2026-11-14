package com.bbtred.redloop

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

interface SessionListener {
    fun onState(session: ChatSession, previous: LoopState, current: LoopState)
    /** Name, address or loaded state changed; nothing about the loop itself. */
    fun onDetails(session: ChatSession)
}

/**
 * One ChatGPT conversation in its own web view. The view belongs to the
 * service, not to the activity, so a conversation keeps working while the
 * activity is gone and the screen is off.
 *
 * A chat that is neither running nor on screen can give its view back under
 * memory pressure; it keeps its address, name and settings and builds the
 * view again when it is opened. A running chat is never unloaded.
 */
class ChatSession(
    val id: Int,
    private val context: Context,
    script: LoopScript,
    startUrl: String = ChatHosts.START,
    savedName: String? = null,
    autoStart: Boolean = false,
    autoRetry: Boolean = false,
    /** One-off: pick this chat's work back up after the system ended it. */
    private var resumeNow: Boolean = false,
    private val listener: SessionListener
) {
    companion object {
        private const val OFFSCREEN_WIDTH = OverlayHost.VIEWPORT_WIDTH
        private const val OFFSCREEN_HEIGHT = OverlayHost.VIEWPORT_HEIGHT
        private const val PAUSE_JS =
            "(()=>{const b=document.querySelector('#red-loop-root .rl-stop');if(b&&!b.disabled){b.click();return true}return false})()"
        private const val REVEAL_JS =
            "(()=>{const r=document.getElementById('red-loop-root');if(!r)return false;r.classList.remove('rl-min');r.style.left='';r.style.top='';r.style.right='';r.style.bottom='';return true})()"
        const val UNLOADED_STATUS = "Entladen – antippen zum Öffnen"
    }

    /** Where the view lives while no activity shows it. */
    var parkingLot: ViewGroup? = null

    /** Replaced when a newer script is fetched; used on the next injection. */
    var script: LoopScript = script

    /** Starts by itself once an answer is finished, and bridges errors. */
    var autoStart: Boolean = autoStart
        private set
    var autoRetry: Boolean = autoRetry
        private set

    var customName: String? = savedName
        private set
    private var pageTitle: String = "Chat $id"

    val title: String get() = customName?.takeIf { it.isNotBlank() } ?: pageTitle

    var state: LoopState = LoopState()
        private set

    /** The address worth restoring after a restart. */
    var restorableUrl: String? = startUrl.takeIf { SessionStore.isRestorable(it) }
        private set

    var webView: WebView? = null
        private set

    val loaded: Boolean get() = webView != null

    private val main = Handler(Looper.getMainLooper())

    init {
        build(startUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun build(url: String) {
        val view = WebView(context)
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.databaseEnabled = true
        view.settings.javaScriptCanOpenWindowsAutomatically = false
        view.settings.setSupportMultipleWindows(false)
        view.settings.mediaPlaybackRequiresUserGesture = true
        view.settings.userAgentString = ScriptSource.userAgent(view.settings.userAgentString)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
        view.addJavascriptInterface(Bridge(), "RedLoopHost")
        view.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(target: WebView?, title: String?) {
                // ChatGPT puts the conversation name in the document title.
                val cleaned = ChatTitles.clean(title, "Chat $id")
                if (cleaned == pageTitle) return
                pageTitle = cleaned
                listener.onDetails(this@ChatSession)
            }
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(target: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url ?: return true
                if (ChatHosts.staysInApp(uri.host)) return false
                openOutside(uri)
                return true
            }

            override fun onPageFinished(target: WebView, address: String?) {
                rememberUrl(address)
                if (!ChatHosts.isChat(Uri.parse(address ?: "").host)) return
                // Document-end injection. The script itself refuses a second
                // panel and every origin other than ChatGPT.
                target.evaluateJavascript(
                    ScriptSource.hostPrologue(12, autoStart || resumeNow, autoRetry) + script.body, null
                )
            }

            override fun doUpdateVisitedHistory(target: WebView, address: String?, isReload: Boolean) {
                // ChatGPT changes conversation without a page load.
                rememberUrl(address)
            }
        }
        webView = view
        detachAndLayout()
        view.loadUrl(url)
    }

    /** Builds the view again after it was given back. */
    fun load() {
        if (webView != null) return
        state = LoopState()
        build(restorableUrl ?: ChatHosts.START)
        listener.onDetails(this)
    }

    /**
     * Gives the view back to free memory. Refused while the chat is working,
     * because that would end its run without being asked to.
     */
    fun unload(): Boolean {
        if (state.running) return false
        val view = webView ?: return false
        webView = null
        resumeNow = false
        release(view)
        state = LoopState(status = UNLOADED_STATUS)
        listener.onDetails(this)
        return true
    }

    fun setAutomatic(start: Boolean, retry: Boolean) {
        autoStart = start
        autoRetry = retry
        syncAutomaticOptions()
        listener.onDetails(this)
    }

    private fun syncAutomaticOptions() {
        applyOption("rl-autostart", autoStart)
        applyOption("rl-retry", autoRetry)
    }

    private fun applyOption(id: String, value: Boolean) = webView?.evaluateJavascript(
        "(()=>{const b=document.getElementById('$id');if(!b||b.disabled)return false;" +
            "if(b.checked!==$value)b.click();return true})()",
        null
    )

    fun rename(name: String?) {
        customName = name?.trim()?.take(ChatTitles.MAX_LENGTH)?.takeIf { it.isNotEmpty() }
        listener.onDetails(this)
    }

    /** Puts the view into an activity for display. */
    fun attachTo(container: ViewGroup) {
        val view = webView ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        container.addView(
            view,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
    }

    /**
     * Takes the view out of the activity. A parking window gives the page a
     * real viewport; without one, manual layout is the best that can be done
     * and background chats may stall.
     */
    fun detachAndLayout() {
        val view = webView ?: return
        val lot = parkingLot
        if (lot != null) {
            if (view.parent === lot) return
            (view.parent as? ViewGroup)?.removeView(view)
            lot.addView(view, ViewGroup.LayoutParams(OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT))
            return
        }
        (view.parent as? ViewGroup)?.removeView(view)
        view.measure(
            View.MeasureSpec.makeMeasureSpec(OFFSCREEN_WIDTH, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(OFFSCREEN_HEIGHT, View.MeasureSpec.EXACTLY)
        )
        view.layout(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT)
    }

    /** The panel's own Pause button, reachable from the app and the notification. */
    fun pause() = webView?.evaluateJavascript(PAUSE_JS, null)

    /** Opens the panel and puts it back in its default corner. */
    fun revealPanel() = webView?.evaluateJavascript(REVEAL_JS, null)

    fun reload() = webView?.reload()

    fun goHome() = webView?.loadUrl(ChatHosts.START)

    fun goBack(): Boolean {
        val view = webView ?: return false
        if (!view.canGoBack()) return false
        view.goBack()
        return true
    }

    fun saved(running: Boolean = state.running): SavedChat? =
        restorableUrl?.let { SavedChat(it, customName, autoStart, autoRetry, running) }

    fun destroy() {
        webView?.let { release(it) }
        webView = null
    }

    private fun release(view: WebView) {
        (view.parent as? ViewGroup)?.removeView(view)
        view.removeJavascriptInterface("RedLoopHost")
        view.webChromeClient = null
        view.loadUrl("about:blank")
        view.destroy()
    }

    private fun rememberUrl(url: String?) {
        if (!SessionStore.isRestorable(url)) return
        if (url == restorableUrl) return
        restorableUrl = url
        listener.onDetails(this)
    }

    private fun openOutside(uri: Uri) {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https" && scheme != "mailto" && scheme != "tel") return
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private inner class Bridge {
        /** Called on a WebView worker thread, so everything hops to main. */
        @JavascriptInterface
        fun postMessage(message: String?) {
            val parsed = LoopState.fromBridge(message) ?: return
            main.post {
                val view = webView ?: return@post
                // Only the signed-in ChatGPT page may report panel status.
                if (!ChatHosts.isChat(Uri.parse(view.url ?: "").host)) return@post
                val previous = state
                state = parsed
                // The web panel disables automatic-option inputs while
                // running. Apply requested host options once it stops or
                // finishes its first injection, instead of silently losing
                // a global Autopilot toggle.
                if (!parsed.running && (previous.running || previous.status == LoopState().status)) {
                    syncAutomaticOptions()
                }
                listener.onState(this@ChatSession, previous, parsed)
            }
        }
    }
}
