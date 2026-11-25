package ru.albedo.raidtalk

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var status: TextView
    private lateinit var xInput: EditText
    private lateinit var yInput: EditText
    private lateinit var intervalInput: EditText
    private val prefs by lazy { getSharedPreferences("clicker", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(16, 19, 27)
        window.navigationBarColor = android.graphics.Color.rgb(16, 19, 27)
        buildUi()
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(12, 12, 12, 8)
            setBackgroundColor(android.graphics.Color.rgb(16, 19, 27))
        }
        root.addView(TextView(this).apply {
            text = "ALBEDO  •  RAIDTALK AUTOCLICKER"
            textSize = 18f
            setTextColor(-1)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(4, 8, 4, 12)
        })
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        xInput = field("X", prefs.getInt("x", 500).toString())
        yInput = field("Y", prefs.getInt("y", 400).toString())
        intervalInput = field("мс", prefs.getLong("interval", 5000L).toString())
        controls.addView(xInput, weight())
        controls.addView(yInput, weight())
        controls.addView(intervalInput, weight())
        root.addView(controls)

        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        buttons.addView(Button(this).apply {
            text = "▶ СТАРТ"
            setOnClickListener { startClicker() }
        }, weight())
        buttons.addView(Button(this).apply {
            text = "■ СТОП"
            setOnClickListener {
                prefs.edit().putBoolean("running", false).apply()
                status.text = "Автокликер остановлен"
            }
        }, weight())
        buttons.addView(Button(this).apply {
            text = "ДОСТУП"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }, weight())
        root.addView(buttons)

        status = TextView(this).apply {
            text = "Откройте RaidTalk и настройте службу специальных возможностей"
            textSize = 12f
            setTextColor(0xFFB9C7DA.toInt())
            setPadding(4, 8, 4, 8)
        }
        root.addView(status)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            setBackgroundColor(android.graphics.Color.WHITE)
            loadUrl("https://app.raidtalk.ru")
        }
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    private fun startClicker() {
        val x = xInput.text.toString().toIntOrNull()?.coerceIn(0, 10000) ?: 500
        val y = yInput.text.toString().toIntOrNull()?.coerceIn(0, 10000) ?: 400
        val interval = intervalInput.text.toString().toLongOrNull()?.coerceIn(1000L, 3600000L) ?: 5000L
        prefs.edit().putInt("x", x).putInt("y", y).putLong("interval", interval).putBoolean("running", true).apply()
        status.text = if (isAccessibilityEnabled()) {
            "Автокликер запущен. RaidTalk должен оставаться на экране."
        } else {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            "Включите RaidTalk AutoClicker в специальных возможностях Android."
        }
    }

    private fun field(hintText: String, value: String) = EditText(this).apply {
        hint = hintText
        setSingleLine(true)
        setText(value)
        textSize = 13f
        setTextColor(-1)
        setHintTextColor(0xFF8997AA.toInt())
        setBackgroundColor(0xFF252E3D.toInt())
    }

    private fun weight() = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = 5 }

    private fun isAccessibilityEnabled(): Boolean {
        val expected = "$packageName/ru.albedo.raidtalk.RaidTalkAccessibilityService"
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
