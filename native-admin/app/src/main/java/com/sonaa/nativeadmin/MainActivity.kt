package com.sonaa.nativeadmin
import android.Manifest
import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import coil.compose.AsyncImage
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
private val Accent = Color(0xFF087F9C)
private val DarkAccent = Color(0xFF07566B)
private val Background = Color(0xFFF4F8FA)
private fun storeImageSource(value:String):String = if(value.startsWith("/")) "https://www.hamzawy-sat.dynv6.net"+value else value
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
                    return !isAllowedAdminUrl(request.url)
                }

                @Suppress("DEPRECATION")
                override fun shouldOverrideUrlLoading(view: android.webkit.WebView?, url: String?): Boolean {
                    if (url.isNullOrBlank()) return true
                    return !isAllowedAdminUrl(android.net.Uri.parse(url))
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

    private fun isAllowedAdminUrl(uri: android.net.Uri): Boolean {
        val configuredPath = android.net.Uri.parse(configuredAdminPanelUrl).path
        val isAdminPanel = !configuredPath.isNullOrBlank() && uri.path == configuredPath
        val isAdminRecovery = uri.path == "/password.html" &&
            uri.getQueryParameter("role") == "admin" &&
            uri.getQueryParameter("mode") in setOf("recovery", "support")
        return uri.scheme.equals("https", ignoreCase = true) &&
            uri.host.equals(ADMIN_HOST, ignoreCase = true) &&
            (uri.port == -1 || uri.port == 443) &&
            (isAdminPanel || isAdminRecovery)
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
@Composable private fun SplashScreen(){
 val motion=rememberInfiniteTransition(label="hamzawy-splash-motion")
 val horizontalOffset by motion.animateFloat(
  initialValue=-20f,
  targetValue=20f,
  animationSpec=infiniteRepeatable(
   animation=tween(durationMillis=900,easing=FastOutSlowInEasing),
   repeatMode=RepeatMode.Reverse
  ),
  label="hamzawy-logo-horizontal-offset"
 )
 Box(Modifier.fillMaxSize().background(Color.White),contentAlignment=Alignment.Center){
  Column(horizontalAlignment=Alignment.CenterHorizontally){
   Image(painterResource(R.drawable.hamzawy_logo),"شعار حمزاوي سات",Modifier.offset(x=horizontalOffset.dp).size(150.dp))
   Spacer(Modifier.height(18.dp))
   Text("حمزاوي سات",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Black,color=DarkAccent)
   Text("كل خدمة تبدأ بخطوة",color=Accent,modifier=Modifier.padding(top=4.dp))
  }
 }
}
@Composable private fun LoginScreen(state: AdminUiState, login: (String, String) -> Unit) {
    var phone by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Image(painterResource(R.drawable.hamzawy_logo), "شعار حمزاوي سات", Modifier.size(112.dp))
        Spacer(Modifier.height(16.dp))
        Text("إدارة حمزاوي سات CON", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = DarkAccent)
        Text("سجّل الدخول للمتابعة", color = Color.Gray, modifier = Modifier.padding(bottom = 22.dp, top = 5.dp))
        OutlinedTextField(phone, { phone = it }, label = { Text("رقم الهاتف") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(password, { password = it }, label = { Text("كلمة المرور") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
        Button(onClick = { login(phone, password) }, enabled = !state.busy && phone.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 18.dp), shape = RoundedCornerShape(17.dp), elevation = ButtonDefaults.buttonElevation(defaultElevation = 7.dp, pressedElevation = 1.dp, hoveredElevation = 9.dp)) {
            if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("تسجيل الدخول")
        }
    }
}
@Composable private fun HomeScreen(state: AdminUiState, vm: AdminViewModel) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Image(painterResource(R.drawable.hamzawy_logo), "شعار حمزاوي سات", Modifier.size(42.dp))
            Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                Text("إدارة حمزاوي سات CON", fontWeight = FontWeight.Bold, color = DarkAccent)
                Text(state.section.title, style = MaterialTheme.typography.labelMedium, color = Color.Gray)
            }
            Surface(
                onClick = vm::retry,
                modifier = Modifier.size(42.dp),
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFFE8F5F7),
                shadowElevation = 5.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFC8E5E9))
            ) { Box(contentAlignment = Alignment.Center) { Text("↻", color = Accent, fontWeight = FontWeight.Black, style = MaterialTheme.typography.headlineSmall) } }
            Spacer(Modifier.width(8.dp))
            Surface(
                onClick = vm::logout,
                modifier = Modifier.size(42.dp),
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFFFFEEEE),
                shadowElevation = 5.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3CACA))
            ) { Box(contentAlignment = Alignment.Center) { Text("⇥", color = Color(0xFFB3261E), fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge) } }
        }
        if(state.section==AdminSection.ORDERS)state.voicePath?.let { path -> VoicePlayer(path) { } }
        state.actionMessage?.let { message ->
            Card(Modifier.fillMaxWidth().padding(horizontal=12.dp, vertical=6.dp), colors=CardDefaults.cardColors(containerColor=Color(0xFFEAF6F8))) {
                Text(message, modifier=Modifier.padding(10.dp), color=DarkAccent, maxLines=10)
            }
        }
        state.supportPasswordText?.let { secret ->
            AlertDialog(
                onDismissRequest={vm.closeSupportPassword()},
                title={Text(state.supportPasswordTitle)},
                text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text("احتفظ بكلمة الدعم وأرسلها لصاحب الحساب بشكل آمن. لا تشاركها في مجموعات عامة.")
                    SelectionContainer { Text(secret,fontWeight=FontWeight.Bold,color=DarkAccent) }
                }},
                confirmButton={TextButton(onClick={vm.closeSupportPassword()}){Text("إغلاق")}}
            )
        }
        var sectionMenuExpanded by remember { mutableStateOf(false) }
        val readableSections = AdminSection.entries.filter { canReadSection(state.adminInfo,it) }
        val dashboardRoot=state.stats?.takeIf{it.isJsonObject}?.asJsonObject
        val dashboardCounts=dashboardRoot?.get("counts")?.takeIf{it.isJsonObject}?.asJsonObject?:dashboardRoot
        val dashboardOrders=dashboardRoot?.get("dashboardOrders")?.takeIf{it.isJsonArray}?.asJsonArray
        val dashboardTopups=dashboardRoot?.get("dashboardTopups")?.takeIf{it.isJsonArray}?.asJsonArray
        val dashboardComplaints=dashboardRoot?.get("dashboardComplaints")?.takeIf{it.isJsonArray}?.asJsonArray
        val dashboardTechnicians=dashboardRoot?.get("dashboardTechnicians")?.takeIf{it.isJsonArray}?.asJsonArray
        val dashboardProfileEdits=dashboardRoot?.get("dashboardProfileEdits")?.takeIf{it.isJsonArray}?.asJsonArray
        val dashboardClientTopups=dashboardRoot?.get("dashboardClientTopups")?.takeIf{it.isJsonArray}?.asJsonArray
        val dashboardRecoveryRequests=dashboardRoot?.get("dashboardRecoveryRequests")?.takeIf{it.isJsonArray}?.asJsonArray
        fun sectionBadgeCount(section:AdminSection):Int?=when(section){
            AdminSection.NOTIFICATIONS->state.adminUnreadCount
            AdminSection.PENDING->dashboardTechnicians?.count{it.isJsonObject&&it.asJsonObject.get("isApproved")?.asBoolean!=true&&it.asJsonObject.get("isDisabled")?.asBoolean!=true&&it.asJsonObject.get("status")?.asString.orEmpty() !in listOf("rejected","مرفوض")}
            AdminSection.PROFILE_EDITS->dashboardProfileEdits?.size()
            AdminSection.ORDERS->dashboardOrders?.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString.orEmpty() in listOf("قيد المراجعة","pending","مراجعة","بانتظار المراجعة")}
            AdminSection.TOPUPS->dashboardTopups?.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString.orEmpty() in listOf("pending","قيد المراجعة","جديد","جديدة")}
            AdminSection.CLIENT_TOPUPS->dashboardClientTopups?.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString=="قيد المراجعة"}
            AdminSection.COMPLAINTS->dashboardComplaints?.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString.orEmpty() in listOf("جديدة","pending","open","قيد المراجعة")}
            AdminSection.RECOVERY->dashboardRecoveryRequests?.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString.orEmpty() in listOf("بانتظار الدعم","قيد التحقق","جديدة","pending")}
            else->null
        }
        Box(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 14.dp, vertical = 9.dp)) {
            Surface(
                onClick = { sectionMenuExpanded = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = Color(0xFFF1F7FB),
                shadowElevation = 5.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD6E6F0))
            ) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(38.dp).background(Accent, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        Text("☷", color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
                    }
                    Column(Modifier.weight(1f).padding(horizontal = 11.dp)) {
                        Text("القائمة الرئيسية", style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                        Text(state.section.title, fontWeight = FontWeight.ExtraBold, color = DarkAccent)
                    }
                    Text("⌄", color = Accent, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
                }
            }
            DropdownMenu(
                expanded = sectionMenuExpanded,
                onDismissRequest = { sectionMenuExpanded = false },
                modifier = Modifier.fillMaxWidth(0.92f).background(Color.White)
            ) {
                readableSections.forEach { tab ->
                    DropdownMenuItem(
                        text = {
                            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                Text(tab.title,modifier=Modifier.weight(1f),fontWeight=if(tab==state.section)FontWeight.ExtraBold else FontWeight.Medium,color=if(tab==state.section)Accent else Color(0xFF263746))
                                sectionBadgeCount(tab)?.let{count->
                                    Surface(color=if(count>0)Color(0xFFE3F3F6) else Color(0xFFF1F5F9),shape=RoundedCornerShape(9.dp)){
                                        Text(count.toString(),modifier=Modifier.padding(horizontal=8.dp,vertical=3.dp),color=if(count>0)Accent else Color.Gray,fontWeight=FontWeight.Bold,style=MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                        },
                        leadingIcon = {
                            Box(Modifier.size(34.dp).background(if (tab == state.section) Color(0xFFE1F4F7) else Color(0xFFF1F5F9), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                                Text(sectionGlyph(tab), color = if (tab == state.section) Accent else Color(0xFF78909C), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                            }
                        },
                        onClick = {
                            sectionMenuExpanded = false
                            if (tab == AdminSection.DASHBOARD) vm.refresh() else vm.open(tab)
                        }
                    )
                }
            }
        }
        when {
            state.busy -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Accent) }
            state.error != null -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text(state.error, color = MaterialTheme.colorScheme.error)
                Button(onClick = vm::retry, modifier = Modifier.padding(top = 12.dp)) { Text("إعادة المحاولة") }
            }
            state.section == AdminSection.DASHBOARD || state.section == AdminSection.STATS -> Dashboard(state.stats, state.section == AdminSection.STATS, listOf(AdminSection.ORDERS, AdminSection.PENDING, AdminSection.STORE_PRODUCTS, AdminSection.CONTENT).filter { canReadSection(state.adminInfo, it) }) { section -> vm.open(section) }
            state.section == AdminSection.PAGE_VISITS -> PageVisitsScreen(state.payload, vm::filterPageVisits)
            state.section == AdminSection.REPORTS -> ReportEditor(state.payload) { method, path, body -> vm.mutate(method, path, body) }
            state.section == AdminSection.SETTINGS || state.section == AdminSection.PRICING || state.section == AdminSection.CONTENT -> ConfigEditor(state.section, state.payload,{path->canWriteApi(state.adminInfo,path)}) { method, path, body -> vm.mutate(method, path, body) }
            state.walletFanniId!=null -> WalletTransactionsScreen(state.walletTransactions,vm::closeWalletTransactions)
            state.identityFanniId!=null -> FanniIdentityScreen(state.identityFrontPath,state.identityBackPath,state.busy,vm::closeFanniIdentity)
            state.editingClient!=null -> ClientProfileEditor(state.editingClient,state.editingClientId.orEmpty(),{vm.closeClientProfile()}) { method:String,path:String,body:JsonObject -> vm.saveEditedProfile(method,path,body) }
            state.editingProfile!=null -> ProfileEditor(state.editingProfile,state.editingProfileId.orEmpty(),{vm.closeProfile()}) { method:String,path:String,body:JsonObject -> vm.saveEditedProfile(method,path,body) }
            state.recoveryDetail!=null -> RecoveryConversationScreen(state.recoveryDetail,state.busy,state.error,state.actionMessage,vm::closeRecovery,{path->canWriteApi(state.adminInfo,path)}) { method,path,body -> vm.recoveryAction(method,path,body) }
            state.section == AdminSection.SUPPORT -> SupportAdminScreen(state.supportCases,state.supportViolations,state.supportSearchResults,state.supportSelectedCase,state.actionMessage,{vm.retry()},{id->vm.openSupportCase(id)},{query->vm.searchSupport(query)},{method,path,body->vm.supportAction(method,path,body)},{path->canWriteApi(state.adminInfo,path)})
            state.section == AdminSection.COMMERCE_PLANS -> CommercePlansScreen(state.items,state.busy,state.storeUploadedImageUrl,state.storeUploadedImageFileId,{uri,purpose->vm.uploadStoreImage(uri,purpose)},vm::clearStoreUpload,{path->canWriteApi(state.adminInfo,path)}) { method,path,body -> vm.mutate(method,path,body) }
            state.section == AdminSection.CLIENT_SUBSCRIPTIONS -> ClientSubscriptionsScreen(state.items,state.busy,{path->canWriteApi(state.adminInfo,path)}) { method,path,body -> vm.mutate(method,path,body) }
            state.section == AdminSection.STORE_PRODUCTS -> StoreProductsScreen(state.payload,state.items,state.busy,state.storeUploadedImageUrl,state.storeUploadedImageFileId,{uri,purpose->vm.uploadStoreImage(uri,purpose)},vm::clearStoreUpload,{path->canWriteApi(state.adminInfo,path)}) { method,path,body -> vm.mutate(method,path,body) }
            state.section == AdminSection.STORE_ORDERS -> StoreOrdersScreen(state.payload,state.items,state.busy,{path->canWriteApi(state.adminInfo,path)}) { method,path,body -> vm.mutate(method,path,body) }
            state.section == AdminSection.UI_LAYOUT -> UiLayoutEditorScreen(state.payload,state.uiLayoutPage,state.busy,{page->vm.loadUiLayout(page)},{method,path,body->vm.mutate(method,path,body)})
            else -> ListScreen(state.section, state.items, state.stats, state.sectionSearch, state.adminInbox, state.adminUnreadCount, state.notificationDeliveries, state.adminNotificationError, vm::retry, vm::loadVoice, vm::openFanniProfile, vm::openFanniIdentity, vm::issueSupportPassword, vm::revealSupportPassword, vm::issueClientSupportPassword, vm::revealClientSupportPassword, vm::openWalletTransactions, vm::openClientWalletTransactions, vm::openClientOrders, vm::openClientProfile, vm::searchClients, vm::searchSupport, vm::filterAuditLogs, vm::bulkPublish, vm::openRecovery, { section, ids, action -> vm.bulkAction(section, ids, action) }, vm::bulkRenameRegions, { path -> canWriteApi(state.adminInfo,path) }, { path -> canReadApi(state.adminInfo,path) }, { id -> vm.markAdminNotificationRead(id); Unit }, { vm.markAllAdminNotificationsRead(); Unit }) { method, path, body -> vm.mutate(method, path, body) }
        }
    }
}
@Composable private fun AdminNotificationAuditPanel(
    inbox:List<JsonElement>,
    unreadCount:Int,
    deliveries:List<JsonElement>,
    loadError:String?,
    canRead:Boolean,
    canMarkRead:Boolean,
    onMarkRead:(String)->Unit,
    onMarkAllRead:()->Unit
){
    var tab by remember{mutableStateOf(0)}
    Column(Modifier.fillMaxWidth().padding(top=8.dp,bottom=8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){
            TextButton(onClick={tab=0}){Text("الوارد ($unreadCount)")}
            TextButton(onClick={tab=1}){Text("تتبع التسليم")}
        }
        if(loadError!=null)Text("تعذر تحميل بعض بيانات الإشعارات: $loadError",color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
        if(!canRead)Text("لا تملك صلاحية قراءة صندوق وارد الإدارة.",color=Color.Gray)
        else if(tab==0){
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                Text("صندوق وارد الإدارة",fontWeight=FontWeight.Bold,color=DarkAccent,modifier=Modifier.weight(1f))
                if(unreadCount>0&&canMarkRead)TextButton(onClick=onMarkAllRead){Text("قراءة الكل")}
            }
            if(inbox.isEmpty())Text("لا توجد إشعارات واردة.",color=Color.Gray)
            inbox.forEach{entry->
                val o=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
                val id=o.get("id")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
                val read=o.get("read")?.asBoolean==true
                Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=if(read)Color(0xFFF7F8FA) else Color(0xFFEAF6F8))){
                    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
                        Text(o.get("title")?.takeIf{!it.isJsonNull}?.asString.orEmpty(),fontWeight=FontWeight.Bold,color=DarkAccent)
                        Text(o.get("message")?.takeIf{!it.isJsonNull}?.asString.orEmpty(),style=MaterialTheme.typography.bodySmall)
                        Text((if(read)"مقروء" else "غير مقروء")+" • "+(o.get("createdAt")?.toString()?.trim('"')?: ""),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                        if(!read&&id.isNotBlank()&&canMarkRead)TextButton(onClick={onMarkRead(id)}){Text("تعليم كمقروء")}
                    }
                }
            }
        }else{
            Text("سجل تسليم الإشعارات حسب القناة",fontWeight=FontWeight.Bold,color=DarkAccent)
            if(deliveries.isEmpty())Text("لا توجد سجلات تسليم متاحة.",color=Color.Gray)
            deliveries.forEach{entry->
                val o=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
                val status=o.get("overallStatus")?.toString()?.trim('"').orEmpty()
                val role=o.get("role")?.toString()?.trim('"').orEmpty()
                val type=o.get("type")?.toString()?.trim('"').orEmpty()
                val channels=o.get("channels")?.toString().orEmpty()
                Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
                        Text("الحالة: $status • المستلم: $role",fontWeight=FontWeight.SemiBold,color=DarkAccent)
                        Text("النوع: $type",style=MaterialTheme.typography.bodySmall)
                        Text("القنوات: $channels",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                        Text(o.get("createdAt")?.toString()?.trim('"').orEmpty(),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                    }
                }
            }
        }
    }
}

private fun sectionGlyph(section:AdminSection):String=when(section){
 AdminSection.DASHBOARD->"⌂";AdminSection.STATS->"▥";AdminSection.ORDERS->"▤"
 AdminSection.TECHNICIANS->"♟";AdminSection.PENDING->"◷";AdminSection.PROFILE_EDITS->"✎"
 AdminSection.DISABLED->"⊘";AdminSection.LEVELS->"★";AdminSection.OFFERS->"%"
 AdminSection.WALLETS->"◉";AdminSection.TOPUPS->"+";AdminSection.SERVICES->"⚒"
 AdminSection.REGIONS->"⌖";AdminSection.COMPLAINTS->"!";AdminSection.SUPPORT->"?"
 AdminSection.RECOVERY->"↻";AdminSection.NOTIFICATIONS->"♢";AdminSection.CONTENT->"▣"
 AdminSection.PRICING->"$";AdminSection.REPORTS->"▤";AdminSection.PAGE_VISITS->"◉"
 AdminSection.SECURITY->"⌑";AdminSection.SETTINGS->"⚙";AdminSection.ROLES->"♙"
 AdminSection.CLIENTS->"♧";AdminSection.CLIENT_WALLETS->"◉";AdminSection.CLIENT_TOPUPS->"+";AdminSection.COMMERCE_PLANS->"▣";AdminSection.CLIENT_SUBSCRIPTIONS->"★";AdminSection.STORE_PRODUCTS->"🛒";AdminSection.STORE_ORDERS->"📦";AdminSection.UI_LAYOUT->"▦"
}
@Composable private fun VoicePlayer(path:String,onClose:()->Unit){
 var prepared by remember(path){mutableStateOf(false)}
 var playing by remember(path){mutableStateOf(false)}
 val player=remember(path){
  MediaPlayer().apply{
   setDataSource(path)
   setOnPreparedListener{prepared=true}
   setOnCompletionListener{playing=false}
   prepareAsync()
  }
 }
 DisposableEffect(player){onDispose{runCatching{player.release()}}}
 Card(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=6.dp),colors=CardDefaults.cardColors(containerColor=Color.White)){
  Row(Modifier.fillMaxWidth().padding(10.dp),verticalAlignment=Alignment.CenterVertically){
   Text("تسجيل صوتي للطلب",modifier=Modifier.weight(1f),fontWeight=FontWeight.Bold,color=DarkAccent)
   Button(onClick={if(prepared){if(playing){player.pause();playing=false}else{player.start();playing=true}}},enabled=prepared){Text(if(!prepared)"تحميل..." else if(playing)"إيقاف مؤقت" else "تشغيل")}
  }
 }
}

private val permissionSections=listOf(
 "dashboard" to "الرئيسية والإحصائيات","fannis" to "الفنيون","orders" to "الطلبات",
 "publishOrders" to "نشر الطلبات","voiceReview" to "مراجعة التسجيلات الصوتية",
 "passwordRecovery" to "استعادة كلمة المرور","complaints" to "الشكاوى","services" to "الخدمات",
 "clients" to "العملاء","topups" to "طلبات شحن المحافظ","wallet" to "المحافظ والأرصدة",
 "pricing" to "الأسعار والعمولات","settings" to "إعدادات المنصة","content" to "الإعلانات والمحتوى",
 "support" to "الدعم","regions" to "المناطق","offers" to "العروض",
 "notifications" to "الإشعارات","clientsData" to "بيانات العملاء","commerce" to "الاشتراكات والباقات","store" to "المتجر وطلبات البيع"
)
private fun permissionDefaults(item:JsonElement?):Map<String,Pair<Boolean,Boolean>>{
 if(item==null||!item.isJsonObject)return emptyMap()
 val obj=item.asJsonObject
 val role=obj.get("adminRole")?.takeIf{!it.isJsonNull}?.asString?:if(obj.get("role")?.asString=="admin")"مشرف" else "قراءة فقط"
 val all=permissionSections.map{it.first}.toSet()
 val writes=when(role){
  "مشرف"->setOf("orders","complaints","support","offers")
  "مشرف أول"->setOf("fannis","orders","complaints","services","clients","topups","wallet","support","regions","offers","notifications","clientsData","commerce","store")
  "مدير"->all
  else->emptySet()
 }
 val reads=when(role){
  "قراءة فقط"->all
  "مدير","مشرف أول"->all
  else->setOf("dashboard","fannis","orders","voiceReview","passwordRecovery","complaints","services","clients","topups","wallet","pricing","content","support","regions","offers","notifications","clientsData")
 }
 val out=permissionSections.associate{(key,_)->key to ((key in reads||key in writes) to (key in writes))}.toMutableMap()
 val stored=obj.get("adminPermissions")?.takeIf{it.isJsonObject}?.asJsonObject
 if(stored?.get("__customOverrides")?.asBoolean==true){
  permissionSections.forEach{(key,_)->stored.get(key)?.takeIf{it.isJsonObject}?.asJsonObject?.let{delta->
   val base=out[key]?: (false to false)
   val read=delta.get("read")?.asBoolean?:base.first
   val write=delta.get("write")?.asBoolean?:base.second
   out[key]=(read||write) to write
  }}
 }
 return out
}
private fun isRootAdminInfo(info:JsonElement?):Boolean{
 val o=info?.takeIf{it.isJsonObject}?.asJsonObject?:return false
 return o.get("isRootAdmin")?.asBoolean==true||o.get("adminRoleLabel")?.asString in setOf("أدمن رئيسي","مدير عام")
}
private fun permissionKeyForNativePath(path:String):String?{
 val clean=path.substringBefore("?").removePrefix("/")
 if(clean.startsWith("api/notifications/admin"))return "notifications"
 if(clean.startsWith("api/orders/admin/")&&clean.endsWith("/publish"))return "publishOrders"
 if(clean.startsWith("api/orders/admin/")&&clean.endsWith("/voice-reviewed"))return "voiceReview"
 if(clean.startsWith("api/orders/")&&clean.endsWith("/voice"))return "voiceReview"
 if(clean.startsWith("api/password-recovery/admin/requests")||clean.startsWith("api/password-recovery/admin/support-passwords"))return "passwordRecovery"
 if(clean.startsWith("api/support/admin"))return "support"
 if(clean.startsWith("api/admin/admin-users")||clean.startsWith("api/admin/audit-logs")||clean.startsWith("api/admin/ui-layout"))return null
 if(clean.startsWith("api/admin/wallet/")||clean.startsWith("api/admin/client-wallet/")||(clean.startsWith("api/admin/clients/")&&Regex("/wallet/(add-balance|deduct-balance|set-balance)$").containsMatchIn(clean))||clean.endsWith("/set-balance")||clean.endsWith("/add-balance"))return "wallet"
 val prefix="api/admin/"
 if(!clean.startsWith(prefix))return null
 return when(clean.removePrefix(prefix).substringBefore("/")){
  "me","counts","stats","reports","mobile-panel","page-visits"->"dashboard"
  "fannis","fanni-profile-edits"->"fannis"
  "orders"->"orders"
  "offers"->"offers"
  "complaints"->"complaints"
  "topup-requests"->"topups"
  "clients"->"clients"
  "client-accounts"->"clientsData"
  "client-wallet"->"wallet"
  "commerce"->"commerce"
  "store"->"store"
  "pricing"->"pricing"
  "settings"->"settings"
  "content"->"content"
  "support"->"support"
  "regions"->"regions"
  "notifications"->"notifications"
  "services"->"services"
  else->null
 }
}
private fun canReadSection(info:JsonElement?,section:AdminSection):Boolean{
 if(isRootAdminInfo(info))return true
 val key=when(section){
  AdminSection.DASHBOARD,AdminSection.STATS,AdminSection.REPORTS->"dashboard"
  AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.PROFILE_EDITS,AdminSection.DISABLED,AdminSection.LEVELS->"fannis"
  AdminSection.ORDERS->"orders"
  AdminSection.OFFERS->"offers"
  AdminSection.WALLETS->"wallet"
  AdminSection.TOPUPS->"topups"
  AdminSection.SERVICES->"services"
  AdminSection.REGIONS->"regions"
  AdminSection.COMPLAINTS->"complaints"
  AdminSection.SUPPORT->"support"
  AdminSection.RECOVERY->"passwordRecovery"
  AdminSection.NOTIFICATIONS->"notifications"
  AdminSection.CONTENT->"content"
  AdminSection.PRICING->"pricing"
  AdminSection.SETTINGS->"settings"
  AdminSection.CLIENTS->"clients"
  AdminSection.CLIENT_WALLETS,AdminSection.CLIENT_TOPUPS->"wallet"
  AdminSection.COMMERCE_PLANS,AdminSection.CLIENT_SUBSCRIPTIONS->"commerce"
  AdminSection.STORE_PRODUCTS,AdminSection.STORE_ORDERS->"store"
  AdminSection.PAGE_VISITS->"dashboard"
  AdminSection.SECURITY,AdminSection.ROLES,AdminSection.UI_LAYOUT->return false
 }
 return permissionDefaults(info).get(key)?.first==true
}
private fun canReadApi(info:JsonElement?,path:String):Boolean{
 if(isRootAdminInfo(info))return true
 val key=permissionKeyForNativePath(path)?:return false
 return permissionDefaults(info)[key]?.first==true
}
private fun canWriteApi(info:JsonElement?,path:String):Boolean{
 if(isRootAdminInfo(info))return true
 val key=permissionKeyForNativePath(path)?:return false
 if(key=="dashboard"&&path.contains("/reports"))return permissionDefaults(info)[key]?.first==true
 return permissionDefaults(info)[key]?.second==true
}

@Composable private fun AdminPermissionsDialog(item:JsonElement,onDismiss:()->Unit,onSave:(JsonObject)->Unit){
 var permissions by remember(item){mutableStateOf(permissionDefaults(item))}
 val role=item.asJsonObject.get("adminRole")?.takeIf{!it.isJsonNull}?.asString?: "مشرف"
 AlertDialog(onDismissRequest=onDismiss,title={Text("صلاحيات المشرف: "+(item.asJsonObject.get("name")?.asString?: "—"))},
  text={Column(Modifier.heightIn(max=520.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(5.dp)){
   Text("المنصب الحالي: $role",fontWeight=FontWeight.Bold,color=DarkAccent)
   Text("التنفيذ يمنح القراءة تلقائيًا. الخادم يطبق الصلاحيات على كل طلب.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
   permissionSections.forEach{(key,label)->
    val current=permissions[key]?: (false to false)
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color(0xFFF4F8FA))){
     Column(Modifier.padding(horizontal=10.dp,vertical=5.dp)){
      Text(label,fontWeight=FontWeight.SemiBold)
      Row(verticalAlignment=Alignment.CenterVertically){
       Text("قراءة",modifier=Modifier.weight(1f),style=MaterialTheme.typography.bodySmall)
       Switch(checked=current.first,onCheckedChange={v->permissions=permissions.toMutableMap().apply{put(key,(v||current.second) to current.second)}})
       Spacer(Modifier.width(12.dp))
       Text("تنفيذ",style=MaterialTheme.typography.bodySmall)
       Switch(checked=current.second,onCheckedChange={v->permissions=permissions.toMutableMap().apply{put(key,(current.first||v) to v)}})
      }
     }
    }
   }
  }},
  confirmButton={TextButton(onClick={
   val body=JsonObject().apply{add("permissions",JsonObject().apply{permissionSections.forEach{(key,_)->val p=permissions[key]?: (false to false);add(key,JsonObject().apply{addProperty("read",p.first||p.second);addProperty("write",p.second)})}})}
   onSave(body)
  }){Text("حفظ الصلاحيات")}},
  dismissButton={TextButton(onClick=onDismiss){Text("إلغاء")}}
 )
}

@Composable private fun FanniControlsDialog(item:JsonElement,onDismiss:()->Unit,onSave:(JsonObject)->Unit){
 val f=item.asJsonObject
 var trust by remember(item){mutableStateOf(f.get("trustScore")?.toString()?: "50")}
 var verified by remember(item){mutableStateOf((f.get("isVerified")?.asBoolean?:false)||(f.get("badges")?.takeIf{it.isJsonArray}?.asJsonArray?.any{it.asString=="verified"}==true))}
 var featured by remember(item){mutableStateOf(f.get("isFeatured")?.asBoolean?:false)}
 var until by remember(item){mutableStateOf(f.get("featuredUntil")?.asString?.take(10).orEmpty())}
 AlertDialog(onDismissRequest=onDismiss,title={Text("الثقة والتحقق والظهور")},
  text={Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
   OutlinedTextField(trust,{trust=it},label={Text("درجة الثقة 0 - 100")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number))
   Row(verticalAlignment=Alignment.CenterVertically){Text("فني موثق",modifier=Modifier.weight(1f));Switch(verified,{verified=it})}
   Row(verticalAlignment=Alignment.CenterVertically){Text("تمييز الفني",modifier=Modifier.weight(1f));Switch(featured,{featured=it})}
   OutlinedTextField(until,{until=it},label={Text("انتهاء التمييز YYYY-MM-DD")})
  }},
  confirmButton={TextButton(onClick={onSave(JsonObject().apply{addProperty("trustScore",trust.toIntOrNull()?:0);addProperty("isVerified",verified);addProperty("isFeatured",featured);if(until.isNotBlank())addProperty("featuredUntil",until)else add("featuredUntil",com.google.gson.JsonNull.INSTANCE)})}){Text("حفظ")}},
  dismissButton={TextButton(onClick=onDismiss){Text("إلغاء")}}
 )
}
@Composable private fun FanniLimitsDialog(item:JsonElement,onDismiss:()->Unit,onSave:(JsonObject)->Unit){
 val limits=item.asJsonObject.get("limits")?.takeIf{it.isJsonObject}?.asJsonObject
 var maxOffers by remember(item){mutableStateOf(limits?.get("maxOffers")?.toString()?: "50")}
 var dailyLimit by remember(item){mutableStateOf(limits?.get("dailyLimit")?.toString()?: "10")}
 var limited by remember(item){mutableStateOf(limits?.get("isLimited")?.asBoolean?:false)}
 var reason by remember(item){mutableStateOf(limits?.get("reason")?.asString.orEmpty())}
 AlertDialog(onDismissRequest=onDismiss,title={Text("حدود استقبال الفني")},
  text={Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
   OutlinedTextField(maxOffers,{maxOffers=it},label={Text("أقصى عدد عروض نشطة 0 - 1000")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number))
   OutlinedTextField(dailyLimit,{dailyLimit=it},label={Text("الحد اليومي 0 - 100")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number))
   Row(verticalAlignment=Alignment.CenterVertically){Text("تقييد الفني",modifier=Modifier.weight(1f));Switch(limited,{limited=it})}
   OutlinedTextField(reason,{reason=it},label={Text("سبب التقييد")},minLines=2)
  }},
  confirmButton={TextButton(enabled=maxOffers.toIntOrNull()?.let{it in 0..1000}==true&&dailyLimit.toIntOrNull()?.let{it in 0..100}==true&&reason.trim().length>=2,onClick={onSave(JsonObject().apply{addProperty("maxOffers",maxOffers.toInt());addProperty("dailyLimit",dailyLimit.toInt());addProperty("isLimited",limited);addProperty("reason",reason.trim())})}){Text("حفظ")}},
  dismissButton={TextButton(onClick=onDismiss){Text("إلغاء")}}
 )
}

@Composable private fun OrderCorrectionDialog(order:JsonElement,onDismiss:()->Unit,onSave:(JsonObject)->Unit){
 val o=order.asJsonObject
 var clientName by remember(order){mutableStateOf(o.get("clientName")?.asString.orEmpty())}
 var clientPhone by remember(order){mutableStateOf(o.get("clientPhone")?.asString.orEmpty())}
 var service by remember(order){mutableStateOf(o.get("service")?.asString.orEmpty())}
 var area by remember(order){mutableStateOf(o.get("area")?.asString.orEmpty())}
 var address by remember(order){mutableStateOf(o.get("address")?.asString.orEmpty())}
 var description by remember(order){mutableStateOf(o.get("description")?.asString.orEmpty())}
 var budget by remember(order){mutableStateOf(o.get("budget")?.asString.orEmpty())}
 AlertDialog(onDismissRequest=onDismiss,title={Text("تصحيح بيانات الطلب")},
  text={Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(6.dp)){
   OutlinedTextField(clientName,{clientName=it},label={Text("اسم العميل")})
   OutlinedTextField(clientPhone,{clientPhone=it},label={Text("رقم الهاتف")})
   OutlinedTextField(service,{service=it},label={Text("الخدمة")})
   OutlinedTextField(area,{area=it},label={Text("المنطقة")})
   OutlinedTextField(address,{address=it},label={Text("العنوان")})
   OutlinedTextField(description,{description=it},label={Text("الوصف")},minLines=2)
   OutlinedTextField(budget,{budget=it},label={Text("الميزانية")})
  }},
  confirmButton={TextButton(onClick={onSave(JsonObject().apply{addProperty("clientName",clientName.trim());addProperty("clientPhone",clientPhone.trim());addProperty("service",service.trim());addProperty("area",area.trim());addProperty("address",address.trim());addProperty("description",description.trim());addProperty("budget",budget.trim())})}){Text("حفظ التصحيح")}},
  dismissButton={TextButton(onClick=onDismiss){Text("إلغاء")}}
 )
}

@Composable private fun ClientProfileEditor(payload:JsonElement,id:String,onCancel:()->Unit,onSave:(String,String,JsonObject)->Unit){
 val client=payload.takeIf{it.isJsonObject}?.asJsonObject?.get("client")?.takeIf{it.isJsonObject}?.asJsonObject
 var name by remember(payload){mutableStateOf(client?.get("name")?.asString.orEmpty())}
 var phone by remember(payload){mutableStateOf(client?.get("phone")?.asString.orEmpty())}
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("تعديل بيانات العميل",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
  OutlinedTextField(name,{name=it},label={Text("اسم العميل")},modifier=Modifier.fillMaxWidth())
  OutlinedTextField(phone,{phone=it},label={Text("رقم الهاتف")},modifier=Modifier.fillMaxWidth())
  Button(onClick={onSave("PATCH","api/admin/client-accounts/$id/profile",JsonObject().apply{addProperty("name",name.trim());addProperty("phone",phone.trim())})},modifier=Modifier.fillMaxWidth()){Text("حفظ بيانات العميل")}
  OutlinedButton(onClick=onCancel,modifier=Modifier.fillMaxWidth()){Text("رجوع")}
 }
}

@Composable private fun WalletTransactionsScreen(items:List<JsonElement>,onBack:()->Unit){
 val labels=mapOf("commission" to "عمولة طلب","topup" to "شحن محفظة","admin_adjustment" to "تسوية إدارية","refund" to "استرداد","client_topup" to "شحن محفظة العميل","client_admin_adjustment" to "إضافة إدارية لمحفظة العميل","client_admin_deduction" to "خصم إداري من محفظة العميل","client_admin_settlement" to "تسوية محفظة العميل","client_refund" to "استرداد قيمة خدمة")
 Column(Modifier.fillMaxSize().padding(16.dp)){
  Text("حركات المحفظة",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.ExtraBold,color=DarkAccent)
  Text("سجل العمليات المالية مع الرصيد قبل الحركة وبعدها",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
  Button(onClick=onBack,modifier=Modifier.fillMaxWidth().padding(vertical=8.dp),shape=RoundedCornerShape(14.dp),elevation=ButtonDefaults.buttonElevation(defaultElevation=5.dp)){Text("رجوع للمحافظ")}
  if(items.isEmpty())Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){Text("لا توجد حركات مالية مسجلة",color=Color.Gray)}
  else LazyColumn(verticalArrangement=Arrangement.spacedBy(9.dp)){
   items(items){entry->
    val o=entry.takeIf{it.isJsonObject}?.asJsonObject
    val type=o?.get("type")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
    val amount=o?.get("amount")?.takeIf{it.isJsonPrimitive}?.asString?: "—"
    val before=o?.get("balanceBefore")?.takeIf{it.isJsonPrimitive}?.asString?: "—"
    val after=o?.get("balanceAfter")?.takeIf{it.isJsonPrimitive}?.asString?: "—"
    val description=o?.get("description")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
    val order=o?.get("orderSN")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
    val date=o?.get("createdAt")?.takeIf{!it.isJsonNull}?.asString?: "—"
    Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(17.dp),colors=CardDefaults.cardColors(containerColor=Color.White),elevation=CardDefaults.cardElevation(defaultElevation=3.dp)){
     Column(Modifier.fillMaxWidth().padding(13.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
      Row(verticalAlignment=Alignment.CenterVertically){
       Text(labels[type]?:if(type.isBlank())"حركة مالية" else type,modifier=Modifier.weight(1f),fontWeight=FontWeight.ExtraBold,color=DarkAccent)
       Text("$amount ج.م",fontWeight=FontWeight.Black,color=if(amount.startsWith("-"))Color(0xFFB3261E) else Color(0xFF087F55))
      }
      if(description.isNotBlank())Text(description,color=Color(0xFF455A64))
      Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
       Surface(shape=RoundedCornerShape(10.dp),color=Color(0xFFF0F5F8)){Text("قبل: $before ج.م",modifier=Modifier.padding(horizontal=9.dp,vertical=6.dp),style=MaterialTheme.typography.labelMedium)}
       Surface(shape=RoundedCornerShape(10.dp),color=Color(0xFFE8F5F2)){Text("بعد: $after ج.م",modifier=Modifier.padding(horizontal=9.dp,vertical=6.dp),style=MaterialTheme.typography.labelMedium)}
      }
      if(order.isNotBlank())Text("رقم الطلب: $order",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
      Text(date,style=MaterialTheme.typography.labelSmall,color=Color.Gray)
     }
    }
   }
  }
 }
}

@Composable private fun FanniLevelBadgeControls(item:JsonElement,canWrite:(String)->Boolean,onAction:(String,String,JsonObject)->Unit){
 val f=item.asJsonObject
 val id=f.get("_id")?.asString.orEmpty()
 val canEditLevel=canWrite("api/admin/fannis/$id/level")
 val canEditBadge=canWrite("api/admin/fannis/$id/badge")
 val levels=listOf("مبتدئ","ممارس","محترف","خبير مبتدئ","خبير","خبير أول","استشاري فني","نخبة","أسطوري")
 val badges=listOf("trusted","top_rated","verified","fast_response","premium","gold")
 val badgeLabels=mapOf("trusted" to "موثوق","top_rated" to "الأعلى تقييمًا","verified" to "تم التحقق","fast_response" to "سريع الاستجابة","premium" to "مميز","gold" to "ذهبي")
 var selectedLevel by remember(item){mutableStateOf(f.get("level")?.asString?:levels.first())}
 var levelMenu by remember{mutableStateOf(false)}
 var selectedBadge by remember{mutableStateOf(badges.first())}
 var badgeMenu by remember{mutableStateOf(false)}
 val currentBadges=f.get("badges")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty()
 Column(Modifier.fillMaxWidth().padding(top=10.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
  Text("المستوى الحالي: "+(f.get("level")?.asString?: "مبتدئ"),fontWeight=FontWeight.Bold,color=DarkAccent)
  Surface(shape=RoundedCornerShape(14.dp),color=Color(0xFFF1F7FB),border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFD6E6F0))){
   Column(Modifier.fillMaxWidth().padding(10.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
    Text("تغيير مستوى الفني",fontWeight=FontWeight.Bold)
    Box{
     OutlinedButton(onClick={levelMenu=true},enabled=canEditLevel,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(13.dp)){Text(selectedLevel)}
     DropdownMenu(expanded=levelMenu,onDismissRequest={levelMenu=false}){
      levels.forEach{level->DropdownMenuItem(text={Text(level)},onClick={selectedLevel=level;levelMenu=false})}
     }
    }
    Button(onClick={onAction("PATCH","api/admin/fannis/$id/level",JsonObject().apply{addProperty("level",selectedLevel)})},enabled=canEditLevel,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(14.dp),elevation=ButtonDefaults.buttonElevation(defaultElevation=5.dp,pressedElevation=1.dp)){Text("حفظ المستوى")}
   }
  }
  Text("الشارات الحالية: "+if(currentBadges.isEmpty())"لا توجد شارات" else currentBadges.map{badgeLabels[it]?:it}.joinToString("، "),style=MaterialTheme.typography.bodySmall)
  Surface(shape=RoundedCornerShape(14.dp),color=Color(0xFFFFF8E8),border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFF0D9A5))){
   Column(Modifier.fillMaxWidth().padding(10.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
    Text("إدارة الشارات",fontWeight=FontWeight.Bold,color=Color(0xFF79520A))
    Box{
     OutlinedButton(onClick={badgeMenu=true},enabled=canEditBadge,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(13.dp)){Text(badgeLabels[selectedBadge]?:selectedBadge)}
     DropdownMenu(expanded=badgeMenu,onDismissRequest={badgeMenu=false}){
      badges.forEach{badge->DropdownMenuItem(text={Text(badgeLabels[badge]?:badge)},onClick={selectedBadge=badge;badgeMenu=false})}
     }
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
     Button(onClick={onAction("PATCH","api/admin/fannis/$id/badge",JsonObject().apply{addProperty("badge",selectedBadge);addProperty("action","add")})},enabled=canEditBadge,modifier=Modifier.weight(1f),shape=RoundedCornerShape(13.dp),elevation=ButtonDefaults.buttonElevation(defaultElevation=5.dp)){Text("إضافة")}
     OutlinedButton(onClick={onAction("PATCH","api/admin/fannis/$id/badge",JsonObject().apply{addProperty("badge",selectedBadge);addProperty("action","remove")})},enabled=canEditBadge,modifier=Modifier.weight(1f),shape=RoundedCornerShape(13.dp)){Text("إزالة")}
    }
   }
  }
 }
}

@Composable private fun ProfileEditor(payload:JsonElement,id:String,onCancel:()->Unit,onSave:(String,String,JsonObject)->Unit){
 val root=payload.takeIf{it.isJsonObject}?.asJsonObject
 val f=root?.get("fanni")?.takeIf{it.isJsonObject}?.asJsonObject
 val serviceOptions=root?.get("serviceOptions")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}?.distinct().orEmpty()
 val areaOptions=root?.get("areaOptions")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}?.distinct().orEmpty()
 var phone by remember(payload){mutableStateOf(f?.get("phone")?.asString.orEmpty())}
 val selectedServices=remember(payload){androidx.compose.runtime.mutableStateListOf<String>().apply{addAll(f?.get("specialties")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty())}}
 val selectedAreas=remember(payload){androidx.compose.runtime.mutableStateListOf<String>().apply{addAll(f?.get("areas")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty())}}
 var servicesExpanded by remember{mutableStateOf(false)}
 var areasExpanded by remember{mutableStateOf(false)}
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("تعديل بيانات الفني",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.ExtraBold,color=DarkAccent)
  OutlinedTextField(phone,{phone=it},label={Text("رقم الهاتف")},modifier=Modifier.fillMaxWidth(),singleLine=true)
  Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(17.dp),color=Color.White,shadowElevation=3.dp,border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFDCE8F0))){
   Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
    Text("الخدمات والمهن",fontWeight=FontWeight.Bold,color=DarkAccent)
    Text("اختار الخدمات المعتمدة للفني بدل كتابتها يدويًا",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
    Box{
     OutlinedButton(onClick={servicesExpanded=true},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(13.dp)){Text(if(selectedServices.isEmpty())"اختيار الخدمات" else "تم اختيار ${selectedServices.size} خدمة")}
     DropdownMenu(expanded=servicesExpanded,onDismissRequest={servicesExpanded=false},modifier=Modifier.heightIn(max=360.dp)){
      serviceOptions.forEach{service->DropdownMenuItem(
       text={Text(service)},
       leadingIcon={Checkbox(checked=service in selectedServices,onCheckedChange=null)},
       onClick={if(service in selectedServices)selectedServices.remove(service) else selectedServices.add(service)}
      )}
     }
    }
    if(selectedServices.isNotEmpty())Text(selectedServices.joinToString(" • "),style=MaterialTheme.typography.bodySmall,color=Accent)
   }
  }
  Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(17.dp),color=Color.White,shadowElevation=3.dp,border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFDCE8F0))){
   Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
    Text("مناطق العمل",fontWeight=FontWeight.Bold,color=DarkAccent)
    Text("اختار المناطق من القائمة الموحدة المعتمدة",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
    Box{
     OutlinedButton(onClick={areasExpanded=true},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(13.dp)){Text(if(selectedAreas.isEmpty())"اختيار مناطق العمل" else "تم اختيار ${selectedAreas.size} منطقة")}
     DropdownMenu(expanded=areasExpanded,onDismissRequest={areasExpanded=false},modifier=Modifier.heightIn(max=360.dp)){
      areaOptions.forEach{area->DropdownMenuItem(
       text={Text(area)},
       leadingIcon={Checkbox(checked=area in selectedAreas,onCheckedChange=null)},
       onClick={if(area in selectedAreas)selectedAreas.remove(area) else selectedAreas.add(area)}
      )}
     }
    }
    if(selectedAreas.isNotEmpty())Text(selectedAreas.joinToString(" • "),style=MaterialTheme.typography.bodySmall,color=Accent)
   }
  }
  Button(onClick={
   val body=JsonObject().apply{
    addProperty("phone",phone.trim())
    add("specialties",com.google.gson.JsonArray().apply{selectedServices.forEach{add(it)}})
    add("areas",com.google.gson.JsonArray().apply{selectedAreas.forEach{add(it)}})
   }
   onSave("PATCH","api/admin/fannis/$id/profile",body)
  },enabled=phone.isNotBlank()&&selectedServices.isNotEmpty()&&selectedAreas.isNotEmpty(),modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(15.dp),elevation=ButtonDefaults.buttonElevation(defaultElevation=6.dp,pressedElevation=1.dp)){Text("حفظ بيانات الفني")}
  OutlinedButton(onClick=onCancel,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(15.dp)){Text("رجوع")}
 }
}

@Composable private fun RecoveryConversationScreen(payload:JsonElement,busy:Boolean,error:String?,message:String?,onClose:()->Unit,canWrite:(String)->Boolean,onAction:(String,String,JsonObject)->Unit){
 val recovery=payload.asJsonObject.get("recovery")?.takeIf{it.isJsonObject}?.asJsonObject?:payload.asJsonObject
 val id=recovery.get("id")?.asString.orEmpty()
 val messages=recovery.get("messages")?.takeIf{it.isJsonArray}?.asJsonArray
 var reply by remember(id){mutableStateOf("")}
 var rejectReason by remember(id){mutableStateOf("تعذر التحقق من ملكية الحساب")}
 var confirmIssue by remember(id){mutableStateOf(false)}
 var rejectOpen by remember(id){mutableStateOf(false)}
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Text("محادثة استعادة كلمة المرور",modifier=Modifier.weight(1f),style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
   TextButton(onClick=onClose){Text("رجوع")}
  }
  Text("الاسم: "+(recovery.get("accountName")?.asString?: "—"))
  Text("الهاتف: "+(recovery.get("phone")?.asString?: "—"))
  Text("نوع الحساب: "+(recovery.get("ownerRole")?.asString?: "—"))
  Text("الحالة: "+(recovery.get("status")?.asString?: "—"))
  Text("الموضوع: "+(recovery.get("subject")?.asString?: "—"))
  message?.let{Text(it,color=Color(0xFF087F55),fontWeight=FontWeight.Bold)}
  error?.let{Text(it,color=Color(0xFFB3261E))}
  Text("الرسائل",fontWeight=FontWeight.Bold,color=DarkAccent)
  messages?.forEach{entry->
   val msg=entry.asJsonObject
   Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=if(msg.get("senderRole")?.asString=="admin")Color(0xFFEAF5F7) else Color.White)){
    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
     Text(if(msg.get("senderRole")?.asString=="admin")"الإدارة" else "المستخدم",fontWeight=FontWeight.Bold)
     Text(msg.get("text")?.asString.orEmpty())
     Text(msg.get("createdAt")?.toString().orEmpty(),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
     val messageId=msg.get("id")?.asString.orEmpty()
     if(messageId.isNotBlank())TextButton(onClick={onAction("DELETE","api/password-recovery/admin/requests/$id/messages/$messageId",JsonObject())},enabled=canWrite("api/password-recovery/admin/requests/$id/messages/$messageId")){Text("حذف الرسالة",color=Color(0xFFB3261E))}
    }
   }
  }
  OutlinedTextField(reply,{reply=it},label={Text("اكتب ردًا للمستخدم")},modifier=Modifier.fillMaxWidth(),minLines=2)
  Button(onClick={onAction("POST","api/password-recovery/admin/requests/$id/reply",JsonObject().apply{addProperty("text",reply.trim())});reply=""},enabled=reply.trim().isNotEmpty()&&!busy&&canWrite("api/password-recovery/admin/requests/$id/reply"),modifier=Modifier.fillMaxWidth()){Text("إرسال الرد")}
  OutlinedButton(onClick={confirmIssue=true},enabled=!busy&&canWrite("api/password-recovery/admin/requests/$id/issue-code"),modifier=Modifier.fillMaxWidth()){Text("إصدار رمز استعادة بعد التحقق")}
  OutlinedButton(onClick={rejectOpen=true},enabled=!busy&&canWrite("api/password-recovery/admin/requests/$id/reject"),modifier=Modifier.fillMaxWidth()){Text("رفض طلب الاستعادة")}
  if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
 }
 if(confirmIssue)AlertDialog(onDismissRequest={confirmIssue=false},title={Text("تأكيد إصدار الرمز")},text={Text("تأكدت من هوية صاحب الحساب عبر المحادثة؟ الرمز صالح لمدة 10 دقائق وسيظهر مرة واحدة.")},confirmButton={TextButton(onClick={confirmIssue=false;onAction("POST","api/password-recovery/admin/requests/$id/issue-code",JsonObject())}){Text("إصدار الرمز")}},dismissButton={TextButton(onClick={confirmIssue=false}){Text("إلغاء")}})
 if(rejectOpen)AlertDialog(onDismissRequest={rejectOpen=false},title={Text("رفض طلب الاستعادة")},text={OutlinedTextField(rejectReason,{rejectReason=it},label={Text("سبب الرفض")},minLines=2)},confirmButton={TextButton(onClick={rejectOpen=false;onAction("POST","api/password-recovery/admin/requests/$id/reject",JsonObject().apply{addProperty("reason",rejectReason.trim())})}){Text("تأكيد الرفض")}},dismissButton={TextButton(onClick={rejectOpen=false}){Text("إلغاء")}})
}

@Composable private fun SupportAdminScreen(
 cases:List<JsonElement>,
 violations:List<JsonElement>,
 searchResults:List<JsonElement>,
 selected:JsonElement?,
 notice:String?,
 onRefresh:()->Unit,
 onOpen:(String)->Unit,
 onSearch:(String)->Unit,
 onAction:(String,String,JsonObject)->Unit,
 canWrite:(String)->Boolean
){
 var reply by remember(selected){mutableStateOf("")}
 var supportQuery by remember{mutableStateOf("")}
 var statusMenu by remember(selected){mutableStateOf(false)}
 var status by remember(selected){mutableStateOf(selected?.takeIf{it.isJsonObject}?.asJsonObject?.get("status")?.asString?: "جديدة")}
 val statuses=listOf("جديدة","بانتظار الدعم","قيد المعالجة","بانتظار رد المستخدم","تم الحل","مغلقة")
 val selectedObject=selected?.takeIf{it.isJsonObject}?.asJsonObject
 val selectedId=selectedObject?.get("_id")?.asString.orEmpty()
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){
   Text("محادثات خدمة العملاء",modifier=Modifier.weight(1f),style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
   TextButton(onClick=onRefresh){Text("تحديث")}
  }
  Text("إجمالي الحالات المحمّلة: ${cases.size}",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
  OutlinedTextField(supportQuery,{supportQuery=it},modifier=Modifier.fillMaxWidth(),label={Text("بحث برقم الطلب أو الهاتف أو كود التتبع")},singleLine=true)
  Button(onClick={onSearch(supportQuery)},enabled=supportQuery.trim().length>=2,modifier=Modifier.fillMaxWidth()){Text("بحث في الطلبات والشكاوى")}
  if(searchResults.isNotEmpty()){
   Text("نتائج البحث (${searchResults.size})",fontWeight=FontWeight.Bold,color=DarkAccent)
   searchResults.forEach{entry->
    val item=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
    val sn=item.get("sn")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
    val label=item.get("service")?.takeIf{!it.isJsonNull}?.asString?:item.get("text")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
     Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
      Text(if(sn.isNotBlank())"الطلب/الشكوى: $sn" else "نتيجة دعم",fontWeight=FontWeight.Bold,color=DarkAccent)
      Text(label,style=MaterialTheme.typography.bodySmall)
      Text("العميل: "+(item.get("clientName")?.toString()?.trim('"')?: "—")+" • الهاتف: "+(item.get("clientPhone")?.toString()?.trim('"')?: "—"),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
      Text("الحالة: "+(item.get("status")?.toString()?.trim('"')?: "—"),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
     }
    }
   }
  }
  Text("سجل مخالفات/عمليات الدعم (${violations.size})",fontWeight=FontWeight.Bold,color=DarkAccent)
  if(violations.isEmpty())Text("لا توجد سجلات دعم مسجلة.",color=Color.Gray)
  violations.forEach{entry->
   val item=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
   Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color(0xFFFFF8E8))){
    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
     Text(item.get("action")?.toString()?.trim('"')?: "إجراء دعم",fontWeight=FontWeight.Bold,color=DarkAccent)
     Text("المستهدف: "+(item.get("target")?.toString()?.trim('"')?: "—")+" • المشرف: "+(item.get("adminName")?.toString()?.trim('"')?: "—"),style=MaterialTheme.typography.bodySmall)
     Text(item.get("details")?.toString()?.trim('"')?: "—",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
     Text(item.get("createdAt")?.toString()?.trim('"')?: "—",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
    }
   }
  }
  if(!notice.isNullOrBlank())Text(notice,color=Color(0xFF087F55),fontWeight=FontWeight.Bold)
  Text("قائمة المحادثات",fontWeight=FontWeight.Bold,color=DarkAccent)
  if(cases.isEmpty())Text("لا توجد محادثات دعم حاليًا",color=Color.Gray)
  cases.forEach{entry->
   val item=entry.takeIf{it.isJsonObject}?.asJsonObject
   val id=item?.get("_id")?.asString.orEmpty()
   if(id.isNotBlank())Card(
    onClick={onOpen(id)},
    modifier=Modifier.fillMaxWidth(),
    colors=CardDefaults.cardColors(containerColor=if(id==selectedId)Color(0xFFEAF5F7) else Color.White)
   ){
    Column(Modifier.padding(11.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
     Text((item?.get("subject")?.asString?: "استفسار عام")+" — "+(item?.get("ownerName")?.asString?: "مستخدم"),fontWeight=FontWeight.Bold,color=DarkAccent)
     Text((if(item?.get("ownerRole")?.asString=="client")"عميل" else "فني")+" • "+(item?.get("status")?.asString?: "جديدة")+(if(item?.get("needsHuman")?.asBoolean==true)" • يحتاج تدخل" else ""),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
     Text("آخر تحديث: "+(item?.get("lastMessageAt")?.toString()?:item?.get("createdAt")?.toString().orEmpty()),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
    }
   }
  }
  if(selectedObject!=null&&selectedId.isNotBlank()){
   Divider()
   Text("تفاصيل المحادثة",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold,color=DarkAccent)
   Text("الاسم: "+(selectedObject.get("ownerName")?.asString?: "—"))
   Text("نوع الحساب: "+(if(selectedObject.get("ownerRole")?.asString=="client")"عميل" else "فني"))
   Text("الموضوع: "+(selectedObject.get("subject")?.asString?: "—"))
   Row(verticalAlignment=Alignment.CenterVertically){
    Text("الحالة:",fontWeight=FontWeight.Bold)
    Spacer(Modifier.width(8.dp))
    Box{
     OutlinedButton(onClick={statusMenu=true}){Text(status)}
     DropdownMenu(expanded=statusMenu,onDismissRequest={statusMenu=false}){
      statuses.forEach{value->DropdownMenuItem(text={Text(value)},onClick={status=value;statusMenu=false})}
     }
    }
    Spacer(Modifier.weight(1f))
    Button(onClick={onAction("PATCH","api/support/admin/$selectedId/status",JsonObject().apply{addProperty("status",status)})},enabled=canWrite("api/support/admin/$selectedId/status")){Text("حفظ الحالة")}
   }
   Text("الرسائل",fontWeight=FontWeight.Bold,color=DarkAccent)
   val messages=selectedObject.get("messages")?.takeIf{it.isJsonArray}?.asJsonArray
   if(messages==null||messages.size()==0)Text("لا توجد رسائل")
   else messages.forEach{message->
    val m=message.takeIf{it.isJsonObject}?.asJsonObject
    val role=m?.get("senderRole")?.asString.orEmpty()
    val messageId=m?.get("_id")?.asString?:m?.get("id")?.asString.orEmpty()
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=if(role=="admin")Color(0xFFEAF5F7) else Color.White)){
     Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
      Text(if(role=="admin")"دعم حمزاوي سات" else if(role=="client")"العميل" else if(role=="assistant")"المساعد" else "الفني",fontWeight=FontWeight.Bold,color=DarkAccent)
      Text(m?.get("text")?.asString.orEmpty())
      Text(m?.get("createdAt")?.toString().orEmpty(),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
      if(messageId.isNotBlank())TextButton(onClick={onAction("DELETE","api/support/admin/$selectedId/messages/$messageId",JsonObject())},enabled=canWrite("api/support/admin/$selectedId/messages/$messageId")){Text("حذف الرسالة",color=Color(0xFFB3261E))}
     }
    }
   }
   OutlinedTextField(reply,{reply=it},label={Text("اكتب ردًا للمستخدم")},modifier=Modifier.fillMaxWidth(),minLines=2)
   Button(onClick={onAction("POST","api/support/admin/$selectedId/reply",JsonObject().apply{addProperty("text",reply.trim())});reply=""},enabled=reply.trim().isNotEmpty()&&canWrite("api/support/admin/$selectedId/reply"),modifier=Modifier.fillMaxWidth()){Text("إرسال الرد")}
  }
 }
}

@Composable private fun PageVisitsScreen(payload:JsonElement?,onFilter:(String)->Unit){
 val root=payload?.takeIf{it.isJsonObject}?.asJsonObject
 val summary=root?.get("summary")?.takeIf{it.isJsonArray}?.asJsonArray?.toList().orEmpty()
 val pageOptions=remember{summary}
 val recent=root?.get("recent")?.takeIf{it.isJsonArray}?.asJsonArray?.toList().orEmpty()
 var filter by remember{mutableStateOf("")}
 var selectedPage by remember{mutableStateOf("")}
 val term=filter.trim()
 val filteredSummary=summary.filter{entry->
  val o=entry.takeIf{it.isJsonObject}?.asJsonObject
  term.isBlank()||listOf("pageName","pageKey").any{k->o?.get(k)?.toString()?.contains(term,true)==true}
 }
 val filteredRecent=recent.filter{entry->
  val o=entry.takeIf{it.isJsonObject}?.asJsonObject
  term.isBlank()||listOf("pageName","pageKey","path","referrer").any{k->o?.get(k)?.toString()?.contains(term,true)==true}
 }
 Column(Modifier.fillMaxSize().padding(horizontal=14.dp,vertical=10.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
  Text("سجل زيارات الموقع",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
  Text("إجمالي الزيارات: "+(root?.get("total")?.toString()?: "0"),fontWeight=FontWeight.Bold)
  Text("فلترة حسب الصفحة",fontWeight=FontWeight.Bold,color=DarkAccent)
  Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
   FilterChip(selected=selectedPage.isBlank(),onClick={selectedPage="";onFilter("")},label={Text("كل الصفحات")})
   pageOptions.forEach{entry->
    val obj=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
    val key=obj.get("pageKey")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
    if(key.isNotBlank())FilterChip(selected=selectedPage==key,onClick={selectedPage=key;onFilter(key)},label={Text(obj.get("pageName")?.takeIf{!it.isJsonNull}?.asString?:key)})
   }
  }
  OutlinedTextField(filter,{filter=it},label={Text("بحث داخل النتائج باسم الصفحة أو المسار")},singleLine=true,modifier=Modifier.fillMaxWidth())
  Text("ملخص الصفحات",fontWeight=FontWeight.Bold,color=DarkAccent)
  if(filteredSummary.isEmpty())Text("لا توجد صفحات مطابقة")
  filteredSummary.forEach{entry->
   val o=entry.asJsonObject
   Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
    Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
     Text(o.get("pageName")?.asString?:o.get("pageKey")?.asString.orEmpty(),fontWeight=FontWeight.Bold)
     Text("المفتاح: "+(o.get("pageKey")?.asString?: "—"),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
     Text("عدد الزيارات: "+(o.get("visits")?.toString()?: "0"))
     Text("آخر زيارة: "+(o.get("lastVisit")?.toString()?: "—"),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
    }
   }
  }
  Text("أحدث الزيارات",fontWeight=FontWeight.Bold,color=DarkAccent)
  if(filteredRecent.isEmpty())Text("لا توجد زيارات مطابقة")
  LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(7.dp)){
   items(filteredRecent){entry->
    val o=entry.asJsonObject
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
     Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
      Text(o.get("pageName")?.asString?:o.get("pageKey")?.asString.orEmpty(),fontWeight=FontWeight.Bold)
      Text("المسار: "+(o.get("path")?.asString?: "—"),style=MaterialTheme.typography.bodySmall)
      Text("المصدر: "+(o.get("referrer")?.asString?: "مباشر"),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
      Text("التوقيت: "+(o.get("visitedAt")?.toString()?: "—"),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
     }
    }
   }
  }
 }
}

@Composable private fun ReportEditor(payload:JsonElement?,onGenerate:(String,String,JsonObject)->Unit){
 var startDate by remember{mutableStateOf("")}
 var endDate by remember{mutableStateOf("")}
 var service by remember{mutableStateOf("")}
 var area by remember{mutableStateOf("")}
 val context=LocalContext.current
 val root=payload?.takeIf{it.isJsonObject}?.asJsonObject
 val summary=root?.get("summary")?.takeIf{it.isJsonObject}?.asJsonObject
 val topServices=root?.get("topServices")?.takeIf{it.isJsonArray}?.asJsonArray
 fun metricLabel(key:String)=when(key){
  "totalOrders"->"إجمالي الطلبات";"completedOrders"->"الطلبات المكتملة";"cancelledOrders"->"الطلبات الملغاة";"pendingOrders"->"الطلبات قيد المراجعة";"publishedOrders"->"الطلبات المنشورة";"approvedTechnicians"->"الفنيون المعتمدون";"activeClients"->"العملاء النشطون";else->key
 }
 fun csvCell(value:String)="\""+value.replace("\"","\"\"")+"\""
 val csv=remember(payload){
  buildString{
   append('\uFEFF')
   append(csvCell("المؤشر")).append(',').append(csvCell("القيمة")).append('\n')
   summary?.entrySet()?.forEach{entry->append(csvCell(metricLabel(entry.key))).append(',').append(csvCell(entry.value.toString())).append('\n')}
   append(csvCell("الخدمة")).append(',').append(csvCell("عدد الطلبات")).append('\n')
   topServices?.forEach{entry->
    val obj=entry.takeIf{it.isJsonObject}?.asJsonObject
    append(csvCell(obj?.get("service")?.toString()?.trim('"')?:entry.toString()))
     .append(',').append(csvCell(obj?.get("count")?.toString()?: "")).append('\n')
   }
  }
 }
 var exportMessage by remember{mutableStateOf<String?>(null)}
 val csvSaver=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")){uri->
  if(uri!=null){
   val result=runCatching{context.contentResolver.openOutputStream(uri)?.use{it.write(csv.toByteArray(Charsets.UTF_8))}?:error("تعذر فتح ملف التصدير")}
   exportMessage=if(result.isSuccess)"تم حفظ ملف CSV بنجاح" else "تعذر حفظ الملف: "+(result.exceptionOrNull()?.message?: "خطأ غير معروف")
  }
 }
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("تقارير المنصة",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
  OutlinedTextField(startDate,{startDate=it},label={Text("من تاريخ YYYY-MM-DD")},modifier=Modifier.fillMaxWidth())
  OutlinedTextField(endDate,{endDate=it},label={Text("إلى تاريخ YYYY-MM-DD")},modifier=Modifier.fillMaxWidth())
  OutlinedTextField(service,{service=it},label={Text("الخدمة")},modifier=Modifier.fillMaxWidth())
  OutlinedTextField(area,{area=it},label={Text("المنطقة")},modifier=Modifier.fillMaxWidth())
  Button(onClick={onGenerate("POST","api/admin/reports",JsonObject().apply{addProperty("startDate",startDate);addProperty("endDate",endDate);addProperty("service",service);addProperty("area",area)})},modifier=Modifier.fillMaxWidth()){Text("إنشاء التقرير")}
  if(summary!=null){
   summary.entrySet().forEach{Text(metricLabel(it.key)+" : "+it.value.toString())}
   OutlinedButton(onClick={csvSaver.launch("hamzawy-sat-report.csv")},modifier=Modifier.fillMaxWidth()){Text("حفظ التقرير كملف CSV على الجهاز")}
   exportMessage?.let{Text(it,color=if(it.startsWith("تم"))Color(0xFF087F55) else MaterialTheme.colorScheme.error)}
   OutlinedButton(onClick={
    val intent=Intent(Intent.ACTION_SEND).apply{
     type="text/csv"
     putExtra(Intent.EXTRA_SUBJECT,"تقرير حمزاوي سات")
     putExtra(Intent.EXTRA_TEXT,csv)
    }
    context.startActivity(Intent.createChooser(intent,"تصدير التقرير"))
   },modifier=Modifier.fillMaxWidth()){Text("تصدير التقرير ومشاركته بصيغة CSV")}
  }
  if(topServices!=null&&topServices.size()>0){
   Text("أكثر الخدمات طلبًا",fontWeight=FontWeight.Bold,color=DarkAccent)
   topServices.forEach{entry->
    val obj=entry.takeIf{it.isJsonObject}?.asJsonObject
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
     Row(Modifier.fillMaxWidth().padding(11.dp),verticalAlignment=Alignment.CenterVertically){
      Text(obj?.get("service")?.takeIf{!it.isJsonNull}?.asString?: "خدمة غير محددة",modifier=Modifier.weight(1f),fontWeight=FontWeight.SemiBold)
      Text((obj?.get("count")?.takeIf{!it.isJsonNull}?.toString()?: "0")+" طلب",color=Accent,fontWeight=FontWeight.Bold)
     }
    }
   }
  }
 }
}

@Composable private fun ConfigEditor(section:AdminSection,payload:JsonElement?,canWrite:(String)->Boolean,onSave:(String,String,JsonObject)->Unit){
 val root=payload?.takeIf{it.isJsonObject}?.asJsonObject
 if(section==AdminSection.SETTINGS){
  val p=root?.get("settings")?.takeIf{it.isJsonObject}?.asJsonObject
  var name by remember(payload){mutableStateOf(p?.get("siteName")?.asString.orEmpty())}
  var maintenance by remember(payload){mutableStateOf(p?.get("maintenance")?.asBoolean?:false)}
  var message by remember(payload){mutableStateOf(p?.get("maintenanceMessage")?.asString.orEmpty())}
  var attempts by remember(payload){mutableStateOf(p?.get("maxFanniSignupAttempts")?.toString().orEmpty())}
  var wallet1 by remember(payload){mutableStateOf(p?.get("walletPhone1")?.asString.orEmpty())}
  var wallet2 by remember(payload){mutableStateOf(p?.get("walletPhone2")?.asString.orEmpty())}
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   Text("إعدادات المنصة",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
   OutlinedTextField(name,{name=it},label={Text("اسم المنصة")},modifier=Modifier.fillMaxWidth())
   Row(verticalAlignment=Alignment.CenterVertically){Text("وضع الصيانة",modifier=Modifier.weight(1f));Switch(maintenance,{maintenance=it})}
   OutlinedTextField(message,{message=it},label={Text("رسالة الصيانة")},modifier=Modifier.fillMaxWidth(),minLines=2)
   OutlinedTextField(attempts,{attempts=it},label={Text("حد محاولات تسجيل الفني")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.fillMaxWidth())
   OutlinedTextField(wallet1,{wallet1=it},label={Text("رقم المحفظة الأول")},modifier=Modifier.fillMaxWidth())
   OutlinedTextField(wallet2,{wallet2=it},label={Text("رقم المحفظة الثاني")},modifier=Modifier.fillMaxWidth())
   Button(onClick={onSave("PUT","api/admin/settings",JsonObject().apply{addProperty("siteName",name.trim());addProperty("maintenance",maintenance);addProperty("maintenanceMessage",message.trim());addProperty("maxFanniSignupAttempts",attempts.toIntOrNull()?:0);addProperty("walletPhone1",wallet1.trim());addProperty("walletPhone2",wallet2.trim())})},enabled=attempts.toIntOrNull()?.let{it in 1..100}==true&&name.trim().length>=2&&canWrite("api/admin/settings"),modifier=Modifier.fillMaxWidth()){Text("حفظ الإعدادات")}
  }
 }else if(section==AdminSection.PRICING){
  val p=root?.get("pricing")?.takeIf{it.isJsonObject}?.asJsonObject
  var check by remember(payload){mutableStateOf(p?.get("check")?.toString().orEmpty())}
  var commission by remember(payload){mutableStateOf(p?.get("commission")?.toString().orEmpty())}
  var minimum by remember(payload){mutableStateOf(p?.get("minOffer")?.toString().orEmpty())}
  var maximum by remember(payload){mutableStateOf(p?.get("maxOffer")?.toString().orEmpty())}
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   Text("الأسعار والعمولات",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
   OutlinedTextField(check,{check=it},label={Text("رسوم الفرصة بالجنيه")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),modifier=Modifier.fillMaxWidth())
   OutlinedTextField(commission,{commission=it},label={Text("العمولة %")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),modifier=Modifier.fillMaxWidth())
   OutlinedTextField(minimum,{minimum=it},label={Text("أقل عرض")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.fillMaxWidth())
   OutlinedTextField(maximum,{maximum=it},label={Text("أعلى عرض")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.fillMaxWidth())
   Button(onClick={onSave("PUT","api/admin/pricing",JsonObject().apply{addProperty("check",check.toDoubleOrNull()?:0.0);addProperty("commission",commission.toDoubleOrNull()?:0.0);addProperty("minOffer",minimum.toIntOrNull()?:0);addProperty("maxOffer",maximum.toIntOrNull()?:0)})},enabled=check.toDoubleOrNull()?.let{it>=0}==true&&commission.toDoubleOrNull()?.let{it in 0.0..100.0}==true&&minimum.toIntOrNull()?.let{it in 1..1000000}==true&&maximum.toIntOrNull()?.let{it in 1..1000000}==true&&(minimum.toIntOrNull()?:Int.MAX_VALUE)<=(maximum.toIntOrNull()?:Int.MIN_VALUE)&&canWrite("api/admin/pricing"),modifier=Modifier.fillMaxWidth()){Text("حفظ الأسعار")}
   Text("سجل تغييرات الأسعار",fontWeight=FontWeight.Bold,color=DarkAccent)
   val pricingHistory=root?.get("history")?.takeIf{it.isJsonArray}?.asJsonArray
   if(pricingHistory==null||pricingHistory.size()==0)Text("لا توجد تغييرات مسجلة للأسعار حتى الآن.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
   pricingHistory?.take(100)?.forEach{entry->
    val log=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
    val before=log.get("before")?.takeIf{it.isJsonObject}?.asJsonObject
    val after=log.get("after")?.takeIf{it.isJsonObject}?.asJsonObject
    fun priceSnapshot(value:com.google.gson.JsonObject?):String{
     if(value==null)return "غير متاح"
     return "رسوم الفرصة: "+(value.get("check")?.toString()?: "—")+" جنيه • العمولة: "+(value.get("commission")?.toString()?: "—")+"% • أقل عرض: "+(value.get("minOffer")?.toString()?: "—")+" • أعلى عرض: "+(value.get("maxOffer")?.toString()?: "—")
    }
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
     Column(Modifier.padding(11.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
      Text(log.get("reason")?.takeIf{!it.isJsonNull}?.asString?: "تعديل الأسعار",fontWeight=FontWeight.Bold,color=DarkAccent)
      Text("بواسطة: "+(log.get("by")?.takeIf{!it.isJsonNull}?.asString?: "—")+" • "+(log.get("createdAt")?.takeIf{!it.isJsonNull}?.asString?: "—"),style=MaterialTheme.typography.labelSmall,color=Color.Gray)
      Text("قبل التعديل: "+priceSnapshot(before),style=MaterialTheme.typography.bodySmall)
      Text("بعد التعديل: "+priceSnapshot(after),style=MaterialTheme.typography.bodySmall,color=Color(0xFF087F55))
     }
    }
   }
  }
 }else{
  val p=root?.get("content")?.takeIf{it.isJsonObject}?.asJsonObject
  var announcement by remember(payload){mutableStateOf(p?.get("announcement")?.asString.orEmpty())}
  var announcementAudience by remember(payload){mutableStateOf(p?.get("announcementAudience")?.asString?.takeIf{it in listOf("client","fanni","both")}?: "client")}
  var question by remember(payload){mutableStateOf("")}
  var answer by remember(payload){mutableStateOf("")}
  var faqAudience by remember(payload){mutableStateOf("client")}
  var faqIndex by remember(payload){mutableStateOf(-1)}
  fun audienceLabel(value:String)=when(value){"fanni"->"الفنيون فقط";"both"->"العملاء والفنيون";else->"العملاء فقط"}
  var previewOpen by remember(payload){mutableStateOf(false)}
   var faqDeleteIndex by remember(payload){mutableStateOf<Int?>(null)}
  val faqs=p?.get("faqs")?.takeIf{it.isJsonArray}?.asJsonArray
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
   Text("الإعلانات والأسئلة الشائعة",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
   OutlinedButton(onClick={previewOpen=true},modifier=Modifier.fillMaxWidth()){Text("معاينة الإعلان والأسئلة الشائعة")}
   OutlinedTextField(announcement,{announcement=it},label={Text("نص الإعلان")},modifier=Modifier.fillMaxWidth(),minLines=3)
   Text("إرسال الإعلان إلى",fontWeight=FontWeight.SemiBold,color=DarkAccent)
   Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
    listOf("client" to "العملاء فقط","fanni" to "الفنيون فقط","both" to "العملاء والفنيون").forEach{(value,label)->FilterChip(selected=announcementAudience==value,onClick={announcementAudience=value},label={Text(label)})}
   }
   Button(onClick={onSave("PATCH","api/admin/content/announcement",JsonObject().apply{addProperty("announcement",announcement.trim());addProperty("announcementAudience",announcementAudience)})},enabled=canWrite("api/admin/content/announcement"),modifier=Modifier.fillMaxWidth()){Text("حفظ الإعلان")}
   Text("الأسئلة الشائعة",fontWeight=FontWeight.Bold,color=DarkAccent)
   faqs?.forEachIndexed{index,faq->
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
     Column(Modifier.padding(12.dp)){
      Text(faq.asJsonObject.get("question")?.asString.orEmpty(),fontWeight=FontWeight.Bold)
      Text(faq.asJsonObject.get("answer")?.asString.orEmpty(),style=MaterialTheme.typography.bodySmall)
      Text("الجمهور: "+audienceLabel(faq.asJsonObject.get("audience")?.asString?: "client")+" • الحالة: "+if(faq.asJsonObject.get("active")?.asBoolean!=false)"مفعل" else "متوقف",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
      Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
       TextButton(onClick={faqIndex=index;question=faq.asJsonObject.get("question")?.asString.orEmpty();answer=faq.asJsonObject.get("answer")?.asString.orEmpty();faqAudience=faq.asJsonObject.get("audience")?.asString?.takeIf{it in listOf("client","fanni","both")}?: "client"}){Text("تعديل")}
       TextButton(onClick={
        val body=JsonObject().apply{addProperty("announcement",announcement.trim());addProperty("announcementAudience",announcementAudience);val array=com.google.gson.JsonArray();faqs?.forEachIndexed{idx,entry->val copy=entry.asJsonObject.deepCopy();if(idx==index)copy.addProperty("active",copy.get("active")?.asBoolean==false);array.add(copy)};add("faqs",array)}
        onSave("PUT","api/admin/content",body)
       },enabled=canWrite("api/admin/content")){Text(if(faq.asJsonObject.get("active")?.asBoolean==false)"تفعيل" else "إيقاف")}
       TextButton(onClick={faqDeleteIndex=index},enabled=canWrite("api/admin/content/faqs/$index")){Text("حذف",color=Color(0xFFB3261E))}
      }
     }
    }
   }
   OutlinedTextField(question,{question=it},label={Text(if(faqIndex>=0)"تعديل السؤال" else "سؤال جديد")},modifier=Modifier.fillMaxWidth())
   OutlinedTextField(answer,{answer=it},label={Text("الإجابة")},modifier=Modifier.fillMaxWidth(),minLines=2)
   Text("عرض السؤال على",fontWeight=FontWeight.SemiBold,color=DarkAccent)
   Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
    listOf("client" to "العملاء فقط","fanni" to "الفنيون فقط","both" to "العملاء والفنيون").forEach{(value,label)->FilterChip(selected=faqAudience==value,onClick={faqAudience=value},label={Text(label)})}
   }
   Button(onClick={
    val body=JsonObject().apply{
     addProperty("announcement",announcement.trim())
     addProperty("announcementAudience",announcementAudience)
     val array=com.google.gson.JsonArray()
     faqs?.forEach{array.add(it)}
     if(faqIndex>=0&&faqIndex<array.size()){
      val old=array[faqIndex].asJsonObject.deepCopy()
      old.addProperty("question",question.trim());old.addProperty("answer",answer.trim());old.addProperty("audience",faqAudience);array.set(faqIndex,old)
     }else array.add(JsonObject().apply{addProperty("question",question.trim());addProperty("answer",answer.trim());addProperty("active",true);addProperty("audience",faqAudience)})
     add("faqs",array)
    }
    onSave("PUT","api/admin/content",body);faqIndex=-1;question="";answer="";faqAudience="client"
   },enabled=question.trim().length>=2&&answer.trim().length>=2&&canWrite("api/admin/content"),modifier=Modifier.fillMaxWidth()){Text(if(faqIndex>=0)"حفظ تعديل السؤال" else "إضافة السؤال")}
   if(faqIndex>=0)TextButton(onClick={faqIndex=-1;question="";answer="";faqAudience="client"},modifier=Modifier.fillMaxWidth()){Text("إلغاء التعديل")}
  }
  if(previewOpen)AlertDialog(
   onDismissRequest={previewOpen=false},
   title={Text("معاينة محتوى واجهة العميل")},
   text={Column(Modifier.heightIn(max=440.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(10.dp)){
    Text("الإعلان",fontWeight=FontWeight.Bold,color=DarkAccent)
    Text(announcement.ifBlank{"لا يوجد إعلان حاليًا."},style=MaterialTheme.typography.bodyMedium)
    Divider()
    Text("الأسئلة الشائعة",fontWeight=FontWeight.Bold,color=DarkAccent)
    if(faqs==null||faqs.size()==0)Text("لا توجد أسئلة شائعة.")
    faqs?.forEachIndexed{index,entry->
     val item=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@forEachIndexed
     Column(verticalArrangement=Arrangement.spacedBy(3.dp)){
      Text((index+1).toString()+". "+(item.get("question")?.takeIf{!it.isJsonNull}?.asString.orEmpty()),fontWeight=FontWeight.SemiBold)
      Text(item.get("answer")?.takeIf{!it.isJsonNull}?.asString.orEmpty(),style=MaterialTheme.typography.bodySmall)
      Text(if(item.get("active")?.asBoolean!=false)"مفعل" else "متوقف",style=MaterialTheme.typography.labelSmall,color=if(item.get("active")?.asBoolean!=false)Color(0xFF16834B) else Color.Gray)
     }
    }
   }},
   confirmButton={TextButton(onClick={previewOpen=false}){Text("إغلاق")}}
  )
  faqDeleteIndex?.let{index->
   val questionText=faqs?.get(index)?.takeIf{it.isJsonObject}?.asJsonObject?.get("question")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
   AlertDialog(
    onDismissRequest={faqDeleteIndex=null},
    title={Text("تأكيد حذف السؤال")},
    text={Text("هل تريد حذف السؤال: "+questionText+"؟")},
    confirmButton={TextButton(onClick={onSave("DELETE","api/admin/content/faqs/$index",JsonObject());faqDeleteIndex=null}){Text("تأكيد الحذف")}},
    dismissButton={TextButton(onClick={faqDeleteIndex=null}){Text("إلغاء")}}
   )
  }
 }
}

@Composable private fun UiLayoutEditorScreen(
    payload:JsonElement?,
    page:String,
    busy:Boolean,
    onPageChange:(String)->Unit,
    onAction:(String,String,JsonObject)->Unit
){
    val pages=listOf("admin" to "الإدارة","client" to "العميل","fanni" to "الفني","password" to "كلمة المرور","support" to "الدعم")
    var raw by remember(payload,page){mutableStateOf(payload?.takeIf{it.isJsonObject}?.asJsonObject?.get("layout")?.toString()?: "{}")}
    var editorError by remember(page){mutableStateOf<String?>(null)}
    var confirmReset by remember(page){mutableStateOf(false)}
    val layout=payload?.takeIf{it.isJsonObject}?.asJsonObject?.get("layout")?.takeIf{it.isJsonObject}?.asJsonObject
    val sectionLabels=mapOf("dashboard" to "الرئيسية والإحصائيات","clients" to "العملاء","technicians" to "الفنيون","finance" to "المحافظ والشحن","commerce" to "التجارة والمتجر","service-management" to "الخدمات والمناطق","customer-operations" to "عمليات العملاء","platform-admin" to "إدارة المنصة")
    val editorRoot=runCatching{JsonParser.parseString(raw).takeIf{it.isJsonObject}?.asJsonObject}.getOrNull()
    val editorLayout=editorRoot?.get("sectionOrder")?.takeIf{it.isJsonArray}?.asJsonArray
    val sectionOrder=editorLayout?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty()
    val tabOrder=editorRoot?.get("tabOrder")?.takeIf{it.isJsonObject}?.asJsonObject
    fun moveSection(index:Int,delta:Int){
        val root=runCatching{JsonParser.parseString(raw).asJsonObject}.getOrNull()?:return
        val array=root.get("sectionOrder")?.takeIf{it.isJsonArray}?.asJsonArray?:return
        val target=(index+delta).coerceIn(0,array.size()-1)
        if(target==index)return
        val reordered=array.toList().toMutableList()
        val moved=reordered.removeAt(index)
        reordered.add(target,moved)
        val updated=com.google.gson.JsonArray().apply{reordered.forEach{add(it)}}
        root.add("sectionOrder",updated)
        raw=root.toString()
    }
    fun moveTab(sectionId:String,index:Int,delta:Int){
        val root=runCatching{JsonParser.parseString(raw).asJsonObject}.getOrNull()?:return
        val groups=root.get("tabOrder")?.takeIf{it.isJsonObject}?.asJsonObject?:return
        val array=groups.get(sectionId)?.takeIf{it.isJsonArray}?.asJsonArray?:return
        val target=(index+delta).coerceIn(0,array.size()-1)
        if(target==index)return
        val reordered=array.toList().toMutableList()
        val moved=reordered.removeAt(index)
        reordered.add(target,moved)
        val updated=com.google.gson.JsonArray().apply{reordered.forEach{add(it)}}
        groups.add(sectionId,updated)
        root.add("tabOrder",groups)
        raw=root.toString()
    }
    val sectionCount=layout?.get("sectionOrder")?.takeIf{it.isJsonArray}?.asJsonArray?.size()?:0
    val elementCount=layout?.get("elements")?.takeIf{it.isJsonObject}?.asJsonObject?.size()?:0
    val tabCount=layout?.get("tabOrder")?.takeIf{it.isJsonObject}?.asJsonObject?.entrySet()?.sumOf{entry->entry.value.takeIf{it.isJsonArray}?.asJsonArray?.size()?:0}?:0
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text("محرر تخطيط الواجهات",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
        Text("أداة المدير الرئيسي لإدارة تخطيطات واجهات الإدارة والعميل والفني وكلمة المرور والدعم.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
            pages.forEach{(key,label)->
                if(page==key)Button(onClick={},enabled=false){Text(label)}
                else OutlinedButton(onClick={onPageChange(key)},enabled=!busy){Text(label)}
            }
        }
        Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
            Column(Modifier.padding(11.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
                Text("ملخص التخطيط المحفوظ",fontWeight=FontWeight.Bold,color=DarkAccent)
                Text("الأقسام: $sectionCount • التبويبات: $tabCount • العناصر المخصصة: $elementCount",style=MaterialTheme.typography.bodySmall)
                Text("يشمل JSON ترتيب الأقسام والتبويبات ومجموعاتها وأحجامها ومواقع العناصر وألوانها وخطوطها وخلفياتها وإعدادات الهاتف.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
            }
        }
        if(sectionOrder.isNotEmpty()){
            Text("معاينة ترتيب الأقسام والتبويبات",fontWeight=FontWeight.Bold,color=DarkAccent)
            sectionOrder.forEachIndexed{index,sectionId->
                val tabs=tabOrder?.get(sectionId)?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty()
                Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Text(sectionLabels[sectionId]?:sectionId,modifier=Modifier.weight(1f),fontWeight=FontWeight.SemiBold)
                            TextButton(onClick={moveSection(index,-1)},enabled=!busy&&index>0){Text("↑")}
                            TextButton(onClick={moveSection(index,1)},enabled=!busy&&index<sectionOrder.lastIndex){Text("↓")}
                        }
                        val tabRows=tabOrder?.get(sectionId)?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty()
                        tabRows.forEachIndexed{tabIndex,tabId->
                            Row(verticalAlignment=Alignment.CenterVertically){
                                Text(tabId,modifier=Modifier.weight(1f),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                                TextButton(onClick={moveTab(sectionId,tabIndex,-1)},enabled=!busy&&tabIndex>0){Text("↑")}
                                TextButton(onClick={moveTab(sectionId,tabIndex,1)},enabled=!busy&&tabIndex<tabRows.lastIndex){Text("↓")}
                            }
                        }
                    }
                }
            }
        }
        OutlinedTextField(
            value=raw,
            onValueChange={raw=it;editorError=null},
            label={Text("بيانات التخطيط بصيغة JSON")},
            modifier=Modifier.fillMaxWidth(),
            enabled=!busy,
            minLines=14,
            maxLines=30
        )
        editorError?.let{Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)}
        Button(onClick={
            val parsed=runCatching{JsonParser.parseString(raw)}.getOrNull()
            if(parsed?.isJsonObject!=true)editorError="صيغة JSON غير صحيحة؛ يجب أن يكون الجذر كائنًا."
            else{
                editorError=null
                onAction("PUT","api/admin/ui-layout/$page",JsonObject().apply{add("layout",parsed.asJsonObject)})
            }
        },enabled=!busy&&raw.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text(if(busy)"جاري الحفظ..." else "حفظ تخطيط الصفحة")}
        OutlinedButton(onClick={confirmReset=true},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("إعادة التخطيط الافتراضي لهذه الصفحة")}
    }
    if(confirmReset)AlertDialog(
        onDismissRequest={confirmReset=false},
        title={Text("إعادة التخطيط الافتراضي")},
        text={Text("سيتم حذف التخصيصات المحفوظة لواجهة "+(pages.firstOrNull{it.first==page}?.second?:page)+" وإرجاع الإعدادات الافتراضية. هل تريد المتابعة؟")},
        confirmButton={TextButton(onClick={onAction("DELETE","api/admin/ui-layout/$page",JsonObject());confirmReset=false}){Text("إعادة الافتراضي")}},
        dismissButton={TextButton(onClick={confirmReset=false}){Text("إلغاء")}}
    )
}

@Composable private fun Dashboard(stats: JsonElement?, showMonthly:Boolean, quickActions:List<AdminSection>, onOpenSection:(AdminSection)->Unit) {
    val root = stats?.takeIf { it.isJsonObject }?.asJsonObject
    val data = root?.get("counts")?.takeIf { it.isJsonObject }?.asJsonObject ?: root
    val orders = root?.get("dashboardOrders")?.takeIf { it.isJsonArray }?.asJsonArray?.toList().orEmpty()
    val topups = root?.get("dashboardTopups")?.takeIf { it.isJsonArray }?.asJsonArray?.toList().orEmpty()
    val complaints = root?.get("dashboardComplaints")?.takeIf { it.isJsonArray }?.asJsonArray?.toList().orEmpty()
    val warnings = root?.get("dashboardWarnings")?.takeIf { it.isJsonArray }?.asJsonArray?.mapNotNull { it.takeIf { value -> value.isJsonPrimitive }?.asString }.orEmpty()
    fun field(item: JsonElement, key: String): String = item.takeIf { it.isJsonObject }?.asJsonObject?.get(key)?.takeIf { !it.isJsonNull }?.asString.orEmpty()
    val approvedTopups = topups.filter { field(it, "status") == "approved" }.sumOf { field(it, "amount").toDoubleOrNull() ?: 0.0 }
    val cards = if(showMonthly) listOf(
        "إجمالي الفنيين" to (data?.get("technicians")?.toString() ?: "—"),
        "إجمالي العملاء المسجلين" to (data?.get("clients")?.toString() ?: "—"),
        "إجمالي الفنيين المعتمدين" to (data?.get("verifiedTechnicians")?.toString() ?: "—"),
        "إجمالي الطلبات" to orders.size.toString(),
        "إجمالي طلبات الشحن" to topups.size.toString(),
        "إجمالي الشحن المقبول" to String.format(java.util.Locale.US, "%.2f جنيه", approvedTopups)
    ) else listOf(
        "طلبات اليوم" to orders.size.toString(),
        "إجمالي الفنيين" to (data?.get("technicians")?.toString() ?: "—"),
        "إجمالي العملاء المسجلين" to (data?.get("clients")?.toString() ?: "—"),
        "إيرادات الشحن المقبول" to String.format(java.util.Locale.US, "%.2f جنيه", approvedTopups),
        "شكاوى جديدة" to complaints.count { field(it, "status") == "جديدة" }.toString(),
        "طلبات متأخرة تحتاج نشر" to orders.count { field(it, "status") == "قيد المراجعة" }.toString(),
        "طلبات شحن معلقة" to topups.count { field(it, "status") == "pending" }.toString()
    )
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("ملخص المنصة", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = DarkAccent)
        Spacer(Modifier.height(12.dp))
        if (!showMonthly && quickActions.isNotEmpty()) {
            Card(Modifier.fillMaxWidth().padding(bottom = 12.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("إجراءات سريعة", fontWeight = FontWeight.Bold, color = DarkAccent)
                    quickActions.chunked(2).forEach { pair ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { target ->
                                val label = when (target) {
                                    AdminSection.ORDERS -> "طلبات العملاء"
                                    AdminSection.PENDING -> "انتظار اعتماد الفنيين"
                                    AdminSection.STORE_PRODUCTS -> "إدارة المتجر"
                                    AdminSection.CONTENT -> "الإعلانات والأسئلة الشائعة"
                                    else -> target.title
                                }
                                Button(
                                    onClick = { onOpenSection(target) },
                                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) { Text(label, maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
        cards.forEach { (label, value) -> Card(Modifier.fillMaxWidth().padding(bottom = 10.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(18.dp)) { Text(label, color = Color.Gray); Text(value, style = MaterialTheme.typography.headlineMedium, color = Accent, fontWeight = FontWeight.Bold) }
        } }
        if(warnings.isNotEmpty()) Card(Modifier.fillMaxWidth().padding(bottom = 10.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF4E5))) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("تنبيه: بعض بيانات لوحة التحكم لم تُحمّل", color = Color(0xFF8A4B08), fontWeight = FontWeight.Bold)
                warnings.forEach { warning -> Text(warning, color = Color(0xFF8A4B08), style = MaterialTheme.typography.bodySmall) }
            }
        }
        if(showMonthly) MonthlyOrdersChart(monthlyOrderStats(orders))
        Text("أحدث الطلبات", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = DarkAccent, modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
        if (orders.isEmpty()) Text("لا توجد طلبات متاحة أو لا تملك صلاحية عرضها", color = Color.Gray)
        orders.take(3).forEach { order ->
            Card(Modifier.fillMaxWidth().padding(bottom = 7.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(12.dp)) {
                    Text(field(order, "sn").ifBlank { "طلب بدون رقم" }, fontWeight = FontWeight.Bold, color = DarkAccent)
                    Text(field(order, "clientName").ifBlank { "عميل" }, color = Color.DarkGray)
                    Text(field(order, "status").ifBlank { "—" }, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                }
            }
        }
    }
}

private data class MonthlyOrderStat(val label:String,val created:Int,val completed:Int)
private fun parseAdminDate(raw:String?):Date?{
 if(raw.isNullOrBlank())return null
 val patterns=listOf("yyyy-MM-dd'T'HH:mm:ss.SSSX","yyyy-MM-dd'T'HH:mm:ssX","yyyy-MM-dd")
 for(pattern in patterns){
  try{
   val parser=SimpleDateFormat(pattern,Locale.US).apply{isLenient=false;timeZone=TimeZone.getTimeZone("UTC")}
   parser.parse(raw)?.let{return it}
  }catch(_:Exception){}
 }
 return null
}
private fun monthlyOrderStats(orders:List<JsonElement>):List<MonthlyOrderStat>{
 val cairo=TimeZone.getTimeZone("Africa/Cairo")
 val now=Calendar.getInstance(cairo,Locale("ar","EG"))
 val completedStatuses=setOf("تم الانتهاء","منتهي","مكتمل")
 return (11 downTo 0).map{offset->
  val month=Calendar.getInstance(cairo,Locale("ar","EG")).apply{
   time=now.time;set(Calendar.DAY_OF_MONTH,1);set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0);add(Calendar.MONTH,-offset)
  }
  fun belongs(raw:String?):Boolean{
   val date=parseAdminDate(raw)?:return false
   val candidate=Calendar.getInstance(cairo,Locale("ar","EG")).apply{time=date}
   return candidate.get(Calendar.YEAR)==month.get(Calendar.YEAR)&&candidate.get(Calendar.MONTH)==month.get(Calendar.MONTH)
  }
  val created=orders.count{item->val obj=item.takeIf{it.isJsonObject}?.asJsonObject;belongs(obj?.get("createdAt")?.takeIf{!it.isJsonNull}?.asString)}
  val completed=orders.count{item->
   val obj=item.takeIf{it.isJsonObject}?.asJsonObject?:return@count false
   val status=obj.get("status")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
   if(status !in completedStatuses)return@count false
   val date=listOf("completedAt","updatedAt","createdAt").firstNotNullOfOrNull{key->obj.get(key)?.takeIf{!it.isJsonNull}?.asString?.takeIf{it.isNotBlank()}}
   belongs(date)
  }
  val label=SimpleDateFormat("MMM yy",Locale("ar","EG")).apply{timeZone=cairo}.format(month.time)
  MonthlyOrderStat(label,created,completed)
 }
}
@Composable private fun MonthlyOrdersChart(months:List<MonthlyOrderStat>){
 val maxValue=(months.maxOfOrNull{maxOf(it.created,it.completed)}?:0).coerceAtLeast(1)
 Card(Modifier.fillMaxWidth().padding(top=10.dp,bottom=12.dp),colors=CardDefaults.cardColors(containerColor=Color.White)){
  Column(Modifier.padding(14.dp)){
   Text("الإحصائيات الشهرية",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold,color=DarkAccent)
   Text("الطلبات المنشأة والمكتملة خلال آخر 12 شهرًا من الطلبات المحمّلة",style=MaterialTheme.typography.bodySmall,color=Color.Gray,modifier=Modifier.padding(top=3.dp,bottom=12.dp))
   Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(9.dp),verticalAlignment=Alignment.Bottom){
    months.forEach{month->
     Column(Modifier.width(54.dp),horizontalAlignment=Alignment.CenterHorizontally){
      Text("${month.created}/${month.completed}",style=MaterialTheme.typography.labelSmall,color=Color.DarkGray)
      Row(Modifier.height(104.dp).padding(top=5.dp),horizontalArrangement=Arrangement.spacedBy(4.dp),verticalAlignment=Alignment.Bottom){
       Box(Modifier.width(16.dp).height((month.created.toFloat()/maxValue*88f).coerceAtLeast(if(month.created>0)3f else 0f).dp).background(Accent,RoundedCornerShape(topStart=5.dp,topEnd=5.dp)))
       Box(Modifier.width(16.dp).height((month.completed.toFloat()/maxValue*88f).coerceAtLeast(if(month.completed>0)3f else 0f).dp).background(Color(0xFF16A36A),RoundedCornerShape(topStart=5.dp,topEnd=5.dp)))
      }
      Text(month.label,style=MaterialTheme.typography.labelSmall,color=Color.Gray,maxLines=1)
     }
    }
   }
   Row(Modifier.padding(top=10.dp),horizontalArrangement=Arrangement.spacedBy(14.dp)){
    Text("■ الطلبات المنشأة",style=MaterialTheme.typography.labelSmall,color=Accent)
    Text("■ الطلبات المكتملة",style=MaterialTheme.typography.labelSmall,color=Color(0xFF16A36A))
   }
  }
 }
}

private data class RowAction(val label:String,val method:String,val path:String,val body:JsonObject=JsonObject(),val inputKey:String?=null,val inputHint:String="",val secondInputKey:String?=null,val secondInputHint:String="")
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ListScreen(section: AdminSection, items: List<JsonElement>, dashboardStats:JsonElement?, initialQuery:String, adminInbox:List<JsonElement>, adminUnreadCount:Int, notificationDeliveries:List<JsonElement>, notificationLoadError:String?, retry: () -> Unit, onVoice:(String)->Unit, onEditProfile:(String)->Unit, onOpenIdentity:(String)->Unit, onIssueSupportPassword:(String,String)->Unit, onRevealSupportPassword:(String,String)->Unit, onIssueClientSupportPassword:(String)->Unit, onRevealClientSupportPassword:(String)->Unit, onOpenWallet:(String)->Unit, onOpenClientWallet:(String)->Unit, onOpenClientOrders:(String)->Unit, onEditClient:(String)->Unit, onClientSearch:(String)->Unit, onSupportSearch:(String)->Unit, onAuditFilter:(String)->Unit, onBulkPublish:(List<String>)->Unit, onOpenRecovery:(String)->Unit, onBulkAction:(AdminSection,List<String>,String)->Unit, onBulkRenameRegions:(Map<String,String>)->Unit, onCanWriteApi:(String)->Boolean, onCanReadApi:(String)->Boolean, onMarkNotificationRead:(String)->Unit, onMarkAllNotificationsRead:()->Unit, onAction:(String,String,JsonObject)->Unit) {
    var query by remember(section,initialQuery) { mutableStateOf(initialQuery) }
    var deleteClientOrdersPhone by remember(section){mutableStateOf("")}
    var statusFilter by remember(section) { mutableStateOf("") }
    var clientStatusFilter by remember(section) { mutableStateOf("all") }
    var availabilityFilter by remember(section) { mutableStateOf("all") }
    var regionFilter by remember(section) { mutableStateOf("") }
    var dateFilter by remember(section) { mutableStateOf("") }
    var datePickerOpen by remember(section){mutableStateOf(false)}
    val datePickerState=rememberDatePickerState()
    var pending by remember { mutableStateOf<RowAction?>(null) }
    var actionInput by remember { mutableStateOf("") }
    var actionInput2 by remember { mutableStateOf("") }
    var createOpen by remember(section){mutableStateOf(false)}
    var createAdminOpen by remember(section){mutableStateOf(false)}
    var selectedAdminFanniId by remember(section){mutableStateOf("")}
    var selectedAdminRole by remember(section){mutableStateOf("مشرف")}
    var adminFanniMenuExpanded by remember(section){mutableStateOf(false)}
    var adminRoleMenuExpanded by remember(section){mutableStateOf(false)}
    var createName by remember(section){mutableStateOf("")}
    var createCategory by remember(section){mutableStateOf("خدمات أخرى")}
    var createEmoji by remember(section){mutableStateOf("🔧")}
    var notifyOpen by remember(section){mutableStateOf(false)}
    var notifyTitle by remember(section){mutableStateOf("")}
    var notifyMessage by remember(section){mutableStateOf("")}
    var notifyRole by remember(section){mutableStateOf("fanni")}
    var notifyMode by remember(section){mutableStateOf("single")}
    var notifyPhone by remember(section){mutableStateOf("")}
    var notifyAudience by remember(section){mutableStateOf("all")}
    var notifyRoleMenuExpanded by remember(section){mutableStateOf(false)}
    var notifyModeMenuExpanded by remember(section){mutableStateOf(false)}
    var notifyAudienceMenuExpanded by remember(section){mutableStateOf(false)}
    var selectedOrders by remember(section){mutableStateOf(setOf<String>())}
    var selectedBulk by remember(section){mutableStateOf(setOf<String>())}
    var offerStatusFilter by remember(section){mutableStateOf("all")}
    var bulkRegionEditOpen by remember(section){mutableStateOf(false)}
    var bulkRegionNames by remember(section){mutableStateOf<Map<String,String>>(emptyMap())}
    var pendingBulk by remember{mutableStateOf<Pair<String,List<String>>?>(null)}
    var pendingPublishSns by remember{mutableStateOf<List<String>?>(null)}
    var categoryOrderOpen by remember(section){mutableStateOf(false)}
    var categoryOrderText by remember(section,items){mutableStateOf(items.filter{it.isJsonObject}.mapNotNull{it.asJsonObject.get("category")?.asString}.distinct().joinToString("، "))}
    var serviceOrderOpen by remember(section){mutableStateOf(false)}
    var serviceOrderCategory by remember(section,items){mutableStateOf(items.firstOrNull{it.isJsonObject}?.asJsonObject?.get("category")?.asString.orEmpty())}
    var serviceOrderText by remember(section,items){mutableStateOf(items.filter{it.isJsonObject}.filter{it.asJsonObject.get("category")?.asString==serviceOrderCategory}.sortedBy{it.asJsonObject.get("sortOrder")?.asInt?:0}.mapNotNull{it.asJsonObject.get("name")?.asString}.joinToString("، "))}
    var correctionOrder by remember{mutableStateOf<JsonElement?>(null)}
    var assigningOrder by remember{mutableStateOf<JsonElement?>(null)}
    var assigningOfferIndex by remember{mutableStateOf(0)}
    var assigningReason by remember{mutableStateOf("تعيين إداري بعد مراجعة العروض")}
    var advancedFanni by remember{mutableStateOf<JsonElement?>(null)}
    var limitFanni by remember{mutableStateOf<JsonElement?>(null)}
    var editingPermissions by remember{mutableStateOf<JsonElement?>(null)}
    fun offerCategory(order:JsonObject,offer:JsonElement):String{
        val offerObject=offer.takeIf{it.isJsonObject}?.asJsonObject
        val offerId=offerObject?.get("_id")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        val acceptedId=order.get("acceptedOfferId")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        if(acceptedId.isNotBlank()&&acceptedId==offerId)return "accepted"
        val expiry=order.get("expiresAt")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        val expiryTime=runCatching{SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.US).parse(expiry)?.time}.getOrNull()
            ?:runCatching{SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX",Locale.US).parse(expiry)?.time}.getOrNull()
        return if(expiryTime!=null&&expiryTime<=System.currentTimeMillis())"expired" else "pending"
    }
    val eligibleAdminTechnicians=remember(dashboardStats){
        dashboardStats?.takeIf{it.isJsonObject}?.asJsonObject?.get("dashboardTechnicians")?.takeIf{it.isJsonArray}?.asJsonArray?.filter{entry->
            val technician=entry.takeIf{it.isJsonObject}?.asJsonObject
            technician?.get("role")?.takeIf{!it.isJsonNull}?.asString=="fanni"&&(technician?.get("status")?.takeIf{!it.isJsonNull}?.asString.orEmpty() in listOf("approved","معتمد")||technician?.get("isApproved")?.asBoolean==true)&&technician?.get("adminRole")?.takeIf{!it.isJsonNull}?.asString.orEmpty().isBlank()
        }.orEmpty()
    }
    val filtered = remember(items, query, statusFilter, clientStatusFilter, availabilityFilter, regionFilter, dateFilter, offerStatusFilter) {
        items.filter { item ->
            val raw = item.toString()
            val obj = item.takeIf { it.isJsonObject }?.asJsonObject
            val status = listOf("status","actualStatus").mapNotNull { obj?.get(it)?.takeIf { v -> !v.isJsonNull }?.asString }.joinToString(" ")
            val region = listOf("area","region","regionName","areas","city").mapNotNull { obj?.get(it)?.takeIf { v -> !v.isJsonNull }?.toString() }.joinToString(" ")
            val date = listOf("createdAt","requestedAt","reviewedAt","visitedAt").mapNotNull { obj?.get(it)?.takeIf { v -> !v.isJsonNull }?.asString }.joinToString(" ")
            val offerMatches=if(section!=AdminSection.OFFERS||offerStatusFilter=="all")true else {
                obj?.let{order->order.get("offers")?.takeIf{it.isJsonArray}?.asJsonArray?.any{offerCategory(order,it)==offerStatusFilter}}==true
            }
            val clientStatusMatches=if(section!=AdminSection.CLIENTS||clientStatusFilter=="all")true else {
                val registered=obj?.get("registered")?.takeIf{!it.isJsonNull}?.asBoolean==true
                val suspended=obj?.get("status")?.takeIf{!it.isJsonNull}?.asString=="معلق"
                if(clientStatusFilter=="suspended")registered&&suspended else registered&&!suspended
            }
            val availabilityMatches=if(section !in listOf(AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED)||availabilityFilter=="all")true else {
                val accepting=obj?.get("acceptingOrders")?.takeIf{!it.isJsonNull}?.asBoolean!=false
                if(availabilityFilter=="paused")!accepting else accepting
            }
            (query.isBlank() || raw.contains(query.trim(), true)) &&
            (statusFilter.isBlank() || status.contains(statusFilter.trim(), true)) &&
            (regionFilter.isBlank() || region.contains(regionFilter.trim(), true)) &&
            (dateFilter.isBlank() || date.contains(dateFilter.trim(), true)) && offerMatches && clientStatusMatches && availabilityMatches
        }
    }
    val statusOptions=remember(items){items.mapNotNull{item->item.takeIf{it.isJsonObject}?.asJsonObject?.let{o->listOf("status","actualStatus").firstNotNullOfOrNull{k->o.get(k)?.takeIf{it.isJsonPrimitive&&!it.isJsonNull}?.asString}}}.filter{it.isNotBlank()}.distinct().sorted()}
    val regionOptions=remember(items){items.flatMap{item->
        val o=item.takeIf{it.isJsonObject}?.asJsonObject
        val simple=listOf("area","region","regionName","city").mapNotNull{k->o?.get(k)?.takeIf{it.isJsonPrimitive&&!it.isJsonNull}?.asString}
        val multiple=o?.get("areas")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive&&!v.isJsonNull}?.asString}.orEmpty()
        simple+multiple
    }.filter{it.isNotBlank()}.distinct().sorted()}
    val visibleOfferKeys=if(section==AdminSection.OFFERS)filtered.flatMap{entry->
        val order=entry.takeIf{it.isJsonObject}?.asJsonObject?:return@flatMap emptyList<String>()
        val sn=order.get("sn")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        order.get("offers")?.takeIf{it.isJsonArray}?.asJsonArray?.mapIndexedNotNull{index,offer->
            if(sn.isNotBlank()&&offerCategory(order,offer)!="accepted"&&(offerStatusFilter=="all"||offerCategory(order,offer)==offerStatusFilter))"$sn|$index" else null
        }.orEmpty()
    }else emptyList()
    editingPermissions?.let{admin->AdminPermissionsDialog(admin,{editingPermissions=null}){body->
        val id=admin.asJsonObject.get("_id")?.asString?:admin.asJsonObject.get("id")?.asString.orEmpty()
        editingPermissions=null
        onAction("PATCH","api/admin/admin-users/$id/permissions",body)
    }}
    advancedFanni?.let{fanni->FanniControlsDialog(fanni,{advancedFanni=null}){body->
        val id=fanni.asJsonObject.get("_id")?.asString.orEmpty();advancedFanni=null
        onAction("PATCH","api/admin/fannis/$id/profile-controls",body)
    }}
    limitFanni?.let{fanni->FanniLimitsDialog(fanni,{limitFanni=null}){body->
        val id=fanni.asJsonObject.get("_id")?.asString.orEmpty();limitFanni=null
        onAction("PATCH","api/admin/fannis/$id/limit",body)
    }}
    correctionOrder?.let{order->OrderCorrectionDialog(order,{correctionOrder=null}){body->
        val sn=order.asJsonObject.get("sn")?.asString.orEmpty()
        correctionOrder=null
        onAction("PATCH","api/admin/orders/$sn/correct",body)
    }}
    assigningOrder?.let{order->
        val orderObject=order.asJsonObject
        val offers=orderObject.get("offers")?.takeIf{it.isJsonArray}?.asJsonArray?.toList().orEmpty()
        val chosenOffer=offers.getOrNull(assigningOfferIndex)
        val offerId=chosenOffer?.takeIf{it.isJsonObject}?.asJsonObject?.get("_id")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        AlertDialog(
            onDismissRequest={assigningOrder=null},
            title={Text("تعيين فني على الطلب "+(orderObject.get("sn")?.asString.orEmpty()))},
            text={Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)){
                offers.forEachIndexed{index,offer->
                    val obj=offer.takeIf{it.isJsonObject}?.asJsonObject
                    val name=obj?.get("fanniName")?.asString?: "فني"
                    val price=obj?.get("price")?.toString()?.trim('"')?: "—"
                    Row(verticalAlignment=Alignment.CenterVertically){
                        RadioButton(selected=assigningOfferIndex==index,onClick={assigningOfferIndex=index})
                        Column(Modifier.weight(1f)){
                            Text(name,fontWeight=FontWeight.Bold)
                            Text("قيمة العرض: "+price+" جنيه",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                        }
                    }
                }
                OutlinedTextField(assigningReason,{assigningReason=it},label={Text("سبب التعيين الإداري")},modifier=Modifier.fillMaxWidth(),minLines=2)
            }},
            confirmButton={TextButton(onClick={
                val sn=orderObject.get("sn")?.asString.orEmpty()
                val body=JsonObject().apply{addProperty("offerId",offerId);addProperty("reason",assigningReason.trim())}
                assigningOrder=null
                onAction("POST","api/admin/orders/$sn/assign",body)
            },enabled=offerId.isNotBlank()&&assigningReason.trim().length>=3){Text("تأكيد التعيين")}},
            dismissButton={TextButton(onClick={assigningOrder=null}){Text("إلغاء")}}
        )
    }
    if(notifyOpen) AlertDialog(
        onDismissRequest={notifyOpen=false},
        title={Text("إرسال إشعار مباشر")},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            OutlinedTextField(notifyTitle,{notifyTitle=it.take(100)},label={Text("عنوان الإشعار")},singleLine=true)
            OutlinedTextField(notifyMessage,{notifyMessage=it.take(300)},label={Text("نص الإشعار")},minLines=2)
            Box {
                OutlinedButton(onClick={notifyRoleMenuExpanded=true},modifier=Modifier.fillMaxWidth()){Text(if(notifyRole=="client")"نوع الحساب: العملاء" else "نوع الحساب: الفنيون")}
                DropdownMenu(expanded=notifyRoleMenuExpanded,onDismissRequest={notifyRoleMenuExpanded=false}){
                    listOf("fanni" to "الفنيون","client" to "العملاء").forEach{(value,label)->DropdownMenuItem(text={Text(label)},onClick={notifyRole=value;notifyRoleMenuExpanded=false;notifyAudience="all"})}
                }
            }
            Box {
                OutlinedButton(onClick={notifyModeMenuExpanded=true},modifier=Modifier.fillMaxWidth()){Text(if(notifyMode=="group")"إرسال جماعي لفئة" else "إرسال لفرد محدد")}
                DropdownMenu(expanded=notifyModeMenuExpanded,onDismissRequest={notifyModeMenuExpanded=false}){
                    listOf("single" to "إشعار لفرد محدد","group" to "إشعار جماعي لفئة").forEach{(value,label)->DropdownMenuItem(text={Text(label)},onClick={notifyMode=value;notifyModeMenuExpanded=false})}
                }
            }
            if(notifyMode=="single")OutlinedTextField(notifyPhone,{notifyPhone=it.take(20)},label={Text("رقم هاتف المستلم")},singleLine=true)
            else {
                val audienceOptions=if(notifyRole=="fanni")listOf("all" to "جميع الفنيين","approved" to "الفنيون المعتمدون","disabled" to "الفنيون المعطلون") else listOf("all" to "جميع العملاء","active" to "العملاء النشطون","disabled" to "العملاء المعطلون")
                Box {
                    OutlinedButton(onClick={notifyAudienceMenuExpanded=true},modifier=Modifier.fillMaxWidth()){Text(audienceOptions.firstOrNull{it.first==notifyAudience}?.second?: "اختر الفئة المستهدفة")}
                    DropdownMenu(expanded=notifyAudienceMenuExpanded,onDismissRequest={notifyAudienceMenuExpanded=false}){
                        audienceOptions.forEach{(value,label)->DropdownMenuItem(text={Text(label)},onClick={notifyAudience=value;notifyAudienceMenuExpanded=false})}
                    }
                }
            }
        }},
        confirmButton={TextButton(onClick={
            val body=JsonObject().apply{addProperty("title",notifyTitle.trim());addProperty("message",notifyMessage.trim());addProperty("recipientRole",notifyRole.trim());addProperty("recipientMode",notifyMode.trim());if(notifyMode=="single")addProperty("phone",notifyPhone.trim())else addProperty("audience",notifyAudience.trim())}
            notifyOpen=false;onAction("POST","api/admin/notifications/direct",body)
        },enabled=notifyTitle.trim().length in 2..100&&notifyMessage.trim().length in 2..300&&notifyRole in listOf("fanni","client")&&notifyMode in listOf("single","group")&&(notifyMode=="group"||notifyPhone.trim().isNotBlank())&&(notifyMode=="single"||(if(notifyRole=="fanni")notifyAudience in listOf("all","approved","disabled") else notifyAudience in listOf("all","active","disabled")))){Text("إرسال")}},
        dismissButton={TextButton(onClick={notifyOpen=false}){Text("إلغاء")}}
    )
    if(bulkRegionEditOpen) AlertDialog(onDismissRequest={bulkRegionEditOpen=false},title={Text("تعديل أسماء المناطق المحددة")},text={Column(Modifier.heightIn(max=480.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)){bulkRegionNames.toList().forEach{(id,name)->OutlinedTextField(value=name,onValueChange={value->bulkRegionNames=bulkRegionNames.toMutableMap().apply{put(id,value)}},label={Text("الاسم الجديد — $name")},singleLine=true,modifier=Modifier.fillMaxWidth())}}},confirmButton={TextButton(onClick={val clean=bulkRegionNames.mapValues{it.value.trim().replace(Regex("\\s+")," ")};if(clean.values.any{it.length<2||it.length>100})return@TextButton;bulkRegionEditOpen=false;selectedBulk=emptySet();onBulkRenameRegions(clean)},enabled=bulkRegionNames.isNotEmpty()&&bulkRegionNames.values.all{it.trim().length in 2..100}){Text("حفظ الأسماء")}},dismissButton={TextButton(onClick={bulkRegionEditOpen=false}){Text("إلغاء")}})
    if(createAdminOpen)AlertDialog(
        onDismissRequest={createAdminOpen=false;adminFanniMenuExpanded=false;adminRoleMenuExpanded=false},
        title={Text("ترقية فني إلى منصب إداري")},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            val selectedTechnician=eligibleAdminTechnicians.firstOrNull{entry->val o=entry.asJsonObject;o.get("_id")?.asString==selectedAdminFanniId||o.get("id")?.asString==selectedAdminFanniId}
            val selectedObject=selectedTechnician?.asJsonObject
            OutlinedButton(onClick={adminFanniMenuExpanded=true},modifier=Modifier.fillMaxWidth()){
                Text(selectedObject?.let{(it.get("name")?.asString.orEmpty()+" — "+it.get("phone")?.asString.orEmpty()).trim(' ','—')}?: "اختر فنيًا معتمدًا")
            }
            DropdownMenu(expanded=adminFanniMenuExpanded,onDismissRequest={adminFanniMenuExpanded=false}){
                eligibleAdminTechnicians.forEach{entry->
                    val o=entry.asJsonObject
                    val id=o.get("_id")?.asString?:o.get("id")?.asString.orEmpty()
                    DropdownMenuItem(text={Text(o.get("name")?.asString.orEmpty()+" — "+o.get("phone")?.asString.orEmpty())},onClick={selectedAdminFanniId=id;adminFanniMenuExpanded=false})
                }
            }
            OutlinedButton(onClick={adminRoleMenuExpanded=true},modifier=Modifier.fillMaxWidth()){Text("المنصب: $selectedAdminRole")}
            DropdownMenu(expanded=adminRoleMenuExpanded,onDismissRequest={adminRoleMenuExpanded=false}){
                listOf("مشرف","مشرف أول","مدير","قراءة فقط").forEach{role->DropdownMenuItem(text={Text(role)},onClick={selectedAdminRole=role;adminRoleMenuExpanded=false})}
            }
            Text("تُطبّق الصلاحيات الافتراضية للمنصب تلقائيًا.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        }},
        confirmButton={TextButton(enabled=selectedAdminFanniId.isNotBlank(),onClick={
            val body=JsonObject().apply{addProperty("fanniId",selectedAdminFanniId);addProperty("role",selectedAdminRole)}
            onAction("POST","api/admin/admin-users",body);createAdminOpen=false
        }){Text("ترقية الفني")}},
        dismissButton={TextButton(onClick={createAdminOpen=false}){Text("إلغاء")}}
    )
    pendingBulk?.let{pendingAction->
        AlertDialog(
            onDismissRequest={pendingBulk=null},
            title={Text("تأكيد الإجراء الجماعي")},
            text={Text("سيتم تنفيذ «"+pendingAction.first+"» على "+pendingAction.second.size+" عناصر. العناصر غير المؤهلة سيبلغ عنها التطبيق بعد التنفيذ.")},
            confirmButton={TextButton(onClick={val action=pendingAction.first;val ids=pendingAction.second;pendingBulk=null;selectedBulk=emptySet();onBulkAction(section,ids,action)}){Text("تأكيد التنفيذ")}},
            dismissButton={TextButton(onClick={pendingBulk=null}){Text("إلغاء")}}
        )
    }
    pendingPublishSns?.let{sns->AlertDialog(
        onDismissRequest={pendingPublishSns=null},
        title={Text("تأكيد نشر الطلبات")},
        text={Text("سيتم محاولة نشر "+sns.size+" طلب. الطلب الذي لم تتم مراجعة تسجيله الصوتي سيظل غير منشور.")},
        confirmButton={TextButton(onClick={pendingPublishSns=null;onBulkPublish(sns)}){Text("تأكيد النشر")}},
        dismissButton={TextButton(onClick={pendingPublishSns=null}){Text("إلغاء")}}
    )}
    if(serviceOrderOpen) AlertDialog(
        onDismissRequest={serviceOrderOpen=false},
        title={Text("ترتيب الخدمات داخل القسم")},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            OutlinedTextField(serviceOrderCategory,{serviceOrderCategory=it},label={Text("اسم القسم")},modifier=Modifier.fillMaxWidth())
            OutlinedTextField(serviceOrderText,{serviceOrderText=it},label={Text("أسماء الخدمات بالترتيب، افصل بينها بفاصلة")},modifier=Modifier.fillMaxWidth(),minLines=4)
            Text("سيتم حفظ الترتيب حسب ترتيب الأسماء من اليمين إلى اليسار.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        }},
        confirmButton={TextButton(onClick={
            val names=serviceOrderText.split(',', '،').map{it.trim()}.filter{it.isNotEmpty()}.distinct()
            val body=JsonObject().apply{
                addProperty("category",serviceOrderCategory.trim())
                add("items",com.google.gson.JsonArray().apply{names.forEachIndexed{index,name->add(JsonObject().apply{addProperty("name",name);addProperty("sortOrder",(index+1)*10)})}})
            }
            serviceOrderOpen=false;onAction("PATCH","api/admin/services/order",body)
        },enabled=serviceOrderCategory.trim().length>=2&&serviceOrderText.trim().length>=2){Text("حفظ الترتيب")}},
        dismissButton={TextButton(onClick={serviceOrderOpen=false}){Text("إلغاء")}}
    )
    if(categoryOrderOpen) AlertDialog(
        onDismissRequest={categoryOrderOpen=false},
        title={Text("ترتيب أقسام الخدمات")},
        text={OutlinedTextField(categoryOrderText,{categoryOrderText=it},label={Text("أسماء الأقسام بالترتيب، افصل بينها بفاصلة")},modifier=Modifier.fillMaxWidth(),minLines=3)},
        confirmButton={TextButton(onClick={
            val categories=categoryOrderText.split(',', '،').map{it.trim()}.filter{it.isNotEmpty()}
            val body=JsonObject().apply{add("categories",com.google.gson.JsonArray().apply{categories.forEach{add(it)}})}
            categoryOrderOpen=false;onAction("PATCH","api/admin/services/categories/order",body)
        },enabled=categoryOrderText.trim().length>=2){Text("حفظ الترتيب")}},
        dismissButton={TextButton(onClick={categoryOrderOpen=false}){Text("إلغاء")}}
    )
    if(createOpen) AlertDialog(
        onDismissRequest={createOpen=false},
        title={Text(if(section==AdminSection.SERVICES)"إضافة خدمة" else "إضافة منطقة")},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            OutlinedTextField(createName,{createName=it},label={Text(if(section==AdminSection.SERVICES)"اسم الخدمة" else "اسم المنطقة")},singleLine=true)
            if(section==AdminSection.SERVICES){
                OutlinedTextField(createCategory,{createCategory=it},label={Text("القسم")},singleLine=true)
                OutlinedTextField(createEmoji,{createEmoji=it},label={Text("الأيقونة")},singleLine=true)
            }
        }},
        confirmButton={TextButton(onClick={
            val body=JsonObject().apply{
                if(section==AdminSection.SERVICES){addProperty("name",createName.trim());addProperty("category",createCategory.trim());addProperty("emoji",createEmoji.trim());addProperty("sortOrder",0)}
                else addProperty("name",createName.trim())
            }
            val path=if(section==AdminSection.SERVICES)"api/admin/services" else "api/admin/regions"
            createOpen=false;onAction("POST",path,body);createName=""
        },enabled=createName.trim().length>=2){Text("إضافة")}},
        dismissButton={TextButton(onClick={createOpen=false}){Text("إلغاء")}}
    )
    if(pending!=null) AlertDialog(
        onDismissRequest={pending=null},
        title={Text("تأكيد الإجراء")},
        text={Column { Text("هل تريد تنفيذ: "+pending!!.label+"؟"); if(pending!!.inputKey!=null) OutlinedTextField(actionInput,{actionInput=it},label={Text(pending!!.inputHint)},visualTransformation=if(pending!!.inputKey=="newPassword")PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,singleLine=true,modifier=Modifier.fillMaxWidth()); if(pending!!.secondInputKey!=null) OutlinedTextField(actionInput2,{actionInput2=it},label={Text(pending!!.secondInputHint)},visualTransformation=if(pending!!.secondInputKey=="confirmPassword")PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,singleLine=true,modifier=Modifier.fillMaxWidth()) }},
        confirmButton={TextButton(enabled=pending!!.inputKey!="newPassword"||(actionInput.length in 8..128&&actionInput==actionInput2),onClick={val a=pending!!;val body=a.body.deepCopy();a.inputKey?.let{k->if(k=="amount"||k=="balance"||k=="sortOrder")body.addProperty(k,actionInput.trim().toLongOrNull()?:0L) else body.addProperty(k,actionInput.trim())};a.secondInputKey?.let{k->body.addProperty(k,actionInput2.trim())};if(a.path.contains("/wallet/")&&a.path.contains("/clients/"))body.addProperty("idempotencyKey",java.util.UUID.randomUUID().toString());pending=null;actionInput="";actionInput2="";onAction(a.method,a.path,body)}){Text("تأكيد")}},
        dismissButton={TextButton(onClick={pending=null}){Text("إلغاء")}}
    )
    Column(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
        OutlinedTextField(query, { query = it }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp), label = { Text("بحث في " + section.title) }, singleLine = true)
        if(section==AdminSection.CLIENTS) Button(onClick={onClientSearch(query)},enabled=query.trim().length>=2,modifier=Modifier.fillMaxWidth()){Text("بحث في جميع العملاء على الخادم")}
        if(section==AdminSection.ROLES&&onCanWriteApi("api/admin/admin-users")){
            if(eligibleAdminTechnicians.isEmpty())Text("لا يوجد فني معتمد متاح للترقية حاليًا.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
            Button(onClick={selectedAdminFanniId=eligibleAdminTechnicians.firstOrNull()?.let{it.asJsonObject.get("_id")?.asString?:it.asJsonObject.get("id")?.asString}.orEmpty();createAdminOpen=true},enabled=eligibleAdminTechnicians.isNotEmpty(),modifier=Modifier.fillMaxWidth()){Text("ترقية فني معتمد إلى منصب إداري")}
        }
        if(section==AdminSection.ORDERS){
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp),verticalAlignment=Alignment.CenterVertically){
                OutlinedTextField(deleteClientOrdersPhone,{deleteClientOrdersPhone=it.filter{ch->ch.isDigit()}.take(11)},modifier=Modifier.weight(1f),label={Text("حذف طلبات رقم العميل")},placeholder={Text("01xxxxxxxxx")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Phone),singleLine=true)
                Button(onClick={pending=RowAction("حذف طلبات العميل","DELETE","api/admin/clients/"+Uri.encode(deleteClientOrdersPhone))},enabled=onCanWriteApi("api/admin/clients/01000000000")&&Regex("^01[0-9]{9}$").matches(deleteClientOrdersPhone)){Text("حذف الطلبات")}
            }
        }
        if((section==AdminSection.SERVICES&&onCanWriteApi("api/admin/services"))||(section==AdminSection.REGIONS&&onCanWriteApi("api/admin/regions"))) Button(onClick={createOpen=true},modifier=Modifier.fillMaxWidth()){Text(if(section==AdminSection.SERVICES)"إضافة خدمة جديدة" else "إضافة منطقة جديدة")}
        if(section==AdminSection.SERVICES&&onCanWriteApi("api/admin/services/categories/order")) Button(onClick={categoryOrderOpen=true},modifier=Modifier.fillMaxWidth()){Text("ترتيب أقسام الخدمات")}
        if(section==AdminSection.SERVICES&&onCanWriteApi("api/admin/services/order")) OutlinedButton(onClick={serviceOrderOpen=true},modifier=Modifier.fillMaxWidth()){Text("ترتيب الخدمات داخل القسم")}
        if(section==AdminSection.NOTIFICATIONS&&onCanWriteApi("api/admin/notifications/direct")) Button(onClick={notifyOpen=true},modifier=Modifier.fillMaxWidth()){Text("إنشاء وإرسال إشعار")}
        if(section==AdminSection.NOTIFICATIONS) AdminNotificationAuditPanel(adminInbox,adminUnreadCount,notificationDeliveries,notificationLoadError,onCanReadApi("api/notifications/admin"),onCanWriteApi("api/notifications/admin/read-all"),onMarkNotificationRead,onMarkAllNotificationsRead)
        if(section==AdminSection.SUPPORT) Button(onClick={onSupportSearch(query)},enabled=query.trim().length>=2,modifier=Modifier.fillMaxWidth()){Text("بحث في الطلبات والشكاوى وأرقام الهواتف")}
        if(selectedBulk.isNotEmpty()){
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                Text("المحدد: "+selectedBulk.size,modifier=Modifier.align(Alignment.CenterVertically),fontWeight=FontWeight.Bold)
                fun runBulk(action:String){pendingBulk=action to selectedBulk.toList()}
                when(section){
                    AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED->{
                        if(onCanWriteApi("api/admin/fannis/x/approve"))Button(onClick={runBulk("approve")}){Text("اعتماد")}
                        if(onCanWriteApi("api/admin/fannis/x/reject"))Button(onClick={runBulk("reject")}){Text("رفض")}
                        if(onCanWriteApi("api/admin/fannis/x/disable"))Button(onClick={runBulk("disable")}){Text("إيقاف")}
                        if(onCanWriteApi("api/admin/fannis/x/enable"))Button(onClick={runBulk("enable")}){Text("تفعيل")}
                        if(onCanWriteApi("api/admin/wallet/freeze/x"))Button(onClick={runBulk("freeze")}){Text("تجميد المحافظ")}
                        if(onCanWriteApi("api/admin/wallet/freeze/x"))Button(onClick={runBulk("unfreeze")}){Text("فك التجميد")}
                    }
                    AdminSection.WALLETS->{if(onCanWriteApi("api/admin/wallet/freeze/x")){Button(onClick={runBulk("freeze")}){Text("تجميد المحافظ")};Button(onClick={runBulk("unfreeze")}){Text("فك التجميد")}}}
                    AdminSection.TOPUPS->{if(onCanWriteApi("api/admin/topup-requests/x/approve"))Button(onClick={runBulk("approve")}){Text("قبول الشحن")};if(onCanWriteApi("api/admin/topup-requests/x/reject"))Button(onClick={runBulk("reject")}){Text("رفض الشحن")}}
                    AdminSection.CLIENTS->{if(onCanWriteApi("api/admin/clients/x/account"))Button(onClick={runBulk("delete")}){Text("حذف الحسابات المحددة")}}
                    AdminSection.COMPLAINTS->{if(onCanWriteApi("api/admin/complaints/x")){Button(onClick={runBulk("قيد المراجعة")}){Text("مراجعة")};Button(onClick={runBulk("تم الحل")}){Text("حل الشكاوى")};Button(onClick={runBulk("مرفوضة")}){Text("رفض")}}}
                    AdminSection.OFFERS->{if(onCanWriteApi("api/admin/offers/SN000000/0/reject"))Button(onClick={runBulk("reject")}){Text("رفض العروض")}}
                    AdminSection.REGIONS->{if(onCanWriteApi("api/admin/regions/x")){OutlinedButton(onClick={bulkRegionNames=items.filter{it.isJsonObject}.mapNotNull{item->val obj=item.asJsonObject;val id=obj.get("_id")?.asString?:obj.get("id")?.asString; if(id!=null&&id in selectedBulk) id to (obj.get("name")?.asString.orEmpty()) else null}.toMap();bulkRegionEditOpen=true}){Text("تعديل أسماء المحدد")};Button(onClick={runBulk("activate")}){Text("تفعيل")};Button(onClick={runBulk("deactivate")}){Text("إيقاف")};Button(onClick={runBulk("restore")}){Text("استعادة")};Button(onClick={runBulk("delete")}){Text("حذف")}}}
                    else->Unit
                }
                OutlinedButton(onClick={selectedBulk=emptySet()}){Text("إلغاء")}
            }
        }
        if(section==AdminSection.ORDERS && selectedOrders.isNotEmpty()){
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                if(onCanWriteApi("api/orders/admin/SN000000/publish"))Button(onClick={pendingPublishSns=selectedOrders.toList();selectedOrders=emptySet()},modifier=Modifier.weight(1f)){Text("نشر المحدد ("+selectedOrders.size+")")}
                if(onCanWriteApi("api/admin/orders/bulk-delete"))Button(onClick={
                    val body=JsonObject().apply{add("sns",com.google.gson.JsonArray().apply{selectedOrders.forEach{add(it)}})}
                    pending=RowAction("حذف الطلبات المحددة","POST","api/admin/orders/bulk-delete",body);selectedOrders=emptySet()
                },modifier=Modifier.weight(1f)){Text("حذف المحدد")}
                OutlinedButton(onClick={selectedOrders=emptySet()},modifier=Modifier.weight(1f)){Text("إلغاء")}
            }
        }
        Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(6.dp)){
            if(section in listOf(AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED)&&items.any{it.isJsonObject&&it.asJsonObject.has("acceptingOrders")}){
                Text("استقبال الطلبات الجديدة",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    val acceptingCount=items.count{it.isJsonObject&&it.asJsonObject.get("acceptingOrders")?.asBoolean!=false}
                    val pausedCount=items.count{it.isJsonObject&&it.asJsonObject.get("acceptingOrders")?.asBoolean==false}
                    FilterChip(selected=availabilityFilter=="all",onClick={availabilityFilter="all"},label={Text("الكل (${items.size})")})
                    FilterChip(selected=availabilityFilter=="accepting",onClick={availabilityFilter="accepting"},label={Text("يستقبل طلبات (${acceptingCount})")})
                    FilterChip(selected=availabilityFilter=="paused",onClick={availabilityFilter="paused"},label={Text("موقف الاستقبال (${pausedCount})")})
                }
            }
            if(section==AdminSection.CLIENTS){
                Text("حالة حساب العميل",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    val activeCount=items.count{it.isJsonObject&&it.asJsonObject.get("registered")?.asBoolean==true&&it.asJsonObject.get("status")?.asString!="معلق"}
                    val suspendedCount=items.count{it.isJsonObject&&it.asJsonObject.get("registered")?.asBoolean==true&&it.asJsonObject.get("status")?.asString=="معلق"}
                    FilterChip(selected=clientStatusFilter=="all",onClick={clientStatusFilter="all"},label={Text("كل العملاء")})
                    FilterChip(selected=clientStatusFilter=="active",onClick={clientStatusFilter="active"},label={Text("النشطون ($activeCount)")})
                    FilterChip(selected=clientStatusFilter=="suspended",onClick={clientStatusFilter="suspended"},label={Text("الموقوفون ($suspendedCount)")})
                }
            }
            if(section==AdminSection.OFFERS&&visibleOfferKeys.isNotEmpty())Row(verticalAlignment=Alignment.CenterVertically){
                Checkbox(checked=visibleOfferKeys.all{it in selectedBulk},onCheckedChange={checked->selectedBulk=if(checked)selectedBulk+visibleOfferKeys else selectedBulk-visibleOfferKeys.toSet()})
                Text("تحديد كل العروض غير المقبولة الظاهرة ("+visibleOfferKeys.size+")",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
            }
            if(section==AdminSection.OFFERS){
                Text("حالة العرض",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    listOf("all" to "كل العروض","accepted" to "مقبولة","pending" to "بانتظار القرار","expired" to "منتهية").forEach{(key,label)->
                        FilterChip(selected=offerStatusFilter==key,onClick={offerStatusFilter=key},label={Text(label)})
                    }
                }
            }
            if(section!=AdminSection.OFFERS&&section!=AdminSection.CLIENTS&&statusOptions.isNotEmpty()){
                Text("الحالة",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    FilterChip(selected=statusFilter.isBlank(),onClick={statusFilter=""},label={Text("كل الحالات")})
                    statusOptions.forEach{value->FilterChip(selected=statusFilter==value,onClick={statusFilter=if(statusFilter==value)"" else value},label={Text(value)})}
                }
            }
            if(regionOptions.isNotEmpty()){
                Text("المنطقة",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    FilterChip(selected=regionFilter.isBlank(),onClick={regionFilter=""},label={Text("كل المناطق")})
                    regionOptions.forEach{value->FilterChip(selected=regionFilter==value,onClick={regionFilter=if(regionFilter==value)"" else value},label={Text(value)})}
                }
            }
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){
                OutlinedTextField(dateFilter,{dateFilter=it},modifier=Modifier.weight(1f),label={Text("التاريخ YYYY-MM-DD")},singleLine=true)
                TextButton(onClick={datePickerOpen=true}){Text("التقويم")}
                TextButton(onClick={statusFilter="";clientStatusFilter="all";availabilityFilter="all";offerStatusFilter="all";regionFilter="";dateFilter=""}){Text("مسح")}
            }
        }
        if(datePickerOpen)DatePickerDialog(
            onDismissRequest={datePickerOpen=false},
            confirmButton={TextButton(enabled=datePickerState.selectedDateMillis!=null,onClick={
                datePickerState.selectedDateMillis?.let{millis->dateFilter=SimpleDateFormat("yyyy-MM-dd",Locale.US).apply{timeZone=TimeZone.getTimeZone("UTC")}.format(Date(millis))}
                datePickerOpen=false
            }){Text("اختيار")}},
            dismissButton={TextButton(onClick={datePickerOpen=false}){Text("إلغاء")}}
        ){DatePicker(state=datePickerState)}
        if(section==AdminSection.SECURITY) Button(onClick={onAuditFilter(dateFilter)},modifier=Modifier.fillMaxWidth()){Text(if(dateFilter.isBlank())"تحديث سجل التدقيق" else "تصفية سجل التدقيق بالتاريخ")}
        if (filtered.isEmpty()) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(if (items.isEmpty()) "لا توجد بيانات متاحة حاليًا" else "لا توجد نتائج مطابقة")
                if (items.isEmpty()) OutlinedButton(onClick = retry, modifier = Modifier.padding(top = 10.dp)) { Text("إعادة المحاولة") }
            }
        } else LazyColumn(contentPadding = PaddingValues(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered) { item ->
                val actions=rowActions(section,item).filter{onCanWriteApi(it.path)}
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        if(section==AdminSection.ORDERS&&(onCanWriteApi("api/orders/admin/SN000000/publish")||onCanWriteApi("api/admin/orders/bulk-delete"))){
                            val orderSn=item.asJsonObject.get("sn")?.asString.orEmpty()
                            if(orderSn.isNotBlank())Row(verticalAlignment=Alignment.CenterVertically){
                                Checkbox(checked=selectedOrders.contains(orderSn),onCheckedChange={checked->selectedOrders=if(checked)selectedOrders+orderSn else selectedOrders-orderSn})
                                Text("تحديد الطلب "+orderSn,style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                            }
                        }
                        val bulkKey=when(section){
                            AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED,AdminSection.WALLETS,AdminSection.TOPUPS,AdminSection.COMPLAINTS,AdminSection.REGIONS->item.asJsonObject.get("_id")?.asString?:item.asJsonObject.get("id")?.asString
                            AdminSection.CLIENTS->item.asJsonObject.get("phone")?.asString?.takeIf{it.isNotBlank()}
                            else->null
                        }
                        val canSelectBulk=when(section){
                            AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED->onCanWriteApi("api/admin/fannis/x/approve")||onCanWriteApi("api/admin/wallet/freeze/x")
                            AdminSection.WALLETS->onCanWriteApi("api/admin/wallet/freeze/x")
                            AdminSection.TOPUPS->onCanWriteApi("api/admin/topup-requests/x/approve")
                            AdminSection.COMPLAINTS->onCanWriteApi("api/admin/complaints/x")
                            AdminSection.OFFERS->onCanWriteApi("api/admin/offers/SN000000/0/reject")
                            AdminSection.REGIONS->onCanWriteApi("api/admin/regions/x")
                            AdminSection.CLIENTS->onCanWriteApi("api/admin/clients/x/account")
                            else->false
                        }
                        if(bulkKey!=null&&canSelectBulk)Row(verticalAlignment=Alignment.CenterVertically){
                            Checkbox(checked=selectedBulk.contains(bulkKey),onCheckedChange={checked->selectedBulk=if(checked)selectedBulk+bulkKey else selectedBulk-bulkKey})
                            Text("تحديد للإجراء الجماعي",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                        }
                        Text(primary(item,section), fontWeight = FontWeight.Bold, color = DarkAccent)
                        val detail = secondary(item, section)
                        if (detail.isNotBlank()) Text(detail, color = Color.DarkGray, modifier = Modifier.padding(top = 5.dp))
                        if(section in listOf(AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED)&&item.isJsonObject&&item.asJsonObject.has("acceptingOrders")){
                            val accepting=item.asJsonObject.get("acceptingOrders")?.asBoolean!=false
                            Surface(shape=RoundedCornerShape(10.dp),color=if(accepting)Color(0xFFE8F5EC) else Color(0xFFFFF4E5),modifier=Modifier.padding(top=6.dp)){
                                Text(if(accepting)"يستقبل طلبات جديدة" else "موقف استقبال الطلبات",modifier=Modifier.padding(horizontal=9.dp,vertical=5.dp),color=if(accepting)Color(0xFF176B45) else Color(0xFF8A5A00),style=MaterialTheme.typography.labelSmall,fontWeight=FontWeight.Bold)
                            }
                        }
                        if(section==AdminSection.ORDERS&&item.isJsonObject){
                            val order=item.asJsonObject
                            fun orderValue(key:String):String=order.get(key)?.takeIf{!it.isJsonNull}?.toString()?.trim('"').orEmpty()
                            Card(Modifier.fillMaxWidth().padding(top=7.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFF4F8FA))){
                                Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
                                    Text("تفاصيل التنفيذ والمالية",fontWeight=FontWeight.Bold,color=DarkAccent)
                                    Text("الميزانية الأصلية: "+orderValue("budget").ifBlank{"غير محددة"}+" جنيه",style=MaterialTheme.typography.bodySmall)
                                    Text("الفني المنفذ: "+orderValue("assignedFanniName").ifBlank{"لم يُعيّن بعد"},style=MaterialTheme.typography.bodySmall)
                                    Text("قيمة العرض المقبول: "+orderValue("acceptedOfferPrice").ifBlank{"لا يوجد"}+" جنيه",style=MaterialTheme.typography.bodySmall)
                                    Text("العمولة: "+orderValue("commissionRate").ifBlank{"—"}+"% • "+orderValue("commissionAmount").ifBlank{"—"}+" جنيه",style=MaterialTheme.typography.bodySmall)
                                    Text("حالة الدفع: "+orderValue("clientPaymentStatus").ifBlank{"غير محددة"}+(if(order.get("commissionCharged")?.asBoolean==true)" • تم تسجيل العمولة" else ""),style=MaterialTheme.typography.bodySmall)
                                    val offers=order.get("offers")?.takeIf{it.isJsonArray}?.asJsonArray?.toList().orEmpty()
                                    if(offers.isNotEmpty()){
                                        Divider()
                                        Text("العروض المقدمة: "+offers.size,fontWeight=FontWeight.SemiBold,style=MaterialTheme.typography.bodySmall)
                                        offers.forEachIndexed{index,offer->
                                            val itemOffer=offer.takeIf{it.isJsonObject}?.asJsonObject
                                            Text((index+1).toString()+". "+(itemOffer?.get("fanniName")?.takeIf{!it.isJsonNull}?.asString?: "فني")+" — "+(itemOffer?.get("price")?.toString()?: "—")+" جنيه",style=MaterialTheme.typography.bodySmall)
                                            itemOffer?.get("note")?.takeIf{!it.isJsonNull}?.asString?.takeIf{it.isNotBlank()}?.let{Text(it,style=MaterialTheme.typography.labelSmall,color=Color.Gray)}
                                        }
                                    }
                                }
                            }
                        }
                        if(section in listOf(AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED)&&item.isJsonObject){
                            val technician=item.asJsonObject
                            val activeServices=technician.get("activeSpecialties")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->!v.isJsonNull}?.asString}?.toSet().orEmpty()
                            val works=technician.get("works")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->!v.isJsonNull}?.asString}?.filter{activeServices.isEmpty()||it.trim() in activeServices}.orEmpty()
                            val prices=technician.get("prices")?.takeIf{it.isJsonObject}?.asJsonObject
                            val priceRows=prices?.entrySet()?.filter{activeServices.isEmpty()||it.key in activeServices}.orEmpty()
                            if(works.isNotEmpty()||priceRows.isNotEmpty()){
                                Card(Modifier.fillMaxWidth().padding(top=7.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFF4F8FA))){
                                    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
                                        Text("الأعمال والأسعار المسجلة",fontWeight=FontWeight.Bold,color=DarkAccent)
                                        works.forEach{Text("• "+it,style=MaterialTheme.typography.bodySmall)}
                                        priceRows.forEach{entry->
                                            val value=entry.value.takeIf{it.isJsonObject}?.asJsonObject
                                            val from=value?.get("from")?.takeIf{!it.isJsonNull}?.toString().orEmpty()
                                            val desc=value?.get("desc")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
                                            Text(entry.key+" — "+listOf(from,desc).filter{it.isNotBlank()}.joinToString(" • "),style=MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                        }
                        if(section==AdminSection.OFFERS && item.isJsonObject){
                            val orderSn=item.asJsonObject.get("sn")?.asString.orEmpty()
                            item.asJsonObject.get("offers")?.takeIf{it.isJsonArray}?.asJsonArray?.forEachIndexed{index,offer->
                                if(offerStatusFilter=="all"||offerCategory(item.asJsonObject,offer)==offerStatusFilter){
                                val offerObject=offer.takeIf{it.isJsonObject}?.asJsonObject
                                val offerState=offerCategory(item.asJsonObject,offer)
                                Card(Modifier.fillMaxWidth().padding(top=6.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFF4F8FA))){
                                    Column(Modifier.padding(10.dp)){
                                        Text("العرض "+(index+1)+" • "+when(offerState){"accepted"->"مقبول";"expired"->"منتهي";else->"بانتظار القرار"},fontWeight=FontWeight.Bold)
                                        Row(verticalAlignment=Alignment.CenterVertically){
                                            val offerKey="$orderSn|$index"
                                            Checkbox(checked=selectedBulk.contains(offerKey),onCheckedChange={checked->selectedBulk=if(checked)selectedBulk+offerKey else selectedBulk-offerKey})
                                            Text("تحديد العرض",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                                        }
                                        Text("الفني: "+(offerObject?.get("fanniName")?.takeIf{!it.isJsonNull}?.asString?: "غير محدد"),style=MaterialTheme.typography.bodySmall)
                                        Text("قيمة العرض: "+(offerObject?.get("price")?.takeIf{!it.isJsonNull}?.toString()?: "—")+" جنيه",style=MaterialTheme.typography.bodySmall)
                                        offerObject?.get("note")?.takeIf{!it.isJsonNull}?.asString?.takeIf{it.isNotBlank()}?.let{Text("ملاحظات: "+it,style=MaterialTheme.typography.bodySmall,color=Color.Gray)}
                                        if(offerState!="accepted"){
                                            OutlinedButton(onClick={pending=RowAction("حذف العرض","DELETE","api/admin/offers/$orderSn/$index")},modifier=Modifier.fillMaxWidth()){Text("حذف العرض")}
                                            OutlinedButton(onClick={pending=RowAction("رفض العرض","POST","api/admin/offers/$orderSn/$index/reject")},modifier=Modifier.fillMaxWidth()){Text("رفض العرض")}
                                        }
                                    }
                                }
                                }
                            }
                        }
                        if(section==AdminSection.ROLES){
                            val adminId=item.asJsonObject.get("_id")?.asString?:item.asJsonObject.get("id")?.asString.orEmpty()
                            if(adminId.isNotBlank()&&item.asJsonObject.get("isRootAdmin")?.asBoolean!=true)OutlinedButton(onClick={editingPermissions=item},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("تخصيص صلاحيات القراءة والتنفيذ")}
                        }
                        if(section==AdminSection.RECOVERY){
                            val recoveryId=item.asJsonObject.get("id")?.asString?:item.asJsonObject.get("_id")?.asString.orEmpty()
                            if(recoveryId.isNotBlank())OutlinedButton(onClick={onOpenRecovery(recoveryId)},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("فتح محادثة استعادة كلمة المرور")}
                        }
                        if(section==AdminSection.LEVELS && item.isJsonObject){
                            val fanniId=item.asJsonObject.get("_id")?.asString.orEmpty()
                            if(fanniId.isNotBlank()) FanniLevelBadgeControls(item,onCanWriteApi) { method,path,body -> onAction(method,path,body) }
                        }
                        if(section==AdminSection.PROFILE_EDITS && item.isJsonObject){
                            val pending=item.asJsonObject.get("pendingProfileChange")?.takeIf{it.isJsonObject}?.asJsonObject
                            val before=pending?.get("before")?.takeIf{it.isJsonObject}?.asJsonObject
                            if(pending!=null){
                                Card(Modifier.fillMaxWidth().padding(top=8.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFF4F8FA))){
                                    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                                        Text("مقارنة طلب تعديل البيانات",fontWeight=FontWeight.Bold,color=DarkAccent)
                                        Text("البيانات الحالية",fontWeight=FontWeight.SemiBold)
                                        Text("الهاتف: "+(before?.get("phone")?.asString?:item.asJsonObject.get("phone")?.asString.orEmpty()))
                                        Text("التخصصات: "+(before?.get("specialties")?.toString()?: "—"))
                                        Text("مناطق العمل: "+(before?.get("areas")?.toString()?: "—"))
                                        Divider()
                                        Text("البيانات المطلوبة",fontWeight=FontWeight.SemiBold,color=Accent)
                                        Text("الهاتف: "+(pending.get("phone")?.asString?:before?.get("phone")?.asString.orEmpty()))
                                        Text("التخصصات: "+(pending.get("specialties")?.toString()?:before?.get("specialties")?.toString().orEmpty()))
                                        Text("مناطق العمل: "+(pending.get("areas")?.toString()?:before?.get("areas")?.toString().orEmpty()))
                                        Text("الحقول المطلوبة: "+(pending.get("changedFields")?.toString()?: "—"),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                                    }
                                }
                            }
                        }
                        if(section in listOf(AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED)&&item.isJsonObject){
                            val fanniId=item.asJsonObject.get("_id")?.asString?:item.asJsonObject.get("id")?.asString.orEmpty()
                            if(fanniId.isNotBlank())OutlinedButton(onClick={onOpenIdentity(fanniId)},modifier=Modifier.fillMaxWidth().padding(top=6.dp)){Text("عرض صور بطاقة الرقم القومي")}
                            if(fanniId.isNotBlank()&&(onCanWriteApi("api/password-recovery/admin/support-passwords")||onCanReadApi("api/password-recovery/admin/support-passwords"))){
                                Row(Modifier.fillMaxWidth().padding(top=6.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                                    if(onCanWriteApi("api/password-recovery/admin/support-passwords"))OutlinedButton(onClick={onIssueSupportPassword("fanni",fanniId)},modifier=Modifier.weight(1f)){Text("إصدار كلمة دعم")}
                                    if(onCanReadApi("api/password-recovery/admin/support-passwords"))OutlinedButton(onClick={onRevealSupportPassword("fanni",fanniId)},modifier=Modifier.weight(1f)){Text("عرض كلمة الدعم")}
                                }
                            }
                        }
                        if(section==AdminSection.CLIENTS&&onCanWriteApi("api/admin/client-accounts/x/profile")){
                            val clientId=item.asJsonObject.get("_id")?.asString?:item.asJsonObject.get("id")?.asString.orEmpty()
                            if(clientId.isNotBlank())OutlinedButton(onClick={onEditClient(clientId)},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("تعديل بيانات العميل")}
                        }
                        if(section==AdminSection.CLIENTS&&item.isJsonObject){
                            val clientPhone=item.asJsonObject.get("phone")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
                            if(clientPhone.isNotBlank())OutlinedButton(onClick={onOpenClientOrders(clientPhone)},modifier=Modifier.fillMaxWidth().padding(top=5.dp)){Text("عرض طلبات العميل")}
                        }
                        if((section==AdminSection.CLIENTS||section==AdminSection.CLIENT_WALLETS)&&item.isJsonObject){
                            val client=item.asJsonObject
                            val clientId=client.get("_id")?.asString?:client.get("id")?.asString.orEmpty()
                            val registered=client.get("registered")?.asBoolean?:clientId.isNotBlank()
                            if(registered&&clientId.isNotBlank()){
                                val balance=client.get("walletBalance")?.takeIf{!it.isJsonNull}?.toString()?.trim('"')?: "0"
                                val accountStatus=client.get("status")?.takeIf{!it.isJsonNull}?.asString?: "غير محدد"
                                val walletFrozen=client.get("walletFrozen")?.asBoolean==true
                                Card(Modifier.fillMaxWidth().padding(top=8.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFEAF7F0))){
                                    Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                                        Text("محفظة العميل: $balance ج",fontWeight=FontWeight.Bold,color=Color(0xFF176B45))
                                        Text("حالة الحساب: $accountStatus • المحفظة: "+if(walletFrozen)"مجمدة" else "نشطة",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                                        if(onCanReadApi("api/admin/client-wallet/transactions/$clientId"))
                                            OutlinedButton(onClick={onOpenClientWallet(clientId)},modifier=Modifier.fillMaxWidth()){Text("كشف حركات محفظة العميل")}
                                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                                            if(onCanWriteApi("api/admin/clients/$clientId/wallet/add-balance"))
                                                OutlinedButton(onClick={pending=RowAction("إضافة رصيد للعميل","POST","api/admin/clients/$clientId/wallet/add-balance",JsonObject(),"amount","المبلغ بالجنيه","reason","سبب الإضافة") ;actionInput="";actionInput2=""},modifier=Modifier.weight(1f)){Text("إضافة")}
                                            if(onCanWriteApi("api/admin/clients/$clientId/wallet/deduct-balance"))
                                                OutlinedButton(onClick={pending=RowAction("خصم رصيد من العميل","POST","api/admin/clients/$clientId/wallet/deduct-balance",JsonObject(),"amount","المبلغ بالجنيه","reason","سبب الخصم") ;actionInput="";actionInput2=""},modifier=Modifier.weight(1f)){Text("خصم")}
                                            if(onCanWriteApi("api/admin/clients/$clientId/wallet/set-balance"))
                                                OutlinedButton(onClick={pending=RowAction("تسوية رصيد العميل","POST","api/admin/clients/$clientId/wallet/set-balance",JsonObject(),"balance","الرصيد النهائي بالجنيه","reason","سبب التسوية") ;actionInput="";actionInput2=""},modifier=Modifier.weight(1f)){Text("تسوية")}
                                        }
                                    }
                                }
                            }
                        }
                        if(section==AdminSection.CLIENTS&&item.isJsonObject){
                            val client=item.asJsonObject
                            val clientId=client.get("_id")?.asString?:client.get("id")?.asString.orEmpty()
                            val registered=client.get("registered")?.asBoolean?:clientId.isNotBlank()
                            if(registered&&clientId.isNotBlank()&&(onCanWriteApi("api/password-recovery/admin/support-passwords")||onCanReadApi("api/password-recovery/admin/support-passwords"))){
                                Row(Modifier.fillMaxWidth().padding(top=6.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                                    if(onCanWriteApi("api/password-recovery/admin/support-passwords"))OutlinedButton(onClick={onIssueClientSupportPassword(clientId)},modifier=Modifier.weight(1f)){Text("إصدار كلمة دعم")}
                                    if(onCanReadApi("api/password-recovery/admin/support-passwords"))OutlinedButton(onClick={onRevealClientSupportPassword(clientId)},modifier=Modifier.weight(1f)){Text("عرض كلمة الدعم")}
                                }
                            }
                        }
                        if(section==AdminSection.WALLETS){
                            val fanniId=item.asJsonObject.get("_id")?.asString.orEmpty()
                            if(fanniId.isNotBlank())OutlinedButton(onClick={onOpenWallet(fanniId)},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("عرض حركات المحفظة")}
                        }
                        if((section==AdminSection.TECHNICIANS||section==AdminSection.PENDING||section==AdminSection.DISABLED)&&onCanWriteApi("api/admin/fannis/x/profile-controls")){
                            val fanni=item.asJsonObject
                            OutlinedButton(onClick={advancedFanni=item},modifier=Modifier.fillMaxWidth().padding(top=6.dp)){Text("إعدادات الثقة والظهور")}
                            OutlinedButton(onClick={limitFanni=item},modifier=Modifier.fillMaxWidth()){Text("حدود استقبال الطلبات والعروض")}
                        }
                        if((section==AdminSection.TECHNICIANS||section==AdminSection.PENDING||section==AdminSection.DISABLED)&&onCanWriteApi("api/admin/fannis/x/profile")){
                            val fanniId=item.asJsonObject.get("_id")?.asString.orEmpty()
                            if(fanniId.isNotBlank())OutlinedButton(onClick={onEditProfile(fanniId)},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("تعديل بيانات الفني")}
                        }
                        if(section==AdminSection.ORDERS&&onCanWriteApi("api/admin/orders/x/correct")){
                            OutlinedButton(onClick={correctionOrder=item},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("تصحيح بيانات الطلب")}
                        }
                        if(section==AdminSection.ORDERS&&item.isJsonObject&&onCanWriteApi("api/admin/orders/x/assign")){
                            val offers=item.asJsonObject.get("offers")?.takeIf{it.isJsonArray}?.asJsonArray
                            if(offers!=null&&offers.size()>0)OutlinedButton(onClick={assigningOrder=item;assigningOfferIndex=0;assigningReason="تعيين إداري بعد مراجعة العروض"},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("اختيار عرض وتعيين الفني")}
                        }
                        if(section==AdminSection.ORDERS && item.isJsonObject && item.asJsonObject.get("hasVoiceRecording")?.asBoolean==true){
                            val orderSn=item.asJsonObject.get("sn")?.asString.orEmpty()
                            OutlinedButton(onClick={onVoice(orderSn)},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("استماع للتسجيل الصوتي")}
                        }
                        if(actions.isNotEmpty()){
                            Row(Modifier.fillMaxWidth().padding(top=10.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                                actions.forEach { action ->
                                    OutlinedButton(onClick={pending=action;actionInput="";actionInput2=""},modifier=Modifier.weight(1f)) { Text(action.label, maxLines=1) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
private fun rowActions(section:AdminSection,item:JsonElement):List<RowAction>{
 if(!item.isJsonObject)return emptyList()
 val o=item.asJsonObject
 fun value(vararg keys:String):String?=keys.firstNotNullOfOrNull{k->o.get(k)?.takeIf{!it.isJsonNull}?.asString}
 val id=value("_id","id").orEmpty()
 val phone=value("phone","clientPhone")
 val sn=value("sn","target")
 return when(section){
  AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED->listOf(
   RowAction("اعتماد","POST","api/admin/fannis/$id/approve"),
   RowAction("رفض","POST","api/admin/fannis/$id/reject",JsonObject(),"reason","سبب الرفض (اختياري)"),
   RowAction("إيقاف","POST","api/admin/fannis/$id/disable",JsonObject(),"reason","سبب الإيقاف (اختياري)"),
   RowAction("تفعيل","POST","api/admin/fannis/$id/enable"),
   RowAction("حذف الفني","DELETE","api/admin/fannis/$id"),
   RowAction("تعديل المستوى","PATCH","api/admin/fannis/$id/level",JsonObject(),"level","المستوى الجديد"),
   RowAction("تعيين منصب إداري","POST","api/admin/admin-users",JsonObject().apply{addProperty("fanniId",id)},"role","المنصب الإداري"),
   RowAction("شارة موثوق","PATCH","api/admin/fannis/$id/badge",JsonObject().apply{addProperty("badge","trusted")}),
   RowAction("إزالة شارة موثوق","PATCH","api/admin/fannis/$id/badge",JsonObject().apply{addProperty("badge","trusted");addProperty("action","remove")}),
   RowAction("حفظ ملاحظة","PATCH","api/admin/fannis/$id/note",JsonObject(),"note","الملاحظة الداخلية"),
   RowAction("تغيير كلمة المرور","PATCH","api/admin/fannis/$id/password",JsonObject(),"newPassword","كلمة المرور الجديدة","confirmPassword","تأكيد كلمة المرور")
  )
  AdminSection.PROFILE_EDITS->listOf(
   RowAction("قبول التعديل","POST","api/admin/fanni-profile-edits/$id/approve"),
   RowAction("رفض التعديل","POST","api/admin/fanni-profile-edits/$id/reject",JsonObject().apply{addProperty("reason","رفض من تطبيق الإدارة")})
  )
  AdminSection.TOPUPS->listOf(
   RowAction("قبول الشحن","POST","api/admin/topup-requests/$id/approve"),
   RowAction("رفض الشحن","POST","api/admin/topup-requests/$id/reject",JsonObject(),"reason","سبب الرفض (اختياري)")
  )
  AdminSection.WALLETS->listOf(
   RowAction("تعيين الرصيد","POST","api/admin/fannis/$id/set-balance",JsonObject(),"amount","الرصيد الجديد بالجنيه","reason","سبب التسوية"),
   RowAction("إضافة رصيد","POST","api/admin/fannis/$id/add-balance",JsonObject(),"amount","المبلغ المراد إضافته","reason","سبب الإضافة"),
   RowAction("تجميد المحفظة","POST","api/admin/wallet/freeze/$id",JsonObject().apply{addProperty("action","freeze")},"reason","سبب تجميد المحفظة"),
   RowAction("فك تجميد المحفظة","POST","api/admin/wallet/freeze/$id",JsonObject().apply{addProperty("action","unfreeze")},"reason","سبب إلغاء التجميد")
  )
  AdminSection.SERVICES->{
   val name=value("name")?:return emptyList()
   val encoded=Uri.encode(name)
   val category=value("category").orEmpty()
   val categoryQuery="?category="+Uri.encode(category)
   val categoryBody=JsonObject().apply{addProperty("category",category)}
   listOf(
    RowAction("إخفاء الخدمة","POST","api/admin/services/$encoded/hide"+categoryQuery,categoryBody),
    RowAction("إظهار الخدمة","POST","api/admin/services/$encoded/show"+categoryQuery,categoryBody),
    RowAction("تعديل الاسم","PATCH","api/admin/services/$encoded"+categoryQuery,categoryBody,"name","اسم الخدمة الجديد"),
    RowAction("تغيير الأيقونة","PATCH","api/admin/services/$encoded"+categoryQuery,categoryBody,"emoji","رمز الخدمة"),
    RowAction("حذف الخدمة","DELETE","api/admin/services/$id"+categoryQuery)
   )
  }
  AdminSection.CLIENT_TOPUPS->listOf(
   RowAction("اعتماد الشحن وإضافة الرصيد","POST","api/admin/client-wallet/topup-requests/$id/approve"),
   RowAction("رفض طلب الشحن","POST","api/admin/client-wallet/topup-requests/$id/reject",JsonObject(),"reason","سبب الرفض (اختياري)")
  )
  AdminSection.CLIENTS->if(phone!=null)listOf(
   RowAction("حظر العميل","POST","api/admin/clients/${Uri.encode(phone)}/block",JsonObject(),"reason","سبب الحظر (مطلوب)"),
   RowAction("إلغاء الحظر","POST","api/admin/clients/${Uri.encode(phone)}/unblock"),
   RowAction("تغيير كلمة المرور","PATCH","api/admin/clients/${Uri.encode(phone)}/password",JsonObject(), "newPassword","كلمة المرور الجديدة","confirmPassword","تأكيد كلمة المرور"),
   RowAction("حفظ ملاحظة داخلية","POST","api/admin/clients/${Uri.encode(phone)}/note",JsonObject(), "note","الملاحظة الداخلية"),
   RowAction("حذف حساب العميل","DELETE","api/admin/clients/${Uri.encode(phone)}/account")
  )else emptyList()
  AdminSection.ORDERS->if(sn!=null){
   val actions=mutableListOf(RowAction("نشر الطلب","POST","api/orders/admin/$sn/publish"))
   if(o.get("hasVoiceRecording")?.asBoolean==true)actions.add(RowAction("تأكيد مراجعة الصوت","POST","api/orders/admin/$sn/voice-reviewed"))
   if(o.get("clientPaymentStatus")?.asString=="held")actions.add(RowAction("استرداد قيمة الخدمة للعميل","POST","api/admin/client-wallet/orders/$sn/refund",JsonObject(),"reason","سبب الاسترداد (مطلوب)"))
   actions.add(RowAction("إلغاء الطلب","POST","api/admin/orders/$sn/cancel",JsonObject(),"reason","سبب الإلغاء (مطلوب)"))
   actions.add(RowAction("أرشفة","POST","api/admin/orders/$sn/archive"))
   actions.add(RowAction("حذف","DELETE","api/admin/orders/$sn"))
   actions
  }else emptyList()
  AdminSection.SUPPORT->if(sn!=null)listOf(RowAction("وضع علامة مراجعة","POST","api/admin/support/$sn/review"))else emptyList()
  AdminSection.RECOVERY->if(id.isNotBlank())listOf(
   RowAction("إرسال رد","POST","api/password-recovery/admin/requests/$id/reply",JsonObject(),"text","اكتب الرد للمستخدم"),
   RowAction("رفض الطلب","POST","api/password-recovery/admin/requests/$id/reject",JsonObject(),"reason","سبب الرفض")
  )else emptyList()
  AdminSection.COMPLAINTS->listOf(
   RowAction("حفظ رد وملاحظة","PATCH","api/admin/complaints/$id",JsonObject().apply{addProperty("status","قيد المراجعة")},"adminNote","ملاحظة داخلية","adminResponse","رد رسمي للعميل"),
   RowAction("قيد المراجعة","PATCH","api/admin/complaints/$id",JsonObject().apply{addProperty("status","قيد المراجعة")}),
   RowAction("حل الشكوى","PATCH","api/admin/complaints/$id",JsonObject().apply{addProperty("status","تم الحل")}),
   RowAction("رفض","PATCH","api/admin/complaints/$id",JsonObject().apply{addProperty("status","مرفوضة")})
  )
  AdminSection.REGIONS->listOf(
   RowAction("تعديل الاسم","PATCH","api/admin/regions/$id",JsonObject(),"name","اسم المنطقة الجديد"),
   RowAction("تفعيل","PATCH","api/admin/regions/$id",JsonObject().apply{addProperty("isActive",true)}),
   RowAction("استعادة","PATCH","api/admin/regions/$id",JsonObject().apply{addProperty("isDeleted",false)}),
   RowAction("إيقاف","PATCH","api/admin/regions/$id",JsonObject().apply{addProperty("isActive",false)}),
   RowAction("حذف","DELETE","api/admin/regions/$id")
  )
  AdminSection.NOTIFICATIONS->listOf(RowAction("حذف الحملة","DELETE","api/admin/notifications/direct/$id"))
  AdminSection.LEVELS->listOf(RowAction("تغيير المستوى","PATCH","api/admin/fannis/$id/level",JsonObject(),"level","المستوى: مبتدئ، ممارس، محترف، خبير مبتدئ، خبير، خبير أول، استشاري فني، نخبة، أسطوري","reason","سبب التغيير (اختياري)"),RowAction("إضافة شارة","PATCH","api/admin/fannis/$id/badge",JsonObject().apply{addProperty("action","add")},"badge","الشارة: trusted / top_rated / verified / fast_response / premium / gold"),RowAction("إزالة شارة","PATCH","api/admin/fannis/$id/badge",JsonObject().apply{addProperty("action","remove")},"badge","اسم الشارة المراد إزالتها"))
  AdminSection.ROLES->if(o.get("isRootAdmin")?.asBoolean==true)emptyList() else listOf(RowAction("تغيير دور المشرف","PATCH","api/admin/admin-users/$id/role",JsonObject(),"role","الدور: مشرف / مشرف أول / مدير / قراءة فقط"),RowAction("إلغاء صلاحية المشرف","DELETE","api/admin/admin-users/$id"))
  else->emptyList()
 }
}
private fun primary(item: JsonElement, section:AdminSection): String {
    if (!item.isJsonObject) return item.toString()
    val o = item.asJsonObject
    if(section==AdminSection.ORDERS){
        val sn=o.get("sn")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        val client=o.get("clientName")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
        return listOf(sn,client).filter{it.isNotBlank()}.joinToString(" — ").ifBlank{"طلب بدون رقم"}
    }
    val keys = listOf("name", "title", "service", "sn", "clientName", "fanniName", "text", "regionName")
    return keys.firstNotNullOfOrNull { k -> o.get(k)?.takeIf { it.isJsonPrimitive && !it.asString.isNullOrBlank() }?.asString } ?: "عنصر"
}
private fun secondary(item: JsonElement, section: AdminSection): String {
    if (!item.isJsonObject) return ""
    val obj=item.asJsonObject
    if(section==AdminSection.ORDERS){
        fun value(key:String):String=obj.get(key)?.takeIf{!it.isJsonNull}?.toString()?.trim('"').orEmpty()
        return listOf(
            value("service").takeIf{it.isNotBlank()}?.let{"الخدمة: $it"},
            value("status").takeIf{it.isNotBlank()}?.let{"الحالة: $it"},
            value("clientPhone").takeIf{it.isNotBlank()}?.let{"هاتف العميل: $it"},
            value("area").takeIf{it.isNotBlank()}?.let{"المنطقة: $it"},
            value("budget").takeIf{it.isNotBlank()}?.let{"الميزانية: $it جنيه"},
            value("createdAt").takeIf{it.isNotBlank()}?.let{"التاريخ: $it"}
        ).filterNotNull().joinToString("  •  ")
    }
    if(section in listOf(AdminSection.TECHNICIANS,AdminSection.PENDING,AdminSection.DISABLED)){
        fun value(key:String):String=obj.get(key)?.takeIf{!it.isJsonNull}?.toString()?.trim('"').orEmpty()
        val parts=mutableListOf<String>()
        value("phone").takeIf{it.isNotBlank()}?.let{parts.add("الهاتف: $it")}
        value("status").takeIf{it.isNotBlank()}?.let{parts.add("الحالة: $it")}
        value("level").ifBlank{value("experience")}.takeIf{it.isNotBlank()}?.let{parts.add("المستوى: $it")}
        value("ratingAverage").takeIf{it.isNotBlank()}?.let{parts.add("التقييم: $it")}
        value("ratingCount").takeIf{it.isNotBlank()}?.let{parts.add("عدد التقييمات: $it")}
        value("completedJobs").takeIf{it.isNotBlank()}?.let{parts.add("أعمال مكتملة: $it")}
        value("balance").ifBlank{value("walletBalance")}.takeIf{it.isNotBlank()}?.let{parts.add("الرصيد: $it ج")}
        value("trustScore").takeIf{it.isNotBlank()}?.let{parts.add("الثقة: $it")}
        if(obj.get("isTrusted")?.takeIf{!it.isJsonNull}?.asBoolean==true)parts.add("شارة موثوق")
        if(obj.get("isVerified")?.takeIf{!it.isJsonNull}?.asBoolean==true)parts.add("تم التحقق من الهوية")
        if(obj.get("isFeatured")?.takeIf{!it.isJsonNull}?.asBoolean==true)parts.add("فني مميز")
        obj.get("activeSpecialties")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->!v.isJsonNull}?.asString}?.takeIf{it.isNotEmpty()}?.let{parts.add("الخدمات: "+it.joinToString("، "))}
        obj.get("areas")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->!v.isJsonNull}?.asString}?.takeIf{it.isNotEmpty()}?.let{parts.add("المناطق: "+it.joinToString("، "))}
        value("adminNote").takeIf{it.isNotBlank()}?.let{parts.add("ملاحظة الإدارة: $it")}
        return parts.joinToString("  •  ")
    }
    if(section==AdminSection.CLIENTS){
        fun value(key:String):String=obj.get(key)?.takeIf{!it.isJsonNull}?.toString()?.trim('"').orEmpty()
        val parts=mutableListOf<String>()
        value("phone").takeIf{it.isNotBlank()}?.let{parts.add("الهاتف: $it")}
        value("status").takeIf{it.isNotBlank()}?.let{parts.add("الحالة: "+if(it=="معلق")"موقوف" else it)}
        value("orderCount").takeIf{it.isNotBlank()}?.let{parts.add("الطلبات: $it")}
        value("ratingAverage").takeIf{it.isNotBlank()}?.let{parts.add("التقييم: $it")}
        value("ratingCount").takeIf{it.isNotBlank()}?.let{parts.add("عدد التقييمات: $it")}
        value("completedJobs").takeIf{it.isNotBlank()}?.let{parts.add("أعمال مكتملة: $it")}
        value("walletFrozen").takeIf{it=="true"}?.let{parts.add("المحفظة مجمدة")}
        return parts.joinToString("  •  ")
    }
    if(section==AdminSection.CLIENT_TOPUPS){
        fun value(key:String):String=obj.get(key)?.takeIf{!it.isJsonNull}?.toString()?.trim('"').orEmpty()
        return listOf(
            value("clientPhone").takeIf{it.isNotBlank()}?.let{"الهاتف: $it"},
            value("amount").takeIf{it.isNotBlank()}?.let{"المبلغ: $it جنيه"},
            value("method").takeIf{it.isNotBlank()}?.let{"الطريقة: $it"},
            value("senderNumber").takeIf{it.isNotBlank()}?.let{"رقم التحويل: $it"},
            value("referenceNumber").takeIf{it.isNotBlank()}?.let{"المرجع: $it"},
            value("reviewReason").takeIf{it.isNotBlank()}?.let{"سبب المراجعة: $it"}
        ).filterNotNull().joinToString("  •  ")
    }
    val labels=mapOf("status" to "الحالة","phone" to "الهاتف","clientPhone" to "هاتف العميل","area" to "المنطقة","region" to "المنطقة","createdAt" to "تاريخ الإضافة","specialties" to "الخدمات","message" to "الرسالة","adminNote" to "ملاحظة الإدارة","orderCount" to "عدد الطلبات","lastOrder" to "آخر طلب","category" to "القسم","price" to "السعر","amount" to "المبلغ","description" to "الوصف","type" to "النوع","discount" to "الخصم","durationDays" to "المدة بالأيام","active" to "التفعيل","isActive" to "التفعيل","sortOrder" to "الترتيب","commission" to "العمولة","city" to "المدينة")
    return listOf("status","phone","clientPhone","area","region","city","createdAt","specialties","category","price","amount","description","type","discount","durationDays","active","isActive","sortOrder","commission","message","adminNote","orderCount","lastOrder")
        .mapNotNull{k->item.asJsonObject.get(k)?.takeIf{!it.isJsonNull}?.let{(labels[k]?:k)+": "+it.toString().trim('"')}}.take(7).joinToString("  •  ")
}


@Composable private fun CommercePlansScreen(
    items:List<JsonElement>,
    busy:Boolean,
    uploadedImageUrl:String?,
    uploadedImageFileId:String?,
    onUploadImage:(android.net.Uri,String)->Unit,
    onClearUpload:()->Unit,
    canWrite:(String)->Boolean,
    onAction:(String,String,JsonObject)->Unit
){
    var editing by remember{mutableStateOf<JsonElement?>(null)}
    var createOpen by remember{mutableStateOf(false)}
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text("باقات الاشتراك",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
        Text("إدارة كتالوج الباقات والأسعار والمدد وحالة الإتاحة",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        if(canWrite("api/admin/commerce/catalog"))Button(onClick={editing=null;createOpen=true},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("إضافة باقة جديدة")}
        if(items.isEmpty())Text(if(busy)"جاري تحميل الباقات..." else "لا توجد باقات اشتراك",color=Color.Gray)
        items.forEach{item->
            val o=item.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
            val id=o.get("_id")?.asString?:o.get("id")?.asString.orEmpty()
            val name=o.get("name")?.asString.orEmpty()
            val price=o.get("price")?.toString().orEmpty()
            val days=o.get("durationDays")?.toString().orEmpty()
            val description=o.get("description")?.asString.orEmpty()
            val features=o.get("features")?.takeIf{it.isJsonArray}?.asJsonArray?.mapNotNull{it.takeIf{v->v.isJsonPrimitive}?.asString}.orEmpty()
            val active=o.get("active")?.asBoolean!=false
            Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                    Text(name.ifBlank{"باقة بدون اسم"},fontWeight=FontWeight.Bold,color=DarkAccent)
                    Text("$price جنيه • $days يوم • "+if(active)"متاحة" else "متوقفة",color=if(active)Color(0xFF16834B) else Color(0xFFB3261E))
                    if(description.isNotBlank())Text(description,color=Color.DarkGray,style=MaterialTheme.typography.bodySmall)
                    if(features.isNotEmpty())Text("المميزات: "+features.joinToString(" • "),style=MaterialTheme.typography.bodySmall,color=Color.DarkGray)
                    Text("معرّف الباقة: $id",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        if(canWrite("api/admin/commerce/catalog/$id"))OutlinedButton(onClick={editing=item},enabled=!busy,modifier=Modifier.weight(1f)){Text("تعديل")}
                        if(canWrite("api/admin/commerce/catalog/$id"))OutlinedButton(onClick={onAction("PATCH","api/admin/commerce/catalog/$id",JsonObject().apply{addProperty("active",!active)})},enabled=!busy,modifier=Modifier.weight(1f)){Text(if(active)"إيقاف" else "تفعيل")}
                    }
                }
            }
        }
    }
    if(createOpen||editing!=null){
        val current=editing
        var name by remember(current){mutableStateOf(current?.asJsonObject?.get("name")?.asString.orEmpty())}
        var price by remember(current){mutableStateOf(current?.asJsonObject?.get("price")?.toString().orEmpty())}
        var days by remember(current){mutableStateOf(current?.asJsonObject?.get("durationDays")?.toString()?: "30")}
        var description by remember(current){mutableStateOf(current?.asJsonObject?.get("description")?.asString.orEmpty())}
        var features by remember(current){mutableStateOf(current?.asJsonObject?.get("features")?.takeIf{it.isJsonArray}?.asJsonArray?.joinToString(", "){it.asString}.orEmpty())}
        var active by remember(current){mutableStateOf(current?.asJsonObject?.get("active")?.asBoolean!=false)}
        AlertDialog(
            onDismissRequest={createOpen=false;editing=null},
            title={Text(if(current==null)"إضافة باقة اشتراك" else "تعديل باقة الاشتراك")},
            text={Column(Modifier.heightIn(max=520.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(7.dp)){
                OutlinedTextField(name,{name=it},label={Text("اسم الباقة")},singleLine=true)
                OutlinedTextField(price,{price=it},label={Text("السعر بالجنيه")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),singleLine=true)
                OutlinedTextField(days,{days=it},label={Text("مدة الاشتراك بالأيام")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),singleLine=true)
                OutlinedTextField(description,{description=it},label={Text("وصف الباقة")},minLines=2)
                OutlinedTextField(features,{features=it},label={Text("المميزات — افصل بينها بفاصلة")},minLines=2)
                Row(verticalAlignment=Alignment.CenterVertically){Text("الباقة متاحة",modifier=Modifier.weight(1f));Switch(active,{active=it})}
            }},
            confirmButton={TextButton(enabled=!busy&&name.trim().length>=2&&price.toDoubleOrNull()?.let{it>=0}==true&&days.toIntOrNull()?.let{it in 1..3650}==true,onClick={
                val body=JsonObject().apply{
                    addProperty("name",name.trim());addProperty("price",price.toDouble());addProperty("durationDays",days.toInt())
                    addProperty("description",description.trim());addProperty("active",active)
                    add("features",com.google.gson.JsonArray().apply{features.split(',', '،').map{it.trim()}.filter{it.isNotEmpty()}.take(30).forEach{add(it)}})
                }
                val id=current?.asJsonObject?.get("_id")?.asString?:current?.asJsonObject?.get("id")?.asString
                onAction(if(id==null)"POST" else "PATCH",if(id==null)"api/admin/commerce/catalog" else "api/admin/commerce/catalog/$id",body)
                createOpen=false;editing=null
            }){Text("حفظ")}},
            dismissButton={TextButton(onClick={createOpen=false;editing=null}){Text("إلغاء")}}
        )
    }
}

@Composable private fun ClientSubscriptionsScreen(
    items:List<JsonElement>,
    busy:Boolean,
    canWrite:(String)->Boolean,
    onAction:(String,String,JsonObject)->Unit
){
    var createOpen by remember{mutableStateOf(false)}
    var editingDetails by remember{mutableStateOf<JsonElement?>(null)}
    var renewalTarget by remember{mutableStateOf<JsonElement?>(null)}
    var statusFilter by remember{mutableStateOf("active")}
    var subscriptionSearch by remember{mutableStateOf("")}
    fun subscriptionGroup(item:JsonElement):String{
        val o=item.takeIf{it.isJsonObject}?.asJsonObject?:return "expired"
        val status=o.get("status")?.takeIf{!it.isJsonNull}?.asString.orEmpty().lowercase()
        if(status=="pending")return "pending"
        if(status=="active"){
            val end=o.get("endsAt")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
            if(end.isBlank())return "active"
            val endTime=runCatching{SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.US).parse(end)?.time}.getOrNull()
                ?:runCatching{SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX",Locale.US).parse(end)?.time}.getOrNull()
            return if(endTime!=null&&endTime>System.currentTimeMillis())"active" else "expired"
        }
        return "expired"
    }
    val filteredItems=items.filter{item->
        val o=item.takeIf{it.isJsonObject}?.asJsonObject
        val client=o?.get("client")?.takeIf{it.isJsonObject}?.asJsonObject
        val searchText=listOf(client?.get("name")?.asString.orEmpty(),client?.get("phone")?.asString.orEmpty(),o?.get("itemName")?.asString.orEmpty(),o?.get("_id")?.asString.orEmpty()).joinToString(" ").lowercase()
        subscriptionGroup(item)==statusFilter&&(subscriptionSearch.isBlank()||searchText.contains(subscriptionSearch.trim().lowercase()))
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text("اشتراكات العملاء",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
        Text("متابعة الاشتراكات النشطة والمعلقة والمنتهية وتجديدها",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        OutlinedTextField(subscriptionSearch,{subscriptionSearch=it},label={Text("بحث باسم العميل أو الهاتف أو الباقة")},singleLine=true,modifier=Modifier.fillMaxWidth())
        if(canWrite("api/admin/commerce/subscriptions"))Button(onClick={createOpen=true},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("إضافة اشتراك لعميل")}
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
            listOf("active" to "الاشتراكات السارية","expired" to "الاشتراكات المنتهية","pending" to "طلبات الاشتراك الجديدة").forEach{(key,label)->
                FilterChip(selected=statusFilter==key,onClick={statusFilter=key},label={Text(label+" "+items.count{subscriptionGroup(it)==key})})
            }
        }
        if(items.isEmpty())Text(if(busy)"جاري تحميل الاشتراكات..." else "لا توجد اشتراكات",color=Color.Gray)
        if(items.isNotEmpty()&&filteredItems.isEmpty())Text("لا توجد سجلات في هذا التبويب أو تطابق البحث",color=Color.Gray)
        filteredItems.forEach{item->
            val o=item.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
            val id=o.get("_id")?.asString?:o.get("id")?.asString.orEmpty()
            val client=o.get("client")?.takeIf{it.isJsonObject}?.asJsonObject
            val clientName=client?.get("name")?.asString.orEmpty()
            val clientPhone=client?.get("phone")?.asString.orEmpty()
            val itemName=o.get("itemName")?.asString.orEmpty()
            val status=o.get("status")?.asString.orEmpty()
            val payment=o.get("paymentStatus")?.asString.orEmpty()
            val amount=o.get("amount")?.toString().orEmpty()
            val end=o.get("endsAt")?.takeIf{!it.isJsonNull}?.asString.orEmpty().take(10)
            val details=o.get("subscriptionDetails")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
            Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                Column(Modifier.padding(13.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                    Text(clientName.ifBlank{"عميل"}+" • "+itemName,fontWeight=FontWeight.Bold,color=DarkAccent)
                    Text(clientPhone,color=Color.Gray,style=MaterialTheme.typography.bodySmall)
                    Text("الحالة: $status • الدفع: $payment • القيمة: $amount جنيه",style=MaterialTheme.typography.bodySmall)
                    Text("ينتهي: "+end.ifBlank{"—"},style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                    if(details.isNotBlank())Text("تفاصيل الاشتراك: $details",style=MaterialTheme.typography.bodySmall)
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                        if(canWrite("api/admin/commerce/subscriptions/$id/details"))OutlinedButton(onClick={editingDetails=item},enabled=!busy,modifier=Modifier.weight(1f)){Text("التفاصيل")}
                        if(canWrite("api/admin/commerce/subscriptions/$id/renew"))OutlinedButton(onClick={renewalTarget=item},enabled=!busy,modifier=Modifier.weight(1f)){Text("تجديد")}
                    }
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                        if(canWrite("api/admin/commerce/subscriptions/$id/status"))OutlinedButton(onClick={onAction("PATCH","api/admin/commerce/subscriptions/$id/status",JsonObject().apply{addProperty("status",if(status=="active")"paused" else "active");addProperty("reason","تحديث من تطبيق الإدارة")})},enabled=!busy,modifier=Modifier.weight(1f)){Text(if(status=="active")"إيقاف مؤقت" else "تفعيل")}
                        if(canWrite("api/admin/commerce/subscriptions/$id/status"))OutlinedButton(onClick={onAction("PATCH","api/admin/commerce/subscriptions/$id/status",JsonObject().apply{addProperty("status","cancelled");addProperty("reason","إلغاء من تطبيق الإدارة")})},enabled=!busy,modifier=Modifier.weight(1f)){Text("إلغاء الاشتراك")}
                    }
                }
            }
        }
    }
    if(createOpen){
        var phone by remember{mutableStateOf("")}
        var itemId by remember{mutableStateOf("")}
        var activate by remember{mutableStateOf(true)}
        AlertDialog(
            onDismissRequest={createOpen=false},
            title={Text("إضافة اشتراك عميل")},
            text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
                OutlinedTextField(phone,{phone=it},label={Text("رقم هاتف العميل المسجل")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Phone),singleLine=true)
                OutlinedTextField(itemId,{itemId=it},label={Text("معرّف الباقة")},singleLine=true)
                Text("يمكنك نسخ معرّف الباقة من قسم باقات الاشتراك.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                Row(verticalAlignment=Alignment.CenterVertically){Text("تفعيل فوري وخصم السعر من المحفظة",modifier=Modifier.weight(1f),style=MaterialTheme.typography.bodySmall);Switch(activate,{activate=it})}
                if(!activate)Text("سيُنشأ طلب اشتراك بانتظار التفعيل دون خصم من المحفظة.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
            }},
            confirmButton={TextButton(enabled=!busy&&phone.trim().isNotBlank()&&itemId.trim().isNotBlank(),onClick={
                val body=JsonObject().apply{addProperty("clientPhone",phone.trim());addProperty("itemId",itemId.trim());addProperty("status",if(activate)"active" else "pending");addProperty("paymentStatus",if(activate)"paid" else "pending")}
                onAction("POST","api/admin/commerce/subscriptions",body);createOpen=false
            }){Text("إنشاء الاشتراك")}},
            dismissButton={TextButton(onClick={createOpen=false}){Text("إلغاء")}}
        )
    }
    editingDetails?.let{item->
        val id=item.asJsonObject.get("_id")?.asString?:item.asJsonObject.get("id")?.asString.orEmpty()
        var details by remember(item){mutableStateOf(item.asJsonObject.get("subscriptionDetails")?.asString.orEmpty())}
        AlertDialog(
            onDismissRequest={editingDetails=null},
            title={Text("تفاصيل الاشتراك")},
            text={OutlinedTextField(details,{details=it},label={Text("بيانات الاشتراك أو السيريال")},minLines=4)},
            confirmButton={TextButton(enabled=!busy,onClick={onAction("PATCH","api/admin/commerce/subscriptions/$id/details",JsonObject().apply{addProperty("details",details.trim())});editingDetails=null}){Text("حفظ")}},
            dismissButton={TextButton(onClick={editingDetails=null}){Text("إلغاء")}}
        )
    }
    renewalTarget?.let{item->
        val o=item.asJsonObject
        val id=o.get("_id")?.asString?:o.get("id")?.asString.orEmpty()
        AlertDialog(
            onDismissRequest={renewalTarget=null},
            title={Text("تأكيد تجديد الاشتراك")},
            text={Text("هل تريد تجديد اشتراك "+(o.get("itemName")?.asString?: "العميل")+" للعميل "+(o.get("client")?.asJsonObject?.get("name")?.asString?: "—")+"؟")},
            confirmButton={TextButton(enabled=!busy,onClick={onAction("POST","api/admin/commerce/subscriptions/$id/renew",JsonObject());renewalTarget=null}){Text("تأكيد التجديد")}},
            dismissButton={TextButton(onClick={renewalTarget=null}){Text("إلغاء")}}
        )
    }
}

@Composable private fun StoreProductsScreen(
    payload:JsonElement?,
    products:List<JsonElement>,
    busy:Boolean,
    uploadedImageUrl:String?,
    uploadedImageFileId:String?,
    onUploadImage:(android.net.Uri,String)->Unit,
    onClearUpload:()->Unit,
    canWrite:(String)->Boolean,
    onAction:(String,String,JsonObject)->Unit
){
    var editing by remember{mutableStateOf<JsonElement?>(null)}
    var categoryEditing by remember{mutableStateOf<JsonElement?>(null)}
    var categoryCreate by remember{mutableStateOf(false)}
    var categoryManagerOpen by remember{mutableStateOf(false)}
    var pendingDelete by remember{mutableStateOf<Pair<String,String>?>(null)}
    val root=payload?.takeIf{it.isJsonObject}?.asJsonObject
    val categories=root?.get("categories")?.takeIf{it.isJsonArray}?.asJsonArray?.toList().orEmpty()
    val adSettings=root?.get("storeAdSettings")?.takeIf{it.isJsonObject}?.asJsonObject
    var rotation by remember(adSettings){mutableStateOf(adSettings?.get("rotationSeconds")?.asInt?.toString().orEmpty())}
    var rotationMenuExpanded by remember{mutableStateOf(false)}
    var csvPreview by remember{mutableStateOf<StoreCsvPreview?>(null)}
    var csvFileName by remember{mutableStateOf("")}
    var csvError by remember{mutableStateOf("")}
    var confirmCsvImport by remember{mutableStateOf(false)}
    var csvSource by remember{mutableStateOf("")}
    var csvMapping by remember{mutableStateOf<Map<String,Int>>(emptyMap())}
    var openCsvMapping by remember{mutableStateOf<String?>(null)}
    val csvMappingFields=listOf(
        "name" to "اسم المنتج *","price" to "السعر *","category" to "القسم",
        "description" to "الوصف","details" to "التفاصيل والمواصفات","originalPrice" to "السعر قبل العرض",
        "offerText" to "تفاصيل العرض","type" to "نوع المنتج","subscriptionDuration" to "مدة الاشتراك",
        "stock" to "الكمية / المخزون","imageUrl" to "رابط الصورة","isActive" to "حالة المنتج"
    )
    val context=LocalContext.current
    val csvPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->
        if(uri!=null){
            runCatching{
                val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("تعذر قراءة ملف CSV")
                if(bytes.size>900*1024)error("حجم ملف CSV يجب ألا يتجاوز 900 كيلوبايت")
                val decoded=runCatching{
                    java.nio.charset.StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString()
                }.getOrElse{String(bytes,java.nio.charset.Charset.forName("windows-1256"))}
                decoded to parseStoreCsvProducts(decoded)
            }.onSuccess{(decoded,preview)->csvSource=decoded;csvPreview=preview;csvMapping=preview.mapping;csvFileName=uri.lastPathSegment.orEmpty();csvError=""}
             .onFailure{csvPreview=null;csvSource="";csvMapping=emptyMap();csvError=it.message?: "تعذرت قراءة ملف CSV"}
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text("إدارة متجر حمزاوي سات",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
        Text("المنتجات والأقسام والإعلانات والمخزون",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        if(canWrite("api/admin/store/products"))Button(onClick={editing=null;categoryCreate=false;categoryEditing=null;editing=JsonObject()},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("إضافة منتج جديد")}
        if(canWrite("api/admin/store/products/import"))OutlinedButton(onClick={csvPicker.launch(arrayOf("text/csv","text/plain","application/vnd.ms-excel"))},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("استيراد منتجات من CSV")}
        if(csvError.isNotBlank())Text(csvError,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
        csvPreview?.let{preview->
            Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                    Text("معاينة ملف: "+csvFileName,fontWeight=FontWeight.Bold,color=DarkAccent)
                    Text("جاهز للاستيراد: "+preview.products.size+" • صفوف بها أخطاء: "+preview.errors.size,style=MaterialTheme.typography.bodySmall)
                    Text("اربط كل عمود من ملفك بالحقل الصحيح. الربط التلقائي قابل للتعديل قبل الاستيراد.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                    csvMappingFields.forEach{(key,label)->
                        val selectedIndex=csvMapping[key]?:-1
                        val selectedLabel=if(selectedIndex in preview.headers.indices)preview.headers[selectedIndex] else "بدون ربط"
                        Box(Modifier.fillMaxWidth()){
                            OutlinedButton(onClick={openCsvMapping=key},modifier=Modifier.fillMaxWidth()){
                                Text(label+" : "+selectedLabel,maxLines=1,overflow=TextOverflow.Ellipsis)
                            }
                            DropdownMenu(expanded=openCsvMapping==key,onDismissRequest={openCsvMapping=null},modifier=Modifier.heightIn(max=280.dp)){
                                DropdownMenuItem(text={Text("بدون ربط")},onClick={
                                    val next=csvMapping.toMutableMap().apply{put(key,-1)}
                                    csvMapping=next;csvPreview=parseStoreCsvProducts(csvSource,next);openCsvMapping=null
                                })
                                preview.headers.forEachIndexed{index,header->
                                    DropdownMenuItem(text={Text(header.ifBlank{"عمود "+(index+1)},maxLines=1,overflow=TextOverflow.Ellipsis)},onClick={
                                        val next=csvMapping.toMutableMap().apply{put(key,index)}
                                        csvMapping=next;csvPreview=parseStoreCsvProducts(csvSource,next);openCsvMapping=null
                                    })
                                }
                            }
                        }
                    }
                    Text("معاينة أول 8 صفوف من الملف",fontWeight=FontWeight.Bold,color=DarkAccent)
                    fun previewCell(row:List<String>,key:String):String{
                        val column=preview.mapping[key]?:-1
                        return if(column in row.indices)row[column].trim() else ""
                    }
                    preview.rows.take(8).forEachIndexed{index,row->
                        val rowNumber=index+2
                        val imported=preview.products.firstOrNull{it.get("rowNumber")?.asInt==rowNumber}?.get("product")?.takeIf{it.isJsonObject}?.asJsonObject
                        val issue=preview.errors.firstOrNull{it.startsWith("الصف "+rowNumber+":")}
                        Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color(0xFFF8FAFC))){
                            Column(Modifier.padding(9.dp),verticalArrangement=Arrangement.spacedBy(3.dp)){
                                Text("الصف "+rowNumber+" • "+(imported?.get("name")?.asString?:previewCell(row,"name").ifBlank{"بدون اسم"}),fontWeight=FontWeight.SemiBold)
                                Text("السعر: "+(imported?.get("price")?.toString()?:previewCell(row,"price").ifBlank{"—"})+" • القسم: "+(imported?.get("category")?.asString?:previewCell(row,"category").ifBlank{"عام"}),style=MaterialTheme.typography.bodySmall)
                                Text(issue?:if(imported!=null)"جاهز للاستيراد" else "راجع ربط الأعمدة",style=MaterialTheme.typography.labelSmall,color=if(issue!=null)Color(0xFFB3261E) else Color(0xFF16834B))
                            }
                        }
                    }
                    Text("المعاينة تعرض أول 8 صفوف فقط. سيتم فحص جميع الصفوف قبل الاستيراد.",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                    Button(onClick={confirmCsvImport=true},enabled=!busy&&preview.products.isNotEmpty(),modifier=Modifier.fillMaxWidth()){Text("استيراد "+preview.products.size+" منتج")}
                    TextButton(onClick={csvPreview=null;csvFileName="";csvSource="";csvMapping=emptyMap()}){Text("إلغاء المعاينة")}
                }
            }
        }
        if(confirmCsvImport)AlertDialog(
            onDismissRequest={confirmCsvImport=false},
            title={Text("تأكيد استيراد المنتجات")},
            text={Text("سيتم إضافة "+(csvPreview?.products?.size?:0)+" منتج إلى المتجر. المنتجات الموجودة أو المكررة بنفس الاسم والقسم سيتم تخطيها دون تعديلها. هل تريد المتابعة؟")},
            confirmButton={TextButton(enabled=!busy,onClick={
                val preview=csvPreview
                if(preview!=null){
                    val body=JsonObject().apply{add("products",com.google.gson.JsonArray().apply{preview.products.forEach{add(it)}})}
                    onAction("POST","api/admin/store/products/import",body)
                }
                confirmCsvImport=false;csvPreview=null;csvFileName="";csvSource="";csvMapping=emptyMap()
            }){Text("تأكيد الاستيراد")}},
            dismissButton={TextButton(onClick={confirmCsvImport=false}){Text("إلغاء")}}
        )
        Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
            Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                Text("مدة عرض الإعلان",fontWeight=FontWeight.Bold,color=DarkAccent)
                Text("المدة المحفوظة من الخادم: "+(adSettings?.get("rotationSeconds")?.toString()?: "غير متاحة"),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                Box(Modifier.fillMaxWidth()){
                    OutlinedButton(onClick={rotationMenuExpanded=true},modifier=Modifier.fillMaxWidth(),enabled=!busy){Text("مدة عرض الصورة: "+rotation.ifBlank{"غير متاحة"}+" ثانية")}
                    DropdownMenu(expanded=rotationMenuExpanded,onDismissRequest={rotationMenuExpanded=false}){
                        listOf(5,10,15,20,30,45,60).forEach{seconds->DropdownMenuItem(text={Text(seconds.toString()+" ثانية")},onClick={rotation=seconds.toString();rotationMenuExpanded=false})}
                    }
                }
                Button(onClick={onAction("PUT","api/admin/store/ad-settings",JsonObject().apply{addProperty("rotationSeconds",rotation.toIntOrNull()?:0)})},enabled=!busy&&canWrite("api/admin/store/ad-settings")&&rotation.toIntOrNull() in listOf(5,10,15,20,30,45,60),modifier=Modifier.fillMaxWidth()){Text("حفظ مدة الإعلان")}
            }
        }
        Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
            Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                Row(verticalAlignment=Alignment.CenterVertically){
                    Text("أقسام المتجر",modifier=Modifier.weight(1f),fontWeight=FontWeight.Bold,color=DarkAccent)
                    TextButton(onClick={categoryManagerOpen=!categoryManagerOpen}){Text(if(categoryManagerOpen)"إخفاء الأقسام" else "عرض الأقسام ("+categories.size+")")}
                    if(canWrite("api/admin/store/categories"))TextButton(onClick={categoryManagerOpen=true;categoryEditing=null;categoryCreate=true},enabled=!busy){Text("إضافة قسم")}
                }
                if(categoryManagerOpen){
                    if(categories.isEmpty())Text("لا توجد أقسام معرفة بعد.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                    categories.forEach{cat->
                    val obj=cat.takeIf{it.isJsonObject}?.asJsonObject
                    val name=obj?.get("name")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
                    val count=obj?.get("productCount")?.takeIf{!it.isJsonNull}?.toString().orEmpty()
                    val categoryImage=obj?.get("imageUrl")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
                    Row(verticalAlignment=Alignment.CenterVertically){
                        if(categoryImage.isNotBlank())AsyncImage(model=storeImageSource(categoryImage),contentDescription="صورة قسم "+name,modifier=Modifier.size(58.dp),contentScale=ContentScale.Crop)
                        Column(Modifier.weight(1f)){
                            Text(name,fontWeight=FontWeight.SemiBold)
                            Text(count+" منتج",style=MaterialTheme.typography.labelSmall,color=Color.Gray)
                        }
                        if(canWrite("api/admin/store/categories/"+name))TextButton(onClick={categoryEditing=cat;categoryCreate=false}){Text("تعديل")}
                        if(name!="عام"&&canWrite("api/admin/store/categories/"+name))TextButton(onClick={pendingDelete=Pair("api/admin/store/categories/"+android.net.Uri.encode(name),"سيتم نقل منتجات هذا القسم إلى قسم عام، ولن تُحذف المنتجات نفسها. هل تريد حذف القسم؟")}){Text("حذف",color=Color(0xFFB3261E))}
                    }
                    }
                }
            }
        }
        Text("المنتجات ("+products.size+")",fontWeight=FontWeight.Bold,color=DarkAccent)
        if(products.isEmpty())Text(if(busy)"جاري تحميل المنتجات..." else "لا توجد منتجات في المتجر",color=Color.Gray)
        products.forEach{item->
            val o=item.takeIf{it.isJsonObject}?.asJsonObject?:return@forEach
            val id=o.get("_id")?.asString?:o.get("id")?.asString.orEmpty()
            val name=o.get("name")?.asString.orEmpty()
            val category=o.get("category")?.asString.orEmpty()
            val price=o.get("price")?.toString().orEmpty()
            val productImage=o.get("imageUrl")?.takeIf{!it.isJsonNull}?.asString.orEmpty()
            val active=o.get("isActive")?.asBoolean!=false
            val advertised=o.get("isAdvertised")?.asBoolean==true
            Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                    if(productImage.isNotBlank())AsyncImage(model=storeImageSource(productImage),contentDescription="صورة "+name,modifier=Modifier.fillMaxWidth().heightIn(max=180.dp),contentScale=ContentScale.Fit)
                    Text(name,fontWeight=FontWeight.Bold,color=DarkAccent)
                    Text(category+" • "+price+" جنيه • "+if(active)"ظاهر" else "مخفي",style=MaterialTheme.typography.bodySmall,color=if(active)Color(0xFF16834B) else Color(0xFFB3261E))
                    Text(if(o.get("type")?.asString=="subscription")"اشتراك / تجديد"+(o.get("subscriptionDuration")?.takeIf{!it.isJsonNull}?.asString?.let{" • "+it}.orEmpty()) else "منتج",style=MaterialTheme.typography.labelSmall,color=Color(0xFF0B7285))
                    o.get("description")?.takeIf{!it.isJsonNull}?.asString?.takeIf{it.isNotBlank()}?.let{Text(it,style=MaterialTheme.typography.bodySmall,color=Color.DarkGray)}
                    o.get("offerText")?.takeIf{!it.isJsonNull}?.asString?.takeIf{it.isNotBlank()}?.let{Text("العرض: "+it,style=MaterialTheme.typography.bodySmall,color=Color(0xFF9A6700))}
                    o.get("originalPrice")?.takeIf{!it.isJsonNull}?.toString()?.let{oldPrice->if(oldPrice.toDoubleOrNull()!=null&&(oldPrice.toDouble()>price.toDoubleOrNull()?:0.0))Text("السعر قبل العرض: "+oldPrice+" جنيه",style=MaterialTheme.typography.labelSmall,color=Color.Gray)}
                    Text(if(advertised)"منشور كإعلان" else "غير منشور كإعلان",style=MaterialTheme.typography.labelSmall,color=if(advertised)Color(0xFF9A6700) else Color.Gray)
                    Text("المخزون: "+(o.get("stock")?.takeIf{!it.isJsonNull}?.toString()?: "غير محدد"),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                    o.get("imageUrl")?.takeIf{!it.isJsonNull}?.asString?.takeIf{it.isNotBlank()}?.let{Text("الصورة: "+it,style=MaterialTheme.typography.labelSmall,color=Color.Gray,maxLines=1,overflow=TextOverflow.Ellipsis)}
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                        if(canWrite("api/admin/store/products/"+id))OutlinedButton(onClick={editing=item},enabled=!busy,modifier=Modifier.weight(1f)){Text("تعديل")}
                        if(canWrite("api/admin/store/products/"+id))OutlinedButton(onClick={onAction("PUT","api/admin/store/products/"+id,storeProductCopy(o).apply{addProperty("isActive",!active)})},enabled=!busy,modifier=Modifier.weight(1f)){Text(if(active)"إخفاء" else "إظهار")}
                        if(canWrite("api/admin/store/products/"+id))OutlinedButton(onClick={pendingDelete=Pair("api/admin/store/products/"+id,"سيتم حذف المنتج من المتجر نهائيًا. هل تريد المتابعة؟")},enabled=!busy,modifier=Modifier.weight(1f)){Text("حذف")}
                    }
                }
            }
        }
    }
    if(editing!=null)StoreProductEditor(editing?.takeIf{it.isJsonObject&&it.asJsonObject.size()>0},categories,busy,uploadedImageUrl,uploadedImageFileId,{uri->onUploadImage(uri,"product")},onClearUpload,{editing=null}){method,path,body->onAction(method,path,body);editing=null}
    if(categoryCreate||categoryEditing!=null)StoreCategoryEditor(categoryEditing,categoryCreate,busy,uploadedImageUrl,uploadedImageFileId,{uri->onUploadImage(uri,"category")},onClearUpload,{categoryCreate=false;categoryEditing=null}){method,path,body->onAction(method,path,body);categoryCreate=false;categoryEditing=null}
    pendingDelete?.let{(path,message)->
        AlertDialog(
            onDismissRequest={pendingDelete=null},
            title={Text("تأكيد الحذف")},
            text={Text(message)},
            confirmButton={TextButton(enabled=!busy,onClick={onAction("DELETE",path,JsonObject());pendingDelete=null}){Text("تأكيد الحذف")}},
            dismissButton={TextButton(onClick={pendingDelete=null}){Text("إلغاء")}}
        )
    }
}

private fun storeProductCopy(source:com.google.gson.JsonObject):com.google.gson.JsonObject{
    val result=com.google.gson.JsonObject()
    listOf("name","category","description","details","price","originalPrice","offerText","type","subscriptionDuration","imageUrl","imageFileId","isActive","isAdvertised","adAudience","adPriority","adExpiresAt","stock").forEach{key->
        source.get(key)?.let{result.add(key,it.deepCopy())}
    }
    return result
}

@Composable private fun StoreProductEditor(
    initial:JsonElement?,
    categories:List<JsonElement>,
    busy:Boolean,
    uploadedImageUrl:String?,
    uploadedImageFileId:String?,
    onUploadImage:(android.net.Uri)->Unit,
    onClearUpload:()->Unit,
    onDismiss:()->Unit,
    onSave:(String,String,JsonObject)->Unit
){
    val imagePicker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)onUploadImage(uri)}
    val source=initial?.asJsonObject
    var name by remember(initial){mutableStateOf(source?.get("name")?.asString.orEmpty())}
    var category by remember(initial){mutableStateOf(source?.get("category")?.asString?: "عام")}
    var newCategory by remember(initial){mutableStateOf("")}
    var categoryMenuExpanded by remember{mutableStateOf(false)}
    val categoryOptions=(listOf("عام")+categories.mapNotNull{it.takeIf{v->v.isJsonObject}?.asJsonObject?.get("name")?.takeIf{!it.isJsonNull}?.asString}).distinct()
    var price by remember(initial){mutableStateOf(source?.get("price")?.toString().orEmpty())}
    var originalPrice by remember(initial){mutableStateOf(source?.get("originalPrice")?.takeIf{!it.isJsonNull}?.toString().orEmpty())}
    var offer by remember(initial){mutableStateOf(source?.get("offerText")?.asString.orEmpty())}
    var type by remember(initial){mutableStateOf(source?.get("type")?.asString?: "product")}
    var duration by remember(initial){mutableStateOf(source?.get("subscriptionDuration")?.asString.orEmpty())}
    var description by remember(initial){mutableStateOf(source?.get("description")?.asString.orEmpty())}
    var details by remember(initial){mutableStateOf(source?.get("details")?.asString.orEmpty())}
    var imageUrl by remember(initial){mutableStateOf(source?.get("imageUrl")?.asString.orEmpty())}
    var imageFileId by remember(initial){mutableStateOf(source?.get("imageFileId")?.takeIf{!it.isJsonNull}?.asString.orEmpty())}
    var stock by remember(initial){mutableStateOf(source?.get("stock")?.takeIf{!it.isJsonNull}?.toString().orEmpty())}
    var active by remember(initial){mutableStateOf(source?.get("isActive")?.asBoolean!=false)}
    var advertised by remember(initial){mutableStateOf(source?.get("isAdvertised")?.asBoolean==true)}
    var audience by remember(initial){mutableStateOf(source?.get("adAudience")?.asString?: "both")}
    var priority by remember(initial){mutableStateOf(source?.get("adPriority")?.toString()?: "0")}
    var adDays by remember(initial){mutableStateOf(source?.get("adExpiresAt")?.takeIf{!it.isJsonNull}?.asString?.let{raw->val remaining=(parseAdminDate(raw)?.time?:System.currentTimeMillis())-System.currentTimeMillis();((remaining.coerceAtLeast(0L)+86400000L-1L)/86400000L).coerceAtLeast(1L).toString()}?: "7")}
    LaunchedEffect(uploadedImageUrl,uploadedImageFileId){
        if(!uploadedImageUrl.isNullOrBlank()&&!uploadedImageFileId.isNullOrBlank()){
            imageUrl=uploadedImageUrl;imageFileId=uploadedImageFileId;onClearUpload()
        }
    }
    AlertDialog(
        onDismissRequest=onDismiss,
        title={Text(if(initial==null)"إضافة منتج" else "تعديل المنتج")},
        text={Column(Modifier.heightIn(max=540.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedTextField(name,{name=it},label={Text("اسم المنتج *")},singleLine=true)
            Box(Modifier.fillMaxWidth()){
                OutlinedButton(onClick={categoryMenuExpanded=true},modifier=Modifier.fillMaxWidth()){Text("القسم الحالي: "+category)}
                DropdownMenu(expanded=categoryMenuExpanded,onDismissRequest={categoryMenuExpanded=false}){
                    categoryOptions.forEach{option->DropdownMenuItem(text={Text(option)},onClick={category=option;newCategory="";categoryMenuExpanded=false})}
                }
            }
            OutlinedTextField(newCategory,{newCategory=it},label={Text("أو اكتب قسمًا جديدًا")},singleLine=true)
            OutlinedTextField(price,{price=it},label={Text("السعر الحالي *")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),singleLine=true)
            OutlinedTextField(originalPrice,{originalPrice=it},label={Text("السعر قبل العرض")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),singleLine=true)
            OutlinedTextField(offer,{offer=it},label={Text("تفاصيل العرض")})
            Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){FilterChip(selected=type=="product",onClick={type="product"},label={Text("منتج")});FilterChip(selected=type=="subscription",onClick={type="subscription"},label={Text("اشتراك/تجديد")})}
            OutlinedTextField(duration,{duration=it},label={Text("مدة الاشتراك")},singleLine=true)
            OutlinedTextField(description,{description=it},label={Text("الوصف المختصر")},minLines=2)
            OutlinedTextField(details,{details=it},label={Text("التفاصيل والمواصفات")},minLines=3)
            OutlinedTextField(imageUrl,{imageUrl=it;if(!it.startsWith("/api/store/media/"))imageFileId=""},label={Text("رابط الصورة أو مسار صورة المتجر")},singleLine=true)
            if(imageUrl.isNotBlank())AsyncImage(model=storeImageSource(imageUrl),contentDescription="معاينة صورة المنتج",modifier=Modifier.fillMaxWidth().heightIn(max=180.dp),contentScale=ContentScale.Fit)
            OutlinedTextField(imageFileId,{imageFileId=it},label={Text("معرّف ملف الصورة (اختياري)")},singleLine=true)
            OutlinedButton(onClick={imagePicker.launch("image/*")},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("اختيار صورة من الجهاز ورفعها إلى MongoDB")}
            OutlinedTextField(stock,{stock=it},label={Text("الكمية — اتركها فارغة بدون تحديد")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),singleLine=true)
            Row(verticalAlignment=Alignment.CenterVertically){Text("المنتج ظاهر في المتجر",modifier=Modifier.weight(1f));Switch(active,{active=it})}
            Row(verticalAlignment=Alignment.CenterVertically){Text("نشر المنتج كإعلان",modifier=Modifier.weight(1f));Switch(advertised,{advertised=it})}
            OutlinedTextField(audience,{audience=it},label={Text("الجمهور: both / client / fanni")},singleLine=true)
            OutlinedTextField(priority,{priority=it},label={Text("أولوية الإعلان 0 - 100")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),singleLine=true)
            OutlinedTextField(adDays,{adDays=it},label={Text("مدة الإعلان بالأيام 1 - 365")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),singleLine=true)
        }},
        confirmButton={TextButton(enabled=!busy&&name.trim().length>=2&&price.toDoubleOrNull()?.let{it>=0}==true&&(originalPrice.isBlank()||originalPrice.toDoubleOrNull()?.let{it>=0}==true)&&audience in listOf("both","client","fanni")&&priority.toIntOrNull()?.let{it in 0..100}==true&&(!advertised||adDays.toIntOrNull()?.let{it in 1..365}==true)&&(stock.isBlank()||stock.toIntOrNull()?.let{it>=0}==true),onClick={
            val adUntil=if(advertised){java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US).apply{timeZone=java.util.TimeZone.getTimeZone("UTC")}.format(java.util.Date(System.currentTimeMillis()+(adDays.toIntOrNull()?.coerceIn(1,365)?:7)*86400000L))}else null
            val finalCategory=newCategory.trim().ifBlank{category.trim().ifBlank{"عام"}}.take(80)
            val body=JsonObject().apply{
                addProperty("name",name.trim());addProperty("category",finalCategory);addProperty("price",price.toDouble())
                if(originalPrice.isBlank())add("originalPrice",com.google.gson.JsonNull.INSTANCE)else addProperty("originalPrice",originalPrice.toDoubleOrNull())
                addProperty("offerText",offer.trim());addProperty("type",type);addProperty("subscriptionDuration",duration.trim())
                addProperty("description",description.trim());addProperty("details",details.trim());addProperty("imageUrl",imageUrl.trim())
                if(imageFileId.isBlank())add("imageFileId",com.google.gson.JsonNull.INSTANCE)else addProperty("imageFileId",imageFileId.trim())
                addProperty("isActive",active);addProperty("isAdvertised",advertised);addProperty("adAudience",audience)
                addProperty("adPriority",priority.toInt());if(adUntil==null)add("adExpiresAt",com.google.gson.JsonNull.INSTANCE)else addProperty("adExpiresAt",adUntil)
                if(stock.isBlank())add("stock",com.google.gson.JsonNull.INSTANCE)else addProperty("stock",stock.toInt())
            }
            val id=source?.get("_id")?.asString?:source?.get("id")?.asString
            onSave(if(id==null)"POST" else "PUT",if(id==null)"api/admin/store/products" else "api/admin/store/products/"+id,body)
        }){Text("حفظ المنتج")}},
        dismissButton={TextButton(onClick=onDismiss){Text("إلغاء")}}
    )
}

@Composable private fun StoreCategoryEditor(
    initial:JsonElement?,
    create:Boolean,
    busy:Boolean,
    uploadedImageUrl:String?,
    uploadedImageFileId:String?,
    onUploadImage:(android.net.Uri)->Unit,
    onClearUpload:()->Unit,
    onDismiss:()->Unit,
    onSave:(String,String,JsonObject)->Unit
){
    val imagePicker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)onUploadImage(uri)}
    val source=initial?.asJsonObject
    var name by remember(initial,create){mutableStateOf(source?.get("name")?.asString.orEmpty())}
    var imageUrl by remember(initial,create){mutableStateOf(source?.get("customImageUrl")?.asString.orEmpty())}
    var imageFileId by remember(initial,create){mutableStateOf(source?.get("imageFileId")?.takeIf{!it.isJsonNull}?.asString.orEmpty())}
    LaunchedEffect(uploadedImageUrl,uploadedImageFileId){
        if(!uploadedImageUrl.isNullOrBlank()&&!uploadedImageFileId.isNullOrBlank()){
            imageUrl=uploadedImageUrl;imageFileId=uploadedImageFileId;onClearUpload()
        }
    }
    val oldName=source?.get("name")?.asString?:name
    AlertDialog(
        onDismissRequest=onDismiss,
        title={Text(if(create)"إضافة قسم متجر" else "تعديل قسم المتجر")},
        text={Column(verticalArrangement=Arrangement.spacedBy(7.dp)){
            OutlinedTextField(name,{name=it},label={Text("اسم القسم")},singleLine=true)
            OutlinedTextField(imageUrl,{imageUrl=it;if(!it.startsWith("/api/store/media/"))imageFileId=""},label={Text("رابط صورة القسم (اختياري)")},singleLine=true)
            if(imageUrl.isNotBlank())AsyncImage(model=storeImageSource(imageUrl),contentDescription="معاينة صورة القسم",modifier=Modifier.fillMaxWidth().heightIn(max=160.dp),contentScale=ContentScale.Fit)
            OutlinedTextField(imageFileId,{imageFileId=it},label={Text("معرّف ملف صورة القسم (اختياري)")},singleLine=true)
            OutlinedButton(onClick={imagePicker.launch("image/*")},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("اختيار صورة للقسم من الجهاز")}
        }},
        confirmButton={TextButton(enabled=!busy&&name.trim().length in 2..80,onClick={
            val body=JsonObject().apply{addProperty("name",name.trim());addProperty("imageUrl",imageUrl.trim());if(imageFileId.isBlank())add("imageFileId",com.google.gson.JsonNull.INSTANCE)else addProperty("imageFileId",imageFileId.trim())}
            onSave("PUT","api/admin/store/categories/"+android.net.Uri.encode(oldName.ifBlank{name.trim()}),body)
        }){Text("حفظ القسم")}},
        dismissButton={TextButton(onClick=onDismiss){Text("إلغاء")}}
    )
}

@Composable private fun StoreOrdersScreen(
    payload:JsonElement?,
    orders:List<JsonElement>,
    busy:Boolean,
    canWrite:(String)->Boolean,
    onAction:(String,String,JsonObject)->Unit
){
    val statuses=listOf("جديد","تم التواصل","قيد التجهيز","ملغي","مكتمل")
    var selected by remember{mutableStateOf("جديد")}
    val filtered=orders.filter{it.isJsonObject&&(it.asJsonObject.get("status")?.takeIf{v->!v.isJsonNull}?.asString?: "جديد")==selected}
    val pending=payload?.takeIf{it.isJsonObject}?.asJsonObject?.get("storeOrderCount")?.takeIf{it.isJsonObject}?.asJsonObject?.get("pendingCount")?.toString()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
        Text("طلبات ومبيعات المتجر",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
        Text("طلبات جديدة: "+(pending?:orders.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString=="جديد"}),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
            statuses.forEach{status->FilterChip(selected=selected==status,onClick={selected=status},label={Text(status+" "+orders.count{it.isJsonObject&&it.asJsonObject.get("status")?.asString==status})})}
        }
        if(filtered.isEmpty())Text(if(busy)"جاري تحميل الطلبات..." else "لا توجد طلبات في الحالة المحددة",color=Color.Gray)
        filtered.forEach{item->
            val o=item.asJsonObject
            val id=o.get("_id")?.asString?:o.get("id")?.asString.orEmpty()
            var status by remember(item){mutableStateOf(o.get("status")?.asString?: "جديد")}
            var payment by remember(item){mutableStateOf(o.get("paymentMethod")?.asString?: "غير محدد")}
            var note by remember(item){mutableStateOf(o.get("adminNote")?.asString.orEmpty())}
            Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
                Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                    Text(o.get("productName")?.asString.orEmpty(),fontWeight=FontWeight.Bold,color=DarkAccent)
                    Text((o.get("productType")?.asString?: "product")+" • "+o.get("buyerName")?.asString.orEmpty()+" • "+o.get("buyerPhone")?.asString.orEmpty(),style=MaterialTheme.typography.bodySmall)
                    Text("الكمية: "+(o.get("quantity")?.toString()?: "0")+" • الإجمالي: "+(o.get("total")?.toString()?: "0")+" جنيه",style=MaterialTheme.typography.bodySmall)
                    Text("المشتري: "+if(o.get("buyerRole")?.asString=="client")"عميل" else "فني",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                    Text("الدفع: "+(o.get("paymentStatus")?.asString?: "غير مدفوع"),style=MaterialTheme.typography.bodySmall)
                    Text("تحديث الحالة",style=MaterialTheme.typography.labelMedium,fontWeight=FontWeight.Bold)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(4.dp)){
                        statuses.forEach{value->FilterChip(selected=status==value,onClick={status=value},label={Text(value)})}
                    }
                    Text("طريقة الدفع",style=MaterialTheme.typography.labelMedium,fontWeight=FontWeight.Bold)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(4.dp)){
                        listOf("غير محدد","محفظة العميل","عند الاستلام","تحويل").forEach{value->FilterChip(selected=payment==value,onClick={payment=value},label={Text(value)})}
                    }
                    Text("ملاحظة المشتري الحالية: "+(o.get("buyerNote")?.takeIf{!it.isJsonNull}?.asString.orEmpty()),style=MaterialTheme.typography.bodySmall,color=Color.Gray)
                    OutlinedTextField(note,{note=it},label={Text("ملاحظة الإدارة للمشتري")},minLines=2)
                    Button(onClick={onAction("PATCH","api/admin/store/orders/"+id,JsonObject().apply{addProperty("status",status);addProperty("paymentMethod",payment);addProperty("adminNote",note.trim())})},enabled=!busy&&canWrite("api/admin/store/orders/"+id)&&status in statuses&&status!="جديد"&&payment in listOf("غير محدد","محفظة العميل","عند الاستلام","تحويل"),modifier=Modifier.fillMaxWidth()){Text("حفظ الحالة وإشعار المشتري")}
                }
            }
        }
    }
}


private data class StoreCsvPreview(
    val products:List<JsonObject>,
    val errors:List<String>,
    val headers:List<String> = emptyList(),
    val mapping:Map<String,Int> = emptyMap(),
    val rows:List<List<String>> = emptyList()
)
private fun parseStoreCsvProducts(source:String,columnMapping:Map<String,Int>?=null):StoreCsvPreview{
    val firstLine=source.lineSequence().firstOrNull().orEmpty()
    val delimiter=listOf(',', ';', '\t').maxByOrNull{candidate->
        var count=0;var quoted=false;var cursor=0
        while(cursor<firstLine.length){
            val ch=firstLine[cursor]
            if(ch=='"'&&quoted&&cursor+1<firstLine.length&&firstLine[cursor+1]=='"')cursor++
            else if(ch=='"')quoted=!quoted
            else if(ch==candidate&&!quoted)count++
            cursor++
        }
        count
    }?:','
    val rows=mutableListOf<List<String>>()
    val row=mutableListOf<String>()
    val cell=StringBuilder()
    var quoted=false
    var index=0
    while(index<source.length){
        val ch=source[index]
        when{
            ch=='"'&&quoted&&index+1<source.length&&source[index+1]=='"'->{cell.append('"');index++}
            ch=='"'->{quoted=!quoted}
            ch==delimiter&&!quoted->{row.add(cell.toString().trim());cell.setLength(0)}
            (ch=='\n'||ch=='\r')&&!quoted->{
                if(ch=='\r'&&index+1<source.length&&source[index+1]=='\n')index++
                row.add(cell.toString().trim());cell.setLength(0)
                if(row.any{it.isNotBlank()})rows.add(row.toList())
                row.clear()
            }
            else->cell.append(ch)
        }
        index++
    }
    row.add(cell.toString().trim())
    if(row.any{it.isNotBlank()})rows.add(row.toList())
    if(rows.size<2)error("ملف CSV يجب أن يحتوي على صف عناوين وصف منتج واحد على الأقل")
    if(rows.size-1>500)error("الحد الأقصى للاستيراد 500 منتج في الدفعة الواحدة. قسّم الملف إلى دفعات.")
    fun norm(value:String)=java.text.Normalizer.normalize(value.removePrefix(String(charArrayOf(0xFEFF.toChar()))),java.text.Normalizer.Form.NFKC).lowercase(java.util.Locale.ROOT)
        .replace(Regex("[\\u064B-\\u065F\\u0670\\u0640]"),"")
        .replace(Regex("[\\s_\\-./]+"),"").replace("،","").replace("؛","").replace("(","").replace(")","").replace("[","").replace("]","").replace("{","").replace("}","").replace(":","")
    val aliases=mapOf(
        "name" to listOf("name","product","productname","title","اسم","اسم المنتج","المنتج"),
        "price" to listOf("price","currentprice","السعر","السعر الحالي"),
        "category" to listOf("category","section","group","القسم","الفئة","التصنيف"),
        "originalPrice" to listOf("originalprice","oldprice","السعر القديم","السعر قبل العرض"),
        "offerText" to listOf("offer","offertext","العرض","تفاصيل العرض"),
        "description" to listOf("description","desc","الوصف","الوصف المختصر"),
        "details" to listOf("details","specifications","التفاصيل","المواصفات"),
        "type" to listOf("type","نوع المنتج","النوع"),
        "subscriptionDuration" to listOf("duration","subscriptionduration","مدة الاشتراك"),
        "stock" to listOf("stock","quantity","qty","المخزون","الكمية"),
        "imageUrl" to listOf("image","imageurl","image_url","رابط الصورة","رابط صورة المنتج","صورة المنتج"),
        "isActive" to listOf("active","isactive","enabled","نشط","مفعل","حالة المنتج")
    )
    val headers=rows.first().mapIndexed{index,value->if(index==0)value.removePrefix(String(charArrayOf(0xFEFF.toChar()))) else value}
    val mapping=aliases.mapValues{(_,names)->headers.indexOfFirst{header->names.any{norm(header)==norm(it)}}}.toMutableMap()
    columnMapping?.forEach{(key,index)->if(key in aliases)mapping[key]=index.takeIf{it in headers.indices}?:-1}
    fun cellAt(cells:List<String>,key:String):String{
        val col=mapping[key]?:-1
        return if(col>=0)cells.getOrNull(col).orEmpty().trim() else ""
    }
    fun number(raw:String):Double?{
        if(raw.isBlank())return null
        val english=raw.map{ch->when(ch){in '٠'..'٩'->('0'.code+(ch-'٠')).toChar();in '۰'..'۹'->('0'.code+(ch-'۰')).toChar();else->ch}}.joinToString("")
            .replace("٫",".").replace("٬","").replace(",","").replace(" ","").replace(Regex("[^0-9.\\-]"),"")
        return english.toDoubleOrNull()
    }
    val valid=mutableListOf<JsonObject>()
    val errors=mutableListOf<String>()
    rows.drop(1).forEachIndexed{rowIndex,cells->
        if(cells.all{it.isBlank()})return@forEachIndexed
        val rowNumber=rowIndex+2
        val name=cellAt(cells,"name")
        val price=number(cellAt(cells,"price"))
        if(name.length !in 2..120){errors.add("الصف "+rowNumber+": اسم المنتج مطلوب ومن حرفين إلى 120 حرفًا");return@forEachIndexed}
        if(price==null||price<0||price>100000000){errors.add("الصف "+rowNumber+": السعر غير صحيح");return@forEachIndexed}
        val originalRaw=cellAt(cells,"originalPrice")
        val original=if(originalRaw.isBlank())null else number(originalRaw)
        if(originalRaw.isNotBlank()&&(original==null||original<0||original>100000000)){errors.add("الصف "+rowNumber+": السعر قبل العرض غير صحيح");return@forEachIndexed}
        val stockRaw=cellAt(cells,"stock")
        val stockNumber=if(stockRaw.isBlank())null else number(stockRaw)
        val stock=stockNumber?.takeIf{it%1.0==0.0&&it>=0&&it<=100000000}?.toInt()
        if(stockRaw.isNotBlank()&&stock==null){errors.add("الصف "+rowNumber+": الكمية يجب أن تكون عددًا صحيحًا غير سالب");return@forEachIndexed}
        val rawType=cellAt(cells,"type")
        val type=if(rawType.contains("اشتراك")||rawType.equals("subscription",true))"subscription" else "product"
        val imageUrl=cellAt(cells,"imageUrl")
        val parsedImage=if(imageUrl.isBlank())null else runCatching{Uri.parse(imageUrl)}.getOrNull()
        val validImageScheme=parsedImage?.scheme?.lowercase()=="http"||parsedImage?.scheme?.lowercase()=="https"
        if(imageUrl.isNotBlank()&&(!validImageScheme||parsedImage?.host.isNullOrBlank()||imageUrl.length>1000)){
            errors.add("الصف "+rowNumber+": رابط الصورة يجب أن يبدأ بـ https:// أو http://")
            return@forEachIndexed
        }
        val activeRaw=cellAt(cells,"isActive").trim().lowercase()
        val isActive=activeRaw.isBlank()||activeRaw !in listOf("0","false","no","inactive","غير مفعل","مخفي","لا")
        val product=JsonObject().apply{
            addProperty("name",name);addProperty("category",cellAt(cells,"category").ifBlank{"عام"}.take(80));addProperty("price",price)
            if(original==null)add("originalPrice",com.google.gson.JsonNull.INSTANCE)else addProperty("originalPrice",original)
            addProperty("offerText",cellAt(cells,"offerText").take(200));addProperty("description",cellAt(cells,"description").take(2000));addProperty("details",cellAt(cells,"details").take(5000))
            addProperty("type",type);addProperty("subscriptionDuration",cellAt(cells,"subscriptionDuration").take(60));addProperty("imageUrl",imageUrl);add("imageFileId",com.google.gson.JsonNull.INSTANCE)
            addProperty("isActive",isActive);addProperty("isAdvertised",false);addProperty("adAudience","both");addProperty("adPriority",0);add("adExpiresAt",com.google.gson.JsonNull.INSTANCE)
            if(stock==null)add("stock",com.google.gson.JsonNull.INSTANCE)else addProperty("stock",stock)
        }
        valid.add(JsonObject().apply{addProperty("rowNumber",rowNumber);add("product",product)})
    }
    if(valid.size>500)error("الحد الأقصى للاستيراد 500 منتج في الدفعة الواحدة. قسّم الملف إلى دفعات.")
    return StoreCsvPreview(valid,errors,headers,mapping,rows.drop(1))
}


@Composable private fun FanniIdentityScreen(
    frontPath:String?,
    backPath:String?,
    busy:Boolean,
    onClose:()->Unit
){
    val front=remember(frontPath){frontPath?.let{android.graphics.BitmapFactory.decodeFile(it)}}
    val back=remember(backPath){backPath?.let{android.graphics.BitmapFactory.decodeFile(it)}}
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
        Text("صور بطاقة الرقم القومي للفني",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=DarkAccent)
        Text("صور سرية للمراجعة الإدارية فقط. لا تُعرض إلا بعد طلب مصادق عليه من الخادم.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)
        if(busy)Text("جاري تحميل صور البطاقة...",color=Color.Gray)
        Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
            Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                Text("الوجه الأمامي",fontWeight=FontWeight.Bold,color=DarkAccent)
                if(front!=null)Image(front.asImageBitmap(),contentDescription="الوجه الأمامي للبطاقة",modifier=Modifier.fillMaxWidth().heightIn(max=420.dp),contentScale=ContentScale.Fit)
                else Text("الصورة الأمامية غير متاحة أو لم يكتمل تحميلها",color=Color.Gray)
            }
        }
        Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=Color.White)){
            Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                Text("الوجه الخلفي",fontWeight=FontWeight.Bold,color=DarkAccent)
                if(back!=null)Image(back.asImageBitmap(),contentDescription="الوجه الخلفي للبطاقة",modifier=Modifier.fillMaxWidth().heightIn(max=420.dp),contentScale=ContentScale.Fit)
                else Text("الصورة الخلفية غير متاحة أو لم يكتمل تحميلها",color=Color.Gray)
            }
        }
        Button(onClick=onClose,modifier=Modifier.fillMaxWidth()){Text("إغلاق صور البطاقة")}
    }
}
