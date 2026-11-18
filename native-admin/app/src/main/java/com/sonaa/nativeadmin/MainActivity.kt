package com.sonaa.nativeadmin
import android.Manifest
import android.content.Intent
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
class MainActivity : ComponentActivity() {
    private lateinit var adminWebView: android.webkit.WebView
    private var configuredAdminPanelUrl: String = ""
    private var pendingSetupIntent: Intent? = null
    private var fcmReceiverRegistered = false
    private var latestFcmToken: String? = null
    private var pendingFileCallback: android.webkit.ValueCallback<Array<android.net.Uri>>? = null

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = pendingFileCallback
        pendingFileCallback = null
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            val selected = mutableListOf<android.net.Uri>()
            data?.clipData?.let { clip ->
                for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let(selected::add)
            }
            if (selected.isEmpty()) data?.data?.let(selected::add)
            callback?.onReceiveValue(selected.takeIf { it.isNotEmpty() }?.toTypedArray())
        } else {
            callback?.onReceiveValue(null)
        }
    }

    private val fcmTokenReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: Intent?) {
            intent?.getStringExtra("token")?.takeIf { it.isNotBlank() }?.let {
                latestFcmToken = it
                syncFcmTokenIntoWebView()
            }
        }
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        initializeFirebase()

        val tokenFilter = android.content.IntentFilter(SonaaMessagingService.ACTION_TOKEN_REFRESHED)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(fcmTokenReceiver, tokenFilter, android.content.Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(fcmTokenReceiver, tokenFilter)
        }
        fcmReceiverRegistered = true

        SonaaMessagingService.createChannels(getSystemService(NotificationManager::class.java))
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        adminWebView = android.webkit.WebView(this).apply {
            setBackgroundColor(android.graphics.Color.WHITE)
            isVerticalScrollBarEnabled = true
            overScrollMode = android.view.View.OVER_SCROLL_NEVER
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
                userAgentString = userAgentString + " HamzawyAdminNative"
                if (Build.VERSION.SDK_INT >= 26) safeBrowsingEnabled = true
            }
            android.webkit.CookieManager.getInstance().setAcceptCookie(true)
            android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)

            webViewClient = object : android.webkit.WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: android.webkit.WebView?,
                    request: android.webkit.WebResourceRequest
                ): Boolean {
                    return handleWebViewNavigation(request.url)
                }

                @Suppress("DEPRECATION")
                override fun shouldOverrideUrlLoading(view: android.webkit.WebView?, url: String?): Boolean {
                    if (url.isNullOrBlank()) return true
                    return handleWebViewNavigation(android.net.Uri.parse(url))
                }

                override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    if (!url.isNullOrBlank() && isAllowedAdminUrl(android.net.Uri.parse(url))) {
                        suppressBrowserPushPrompt()
                        syncFcmTokenIntoWebView()
                    }
                }

                override fun onReceivedSslError(
                    view: android.webkit.WebView?,
                    handler: android.webkit.SslErrorHandler?,
                    error: android.net.http.SslError?
                ) {
                    handler?.cancel()
                }
            }

            webChromeClient = object : android.webkit.WebChromeClient() {
                override fun onShowFileChooser(
                    webView: android.webkit.WebView?,
                    filePathCallback: android.webkit.ValueCallback<Array<android.net.Uri>>?,
                    fileChooserParams: android.webkit.WebChromeClient.FileChooserParams?
                ): Boolean {
                    if (filePathCallback == null || fileChooserParams == null) return false
                    pendingFileCallback?.onReceiveValue(null)
                    pendingFileCallback = filePathCallback
                    return try {
                        val chooserIntent = fileChooserParams.createIntent().apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            putExtra(
                                Intent.EXTRA_ALLOW_MULTIPLE,
                                fileChooserParams.mode == android.webkit.WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
                            )
                        }
                        filePicker.launch(chooserIntent)
                        true
                    } catch (_: Exception) {
                        pendingFileCallback = null
                        filePathCallback.onReceiveValue(null)
                        false
                    }
                }
            }
        }

        setContentView(adminWebView)
        loadAdminTarget(intent)

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            latestFcmToken = token
            getSharedPreferences("sonaa_admin_session", MODE_PRIVATE)
                .edit().putString("pending_fcm_token", token).apply()
            syncFcmTokenIntoWebView()
        }
    }

    private fun handleWebViewNavigation(uri: android.net.Uri): Boolean {
        if (isAllowedAdminUrl(uri)) return false

        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        if (scheme == "tel") {
            runCatching { startActivity(Intent(Intent.ACTION_DIAL, uri)) }
            return true
        }

        // Open WhatsApp links outside the restricted admin WebView.
        val isWhatsAppLink = scheme == "https" &&
            host in setOf("wa.me", "api.whatsapp.com", "web.whatsapp.com")
        if (isWhatsAppLink) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            return true
        }
        return true
    }

    private fun isAllowedAdminUrl(uri: android.net.Uri): Boolean {
        val configuredPath = android.net.Uri.parse(configuredAdminPanelUrl).path
        val isAdminPanel = !configuredPath.isNullOrBlank() && uri.path == configuredPath
        val passwordMode = uri.getQueryParameter("mode")
        val isAdminPasswordSupport = uri.path == "/password.html" &&
            uri.getQueryParameter("role") == "admin" &&
            passwordMode in setOf("recovery", "support", "account", "change")
        // The admin client list opens this protected profile editor using
        // /password.html?role=admin&mode=admin-edit&targetRole=client&targetId=...
        val targetRole = uri.getQueryParameter("targetRole")
        val targetId = uri.getQueryParameter("targetId").orEmpty()
        val isAdminClientProfileEdit = uri.path == "/password.html" &&
            uri.getQueryParameter("role") == "admin" &&
            passwordMode == "admin-edit" &&
            targetRole == "client" &&
            targetId.matches(Regex("[A-Za-z0-9_-]{1,128}"))
        return uri.scheme.equals("https", ignoreCase = true) &&
            uri.host.equals(ADMIN_HOST, ignoreCase = true) &&
            (uri.port == -1 || uri.port == 443) &&
            (isAdminPanel || isAdminPasswordSupport || isAdminClientProfileEdit)
    }

    private fun loadAdminTarget(sourceIntent: Intent?) {
        configuredAdminPanelUrl = resolveAdminPanelUrl()
        if (!isValidAdminPanelUrl(configuredAdminPanelUrl)) {
            pendingSetupIntent = sourceIntent
            showAdminUrlSetup()
            return
        }
        val requestedLink = sourceIntent?.getStringExtra("link").orEmpty()
        val destination = sourceIntent?.getStringExtra("destination").orEmpty()
        val candidate = runCatching {
            val uri = if (requestedLink.startsWith("/")) {
                android.net.Uri.parse(ADMIN_ORIGIN + requestedLink)
            } else {
                android.net.Uri.parse(requestedLink)
            }
            uri.takeIf(::isAllowedAdminUrl)
        }.getOrNull()

        val target = candidate?.toString() ?: buildString {
            append(configuredAdminPanelUrl)
            if (destination.isNotBlank() && destination.matches(Regex("[A-Za-z][A-Za-z0-9_-]{0,40}"))) {
                append("#")
                append(destination)
            }
        }
        if (::adminWebView.isInitialized) {
            setContentView(adminWebView)
            adminWebView.loadUrl(target)
        }
    }

    private fun suppressBrowserPushPrompt() {
        if (!::adminWebView.isInitialized) return
        adminWebView.evaluateJavascript(
            """
                (function () {
                  var removePrompt = function () {
                    var button = document.getElementById('sonaa-web-push-enable');
                    if (button) button.remove();
                  };
                  removePrompt();
                  if (!window.__HAMZAWY_HIDE_WEB_PUSH_OBSERVER && document.documentElement) {
                    window.__HAMZAWY_HIDE_WEB_PUSH_OBSERVER = new MutationObserver(removePrompt);
                    window.__HAMZAWY_HIDE_WEB_PUSH_OBSERVER.observe(document.documentElement, {
                      childList: true,
                      subtree: true
                    });
                  }
                })();
            """.trimIndent(),
            null
        )
    }

    private fun syncFcmTokenIntoWebView() {
        val token = latestFcmToken ?: getSharedPreferences("sonaa_admin_session", MODE_PRIVATE)
            .getString("pending_fcm_token", null) ?: return
        if (!::adminWebView.isInitialized) return

        val tokenLiteral = org.json.JSONObject.quote(token)
        val script = """
            (function () {
              window.__HAMZAWY_FCM_TOKEN = $tokenLiteral;
              if (!window.__HAMZAWY_STORAGE_HOOKED) {
                window.__HAMZAWY_STORAGE_HOOKED = true;
                var unregisterCurrentAdminDevice = function (adminToken) {
                  var fcmToken = window.__HAMZAWY_FCM_TOKEN || '';
                  if (!adminToken || !fcmToken) return;
                  try {
                    fetch('/api/notifications/admin/push-token', {
                      method: 'DELETE',
                      keepalive: true,
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + adminToken
                      },
                      body: JSON.stringify({ token: fcmToken })
                    }).catch(function () {});
                  } catch (_) {}
                };
                var originalClear = Storage.prototype.clear;
                Storage.prototype.clear = function () {
                  if (this === window.localStorage) {
                    unregisterCurrentAdminDevice(
                      this.getItem('admin_token_v3') || this.getItem('admin_token') || ''
                    );
                  }
                  return originalClear.apply(this, arguments);
                };
                var originalRemoveItem = Storage.prototype.removeItem;
                Storage.prototype.removeItem = function (key) {
                  if (this === window.localStorage && (key === 'admin_token_v3' || key === 'admin_token')) {
                    var otherAdminToken = key === 'admin_token'
                      ? this.getItem('admin_token_v3')
                      : this.getItem('admin_token');
                    if (!otherAdminToken) unregisterCurrentAdminDevice(this.getItem(key) || '');
                  }
                  return originalRemoveItem.apply(this, arguments);
                };
              }
              if (window.__HAMZAWY_FCM_SYNC_STARTED) return;
              window.__HAMZAWY_FCM_SYNC_STARTED = true;
              window.__HAMZAWY_FCM_SYNC_TIMER = window.setInterval(async function () {
                var adminToken = '';
                try {
                  adminToken = localStorage.getItem('admin_token_v3') ||
                    localStorage.getItem('admin_token') || '';
                } catch (_) {}
                var fcmToken = window.__HAMZAWY_FCM_TOKEN || '';
                if (!adminToken) {
                  var previousAdminToken = window.__HAMZAWY_LAST_ADMIN_TOKEN || '';
                  if (previousAdminToken && fcmToken) {
                    try {
                      var removed = await fetch('/api/notifications/admin/push-token', {
                        method: 'DELETE',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': 'Bearer ' + previousAdminToken
                        },
                        body: JSON.stringify({ token: fcmToken })
                      });
                      if (removed.ok) {
                        window.__HAMZAWY_LAST_ADMIN_TOKEN = '';
                        window.__HAMZAWY_FCM_SYNCED = '';
                      }
                    } catch (_) {}
                  }
                  return;
                }
                if (!fcmToken) return;
                var syncKey = adminToken + ':' + fcmToken;
                if (window.__HAMZAWY_FCM_SYNCED === syncKey) return;
                try {
                  var response = await fetch('/api/notifications/admin/push-token', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': 'Bearer ' + adminToken
                    },
                    body: JSON.stringify({ token: fcmToken, platform: 'fcm-android' })
                  });
                  if (response.ok) {
                    window.__HAMZAWY_FCM_SYNCED = syncKey;
                    window.__HAMZAWY_LAST_ADMIN_TOKEN = adminToken;
                  }
                } catch (_) {}
              }, 1500);
            })();
        """.trimIndent()
        adminWebView.evaluateJavascript(script, null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        loadAdminTarget(intent)
    }

    @Deprecated("Deprecated in Android API; retained for consistent WebView back navigation")
    override fun onBackPressed() {
        if (::adminWebView.isInitialized && adminWebView.canGoBack()) {
            adminWebView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (fcmReceiverRegistered) {
            runCatching { unregisterReceiver(fcmTokenReceiver) }
            fcmReceiverRegistered = false
        }
        pendingFileCallback?.onReceiveValue(null)
        pendingFileCallback = null
        if (::adminWebView.isInitialized) {
            adminWebView.stopLoading()
            adminWebView.loadUrl("about:blank")
            adminWebView.removeAllViews()
            adminWebView.destroy()
        }
        super.onDestroy()
    }

    private fun initializeFirebase() {
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this, FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .build())
        }
    }

    private fun resolveAdminPanelUrl(): String {
        val buildValue = BuildConfig.ADMIN_PANEL_URL.trim().trimEnd('/')
        if (isValidAdminPanelUrl(buildValue)) return buildValue
        val savedValue = getSharedPreferences("sonaa_admin_session", MODE_PRIVATE)
            .getString("admin_panel_url", "").orEmpty().trim().trimEnd('/')
        return savedValue.takeIf(::isValidAdminPanelUrl).orEmpty()
    }

    private fun isValidAdminPanelUrl(value: String): Boolean {
        if (value.isBlank()) return false
        return runCatching {
            val uri = android.net.Uri.parse(value)
            uri.scheme.equals("https", ignoreCase = true) &&
                uri.host.equals(ADMIN_HOST, ignoreCase = true) &&
                (uri.port == -1 || uri.port == 443) &&
                Regex("^/[A-Za-z0-9_-]{24,120}$").matches(uri.path.orEmpty()) &&
                uri.query.isNullOrBlank() && uri.fragment.isNullOrBlank()
        }.getOrDefault(false)
    }

    private fun showAdminUrlSetup() {
        val root = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(24), dp(36), dp(24), dp(36))
            setBackgroundColor(android.graphics.Color.WHITE)
        }
        val title = android.widget.TextView(this).apply {
            text = "إعداد رابط لوحة الإدارة"
            textSize = 22f
            setTextColor(android.graphics.Color.rgb(7, 86, 107))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val note = android.widget.TextView(this).apply {
            text = "أدخل رابط لوحة الإدارة الخاص مرة واحدة لفتحه داخل التطبيق"
            textSize = 14f
            setTextColor(android.graphics.Color.DKGRAY)
        }
        val input = android.widget.EditText(this).apply {
            hint = "https://www.hamzawy-sat.dynv6.net/..."
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            setText(BuildConfig.ADMIN_PANEL_URL)
        }
        val error = android.widget.TextView(this).apply {
            textSize = 13f
            setTextColor(android.graphics.Color.RED)
        }
        val save = android.widget.Button(this).apply {
            text = "حفظ وفتح لوحة الإدارة"
            isAllCaps = false
            setOnClickListener {
                val value = input.text?.toString().orEmpty().trim().trimEnd('/')
                if (!isValidAdminPanelUrl(value)) {
                    error.text = "الرابط غير صحيح. استخدم رابط لوحة الإدارة على نطاق حمزاوي سات."
                } else {
                    getSharedPreferences("sonaa_admin_session", MODE_PRIVATE)
                        .edit().putString("admin_panel_url", value).apply()
                    configuredAdminPanelUrl = value
                    val pendingIntent = pendingSetupIntent
                    pendingSetupIntent = null
                    loadAdminTarget(pendingIntent)
                }
            }
        }
        root.addView(title)
        root.addView(note, android.widget.LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        root.addView(input, android.widget.LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) })
        root.addView(error, android.widget.LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        root.addView(save, android.widget.LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
        setContentView(root)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val ADMIN_HOST = "www.hamzawy-sat.dynv6.net"
        private const val ADMIN_ORIGIN = "https://www.hamzawy-sat.dynv6.net"
    }
}
