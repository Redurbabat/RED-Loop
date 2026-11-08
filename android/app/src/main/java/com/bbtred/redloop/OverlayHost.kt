package com.bbtred.redloop

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout

/**
 * An invisible window the service parks its web views in.
 *
 * A view with no window gets no reliable layout, so the page has no visible
 * composer and the panel reports that it cannot find the input field. Manual
 * measure and layout is not enough. Parking the views in a real window, even
 * one nobody can see, gives every chat a proper viewport while the activity
 * is gone and the screen is off.
 *
 * The window is fully transparent, cannot be touched and cannot take focus.
 * It needs the "display over other apps" permission; without it the service
 * falls back to manual layout, which only works reliably for the chat the
 * user is looking at.
 */
class OverlayHost(private val context: Context) {

    companion object {
        const val VIEWPORT_WIDTH = 1080
        const val VIEWPORT_HEIGHT = 1920
    }

    private var container: FrameLayout? = null

    val permitted: Boolean
        get() = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    val attached: Boolean get() = container != null

    /** Returns the parking container, creating the window on first use. */
    fun ensure(): FrameLayout? {
        container?.let { return it }
        if (!permitted) return null
        val manager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return null
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val params = WindowManager.LayoutParams(
            VIEWPORT_WIDTH, VIEWPORT_HEIGHT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
            alpha = 0f
        }
        val view = FrameLayout(context)
        return runCatching {
            manager.addView(view, params)
            container = view
            view
        }.getOrNull()
    }

    fun park(child: View) {
        val lot = ensure() ?: return
        (child.parent as? FrameLayout)?.takeIf { it !== lot }?.removeView(child)
        if (child.parent === lot) return
        lot.addView(child, FrameLayout.LayoutParams(VIEWPORT_WIDTH, VIEWPORT_HEIGHT))
    }

    fun release() {
        val view = container ?: return
        container = null
        view.removeAllViews()
        runCatching {
            (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.removeView(view)
        }
    }
}
