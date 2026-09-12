// Khagol — Hindu Panchang & Sky Map. Native shell: one hardware-accelerated WebView serving the
// bundled web app (assets/) via WebViewAssetLoader on the secure appassets origin. The app has NO
// INTERNET permission — every byte comes from the APK; the only device capability bridged in is
// optional geolocation (the web app's "Here" button) and a save-PNG hook for the export feature.
package io.github.mohancloudworld.khagol

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.io.File
import java.io.FileOutputStream

private const val ORIGIN = "appassets.androidplatform.net"
private const val START_URL = "https://$ORIGIN/app.html"

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null

    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            val granted = grants.values.any { it }
            geoCallback?.invoke(geoOrigin, granted, false)
            geoCallback = null; geoOrigin = null
        }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) toast("Notifications blocked — reminders won't show")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor("#0b0e1a"))

        // targetSdk 35 draws edge-to-edge, putting the web app's top UI under the status bar
        // (its taps never arrive). WebView is documented to IGNORE its own padding, so insets
        // must be applied to a wrapper: pad this container by system bars + display cutout and
        // let its dark background fill the strips.
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#0b0e1a"))
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            // IME too: with enforced edge-to-edge, adjustResize does nothing by itself — without
            // this the keyboard OVERLAYS the page and hides bottom sheets / focused inputs.
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        with(webView.settings) {
            javaScriptEnabled = true          // the whole app is JS
            domStorageEnabled = true          // settings/saved-events live in localStorage
            allowFileAccess = false           // assets go through the loader, never file://
            allowContentAccess = false
            setGeolocationEnabled(true)
            textZoom = 100                    // ignore system font scale inside the sky UI
        }

        // Serve assets/ as the site root on the secure appassets origin, so the app's absolute
        // paths (/css/…, /js/…) and ES-module/WASM loading all work offline. MIME types are fixed
        // up explicitly: Chromium refuses module scripts and WASM served as octet-stream.
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ORIGIN)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest,
            ): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)?.also { resp ->
                    mimeFor(request.url.path)?.let { resp.mimeType = it }
                }

            // Single-page app on one origin; anything else (there is nothing else) is dropped.
            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest,
            ): Boolean = request.url.host != ORIGIN
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String, callback: GeolocationPermissions.Callback,
            ) {
                val has = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
                if (has) { callback.invoke(origin, true, false); return }
                geoCallback = callback; geoOrigin = origin
                locationPermission.launch(arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ))
            }
        }

        webView.addJavascriptInterface(SaveBridge(), "KhagolAndroid")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) webView.loadUrl(START_URL)
        else webView.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /** File-save hooks for the web app (PNG snapshots, .ics calendar exports) -> Downloads. */
    inner class SaveBridge {
        @JavascriptInterface
        fun savePng(name: String, base64: String) = saveFile(name, "image/png", base64)

        /** Wake alarms with daily-changing times: the web app sends ~45 days of exact ring
         *  instants (local wall clock) for sunrise / brahma muhurta; Wake chains one exact
         *  alarm per entry so the time tracks the daily drift. */
        @JavascriptInterface
        fun setWakeAlarms(planJson: String, enabled: Boolean) {
            Wake.saveConfig(this@MainActivity, planJson, enabled)
            if (enabled && Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.POST_NOTIFICATIONS,
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                runOnUiThread { notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }
            }
        }

        /** Immediate test of the wake-alarm ring (sound/vibration/permission check). */
        @JavascriptInterface
        fun testWakeAlarm() {
            Wake.ring(this@MainActivity, "Test ring — Khagol")
        }

        /** One-time Clock-app alarm at the next occurrence of hour:minute (the web app computes
         *  tomorrow's sunrise / brahma-muhurta for its location). EXTRA_SKIP_UI sets it silently;
         *  the user manages/deletes it in the Clock app like any alarm. */
        @JavascriptInterface
        fun setClockAlarm(hour: Int, minute: Int, label: String) {
            val intent = Intent(android.provider.AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(android.provider.AlarmClock.EXTRA_HOUR, hour.coerceIn(0, 23))
                putExtra(android.provider.AlarmClock.EXTRA_MINUTES, minute.coerceIn(0, 59))
                putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, label)
                putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, true)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runOnUiThread {
                try {
                    startActivity(intent)
                    toast("Alarm set %02d:%02d — %s".format(hour, minute, label))
                } catch (_: Exception) {
                    toast("No clock app found")
                }
            }
        }

        /** Daily reminders: the web app sends the next ~12 months of festival / saved-tithi
         *  dates as JSON [{date:"YYYY-MM-DD", title, detail}] + the hour to notify at. Stored
         *  in prefs; a chained daily alarm posts matching notifications — fully offline. */
        @JavascriptInterface
        fun setNotifications(planJson: String, hour: Int, enabled: Boolean) {
            Notifier.saveConfig(this@MainActivity, planJson, hour, enabled)
            if (enabled && Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.POST_NOTIFICATIONS,
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                runOnUiThread { notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }
            }
        }

        /** One-tap calendar import: write the .ics to the share cache and open the system
         *  chooser on it (picking Google Calendar imports the events immediately). Falls back
         *  to a plain Downloads save when nothing can handle text/calendar. */
        @JavascriptInterface
        fun openIcs(name: String, base64: String) {
            val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "khagol.ics" }
            try {
                val dir = File(cacheDir, "share").apply { mkdirs() }
                val f = File(dir, safe)
                FileOutputStream(f).use { it.write(Base64.decode(base64, Base64.DEFAULT)) }
                val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", f)
                val view = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "text/calendar")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                runOnUiThread {
                    try {
                        startActivity(Intent.createChooser(view, "Import events into…"))
                    } catch (_: Exception) {
                        saveFile(name, "text/calendar", base64)
                    }
                }
            } catch (e: Exception) {
                toast("Export failed: ${e.message}")
            }
        }

        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "khagol.bin" }
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                    }
                    val uri = contentResolver.insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values,
                    ) ?: throw IllegalStateException("MediaStore insert failed")
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS,
                    )
                    dir.mkdirs()
                    FileOutputStream(File(dir, safe)).use { it.write(bytes) }
                }
                toast("Saved to Downloads: $safe")
            } catch (e: Exception) {
                toast("Save failed: ${e.message}")
            }
        }
    }

    private fun toast(msg: String) =
        runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }
}

/** Chromium is strict about these; MimeTypeMap misses .mjs/.wasm and module JS must be JS. */
private fun mimeFor(path: String?): String? = when (path?.substringAfterLast('.', "")) {
    "mjs", "js" -> "text/javascript"
    "wasm" -> "application/wasm"
    "json" -> "application/json"
    "svg" -> "image/svg+xml"
    "woff2" -> "font/woff2"
    else -> null   // html/css/png etc. are guessed correctly by the handler
}
