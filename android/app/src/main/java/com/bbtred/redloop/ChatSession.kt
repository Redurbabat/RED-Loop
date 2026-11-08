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
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

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
    private val script: LoopScript,
    private val onStateChanged: (ChatSession, LoopState, LoopState) -> Unit
) {
    companion object {
        private const val OFFSCREEN_WIDTH = 1080
        private const val OFFSCREEN_HEIGHT = 1920
        private const val PAUSE_JS =
            "(()=>{const b=document.querySelector('#red-loop-root .rl-stop');if(b&&!b.disabled){b.click();return true}return false})()"
        private const val REVEAL_JS =
            "(()=>{const r=document.getElementById('red-loop-root');if(!r)return false;r.classList.remove('rl-min');return true})()"
    }

    var title: String = "Chat $id"
        private set
    var state: LoopState = LoopState()
        private set

    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    val webView: WebView = WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.mediaPlaybackRequiresUserGesture = true
        settings.userAgentString = ScriptSource.userAgent(settings.userAgentString)
        isScrollbarFadingEnabled = true
    }

    init {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(Bridge(), "RedLoopHost")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url ?: return true
                if (ChatHosts.staysInApp(uri.host)) return false
                openOutside(view.context, uri)
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (!ChatHosts.isChat(Uri.parse(url ?: "").host)) return
                // Document-end injection. The script itself refuses a second
                // panel and every origin other than ChatGPT.
                view.evaluateJavascript(ScriptSource.hostPrologue(12) + script.body, null)
                title = conversationTitle(url)
            }
        }
        detachAndLayout()
        webView.loadUrl(ChatHosts.START)
    }

    /** Puts the view into an activity for display. */
    fun attachTo(container: ViewGroup) {
        (webView.parent as? ViewGroup)?.removeView(webView)
        container.addView(
            webView,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
    }

    /** Takes the view back out and restores a layout so the page keeps a viewport. */
    fun detachAndLayout() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.measure(
            View.MeasureSpec.makeMeasureSpec(OFFSCREEN_WIDTH, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(OFFSCREEN_HEIGHT, View.MeasureSpec.EXACTLY)
        )
        webView.layout(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT)
    }

    /** The panel's own Pause button, reachable from the app and the notification. */
    fun pause() = webView.evaluateJavascript(PAUSE_JS, null)

    fun revealPanel() = webView.evaluateJavascript(REVEAL_JS, null)

    fun reload() = webView.reload()

    fun goHome() = webView.loadUrl(ChatHosts.START)

    fun goBack(): Boolean {
        if (!webView.canGoBack()) return false
        webView.goBack()
        return true
    }

    fun destroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.removeJavascriptInterface("RedLoopHost")
        webView.loadUrl("about:blank")
        webView.destroy()
    }

    private fun conversationTitle(url: String?): String {
        val path = runCatching { Uri.parse(url ?: "").path.orEmpty() }.getOrDefault("")
        val conversation = Regex("(?:^|/)c/([^/]+)").find(path)?.groupValues?.getOrNull(1)
        return if (conversation.isNullOrEmpty()) "Chat $id" else "Chat " + conversation.take(4)
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
                onStateChanged(this@ChatSession, previous, parsed)
            }
        }
    }
}
