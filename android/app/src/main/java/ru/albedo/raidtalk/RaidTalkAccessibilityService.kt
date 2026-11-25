package ru.albedo.raidtalk

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

class RaidTalkAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var lastTap = 0L

    private val ticker = object : Runnable {
        override fun run() {
            val prefs = getSharedPreferences("clicker", MODE_PRIVATE)
            if (prefs.getBoolean("running", false)) {
                val activePackage = rootInActiveWindow?.packageName?.toString()
                // Safety: never tap another app or a different foreground window.
                if (activePackage == packageName) {
                    val now = System.currentTimeMillis()
                    val interval = prefs.getLong("interval", 5000L).coerceIn(1000L, 3600000L)
                    if (now - lastTap >= interval) {
                        val path = Path().apply {
                            moveTo(prefs.getInt("x", 500).toFloat(), prefs.getInt("y", 400).toFloat())
                        }
                        val gesture = GestureDescription.Builder()
                            .addStroke(GestureDescription.StrokeDescription(path, 0, 80))
                            .build()
                        dispatchGesture(gesture, null, null)
                        lastTap = now
                    }
                }
            }
            handler.postDelayed(this, 250L)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        handler.post(ticker)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        super.onDestroy()
    }
}
