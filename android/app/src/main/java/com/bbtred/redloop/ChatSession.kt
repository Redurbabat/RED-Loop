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
    /** Name or address changed; nothing about the loop itself. */
    fun onDetails(session: ChatSession)
}

/**
 * One ChatGPT conversation in its own web view. The view belongs to the
 * service, not to the activity, so a conversation keeps working while the
 * activity is gone and the screen is off. While no activity shows it, the
 * view is measured and laid out by hand, because a page with no layout has no
 * visible composer for the panel to use.
 */
class ChatSession(
    val id: Int,
    context: Context,
    script: LoopScript,
    startUrl: String = ChatHosts.START,
    savedName: String? = null,
    autoStart: Boolean = false,
    autoRetry: Boolean = false,
    /** One-off: pick this chat's work back up after the system ended it. */
    private val resumeNow: Boolean = false,
    private val listener: SessionListener
) {
    companion object {
        private const val OFFSCREEN_WIDTH = OverlayHost.VIEWPORT_WIDTH
        private const val OFFSCREEN_HEIGHT = OverlayHost.VIEWPORT_HEIGHT
        private const val PAUSE_JS =
            "(()=>{const b=document.querySelector('#red-loop-root .rl-stop');if(b&&!b.disabled){b.click();return true}return false})()"
        private const val REVEAL_JS =
            "(()=>{const r=document.getElementById('red-loop-root');if(!r)return false;r.classList.remove('rl-min');r.style.left='';r.style.top='';r.style.right='';r.style.bottom='';return true})()"
    }

    /** A name the user typed always wins over the page title. */
    var customName: String? = savedName
        private set
    private var pageTitle: String = "Chat $id"

    val title: String get() = customName?.takeIf { it.isNotBlank() } ?: pageTitle

    var state: LoopState = LoopState()
        private set

    /** The address worth restoring after a restart. */
    var restorableUrl: String? = startUrl.takeIf { SessionStore.isRestorable(it) }
        private set

    /** Where the view lives while no activity shows it. */
    var parkingLot: ViewGroup? = null

    /** Replaced when a newer script is fetched; used on the next injection. */
    var script: LoopScript = script

    /** Starts by itself once an answer is finished, and bridges errors. */
    var autoStart: Boolean = autoStart
        private set
    var autoRetry: Boolean = autoRetry
        private set

    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    val webView: WebView = WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.mediaPlaybackRequiresUserGesture = true
        settings.userAgentString = ScriptSource.userAgent(settings.userAgentString)
    }

    init {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(Bridge(), "RedLoopHost")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView?, title: String?) {
                // ChatGPT puts the conversation name in the document title.
                val cleaned = ChatTitles.clean(title, "Chat $id")
                if (cleaned == pageTitle) return
                pageTitle = cleaned
                listener.onDetails(this@ChatSession)
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url ?: return true
                if (ChatHosts.staysInApp(uri.host)) return false
                openOutside(view.context, uri)
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                rememberUrl(url)
                if (!ChatHosts.isChat(Uri.parse(url ?: "").host)) return
                // Document-end injection. The script itself refuses a second
                // panel and every origin other than ChatGPT.
                view.evaluateJavascript(
                    ScriptSource.hostPrologue(12, autoStart || resumeNow, autoRetry) + script.body, null
                )
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                // ChatGPT changes conversation without a page load.
                rememberUrl(url)
            }
        }
        detachAndLayout()
        webView.loadUrl(startUrl)
    }

    /**
     * Flips the option in the panel itself, so the page stays the one place
     * that owns the run. A running loop locks its options, as it always has.
     */
    fun setAutomatic(start: Boolean, retry: Boolean) {
        autoStart = start
        autoRetry = retry
        applyOption("rl-autostart", start)
        applyOption("rl-retry", retry)
        listener.onDetails(this)
    }

    private fun applyOption(id: String, value: Boolean) = webView.evaluateJavascript(
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
        (webView.parent as? ViewGroup)?.removeView(webView)
        container.addView(
            webView,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
    }

    /**
     * Takes the view out of the activity. A parking window gives the page a
     * real viewport; without one, manual layout is the best that can be done
     * and background chats may stall.
     */
    fun detachAndLayout() {
        val lot = parkingLot
        if (lot != null) {
            if (webView.parent === lot) return
            (webView.parent as? ViewGroup)?.removeView(webView)
            lot.addView(webView, ViewGroup.LayoutParams(OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT))
            return
        }
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.measure(
            View.MeasureSpec.makeMeasureSpec(OFFSCREEN_WIDTH, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(OFFSCREEN_HEIGHT, View.MeasureSpec.EXACTLY)
        )
        webView.layout(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT)
    }

    /** The panel's own Pause button, reachable from the app and the notification. */
    fun pause() = webView.evaluateJavascript(PAUSE_JS, null)

    /** Opens the panel and puts it back in its default corner. */
    fun revealPanel() = webView.evaluateJavascript(REVEAL_JS, null)

    fun reload() = webView.reload()

    fun goHome() = webView.loadUrl(ChatHosts.START)

    fun goBack(): Boolean {
        if (!webView.canGoBack()) return false
        webView.goBack()
        return true
    }

    fun saved(running: Boolean = state.running): SavedChat? =
        restorableUrl?.let { SavedChat(it, customName, autoStart, autoRetry, running) }

    fun destroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.removeJavascriptInterface("RedLoopHost")
        webView.webChromeClient = null
        webView.loadUrl("about:blank")
        webView.destroy()
    }

    private fun rememberUrl(url: String?) {
        if (!SessionStore.isRestorable(url)) return
        if (url == restorableUrl) return
        restorableUrl = url
        listener.onDetails(this)
    }

    private fun openOutside(context: Context, uri: Uri) {
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
                // Only the signed-in ChatGPT page may report panel status.
                if (!ChatHosts.isChat(Uri.parse(webView.url ?: "").host)) return@post
                val previous = state
                state = parsed
                listener.onState(this@ChatSession, previous, parsed)
            }
        }
    }
}
