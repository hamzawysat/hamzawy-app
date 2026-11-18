package com.sonaa.nativeadmin
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
class SonaaMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        getSharedPreferences("sonaa_admin_session", Context.MODE_PRIVATE).edit().putString("pending_fcm_token", token).apply()
        sendBroadcast(Intent(ACTION_TOKEN_REFRESHED).setPackage(packageName).putExtra("token", token))
    }
    override fun onMessageReceived(message: RemoteMessage) {
        val type = message.data["type"].orEmpty()
        val channel = channelFor(type)
        val title = message.notification?.title ?: message.data["title"] ?: "إشعار من صُنّاع"
        val body = message.notification?.body ?: message.data["message"] ?: ""
        val allowedDestinations = setOf("orders", "storeOrders", "commerceSubscriptions", "technicians", "clients", "clientWallet", "wallet", "recovery", "support", "topups", "wallets")
        val destination = message.data["destination"]?.takeIf { it in allowedDestinations } ?: when (channel) {
            "order_new" -> "orders"
            "fanni_register" -> "technicians"
            "client_register" -> "clients"
            "password_reset" -> "recovery"
            "support" -> "support"
            "wallet_charge" -> "topups"
            else -> "dashboard"
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("destination", destination)
            putExtra("link", message.data["link"].orEmpty())
            putExtra("link", message.data["link"].orEmpty())
        }
        val pending = PendingIntent.getActivity(this, type.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.sonaa_logo).setContentTitle(title).setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH).build()
        val notificationId = message.data["notificationId"]?.takeIf { it.isNotBlank() }?.hashCode() ?: type.hashCode()
        getSystemService(NotificationManager::class.java).notify(notificationId, notification)
    }
    private fun channelFor(type: String) = when (type) {
        "order_new", "new_order", "admin_new_order", "admin_store_order", "admin_order_offer_accepted",
        "admin_order_cancelled", "admin_order_completed", "admin_fanni_offer",
        "admin_price_change_requested", "admin_client_rating" -> "order_new"
        "fanni_register", "new_fanni", "admin_new_technician", "admin_fanni_profile_edit",
        "admin_fanni_login", "admin_fanni_logout" -> "fanni_register"
        "client_register", "new_client", "admin_new_client", "admin_client_login",
        "admin_client_logout" -> "client_register"
        "password_reset", "admin_password_recovery", "admin_password_recovery_message" -> "password_reset"
        "support", "new_complaint", "admin_support_request", "admin_new_complaint",
        "admin_support_followup" -> "support"
        "wallet_charge", "topup_request", "admin_new_topup", "admin_client_topup",
        "admin_service_payment_held", "admin_subscription_request", "admin_subscription_renewed", "wallet_credit",
        "fanni_wallet_settlement", "technician_settlement", "topup_approved",
        "topup_rejected", "wallet_debit", "commission_deducted", "client_wallet_topup_approved",
        "client_wallet_topup_rejected", "client_wallet_credit", "client_wallet_debit",
        "client_wallet_settlement", "client_service_refunded" -> "wallet_charge"
        else -> "support"
    }
    companion object {
        const val ACTION_TOKEN_REFRESHED = "com.sonaa.nativeadmin.FCM_TOKEN_REFRESHED"
        fun createChannels(manager: NotificationManager) {
            if (Build.VERSION.SDK_INT >= 26) listOf(
                "order_new" to "طلبات جديدة", "fanni_register" to "تسجيل فني جديد",
                "client_register" to "تسجيل عميل جديد", "password_reset" to "استعادة كلمة المرور",
                "support" to "الدعم والشكاوى", "wallet_charge" to "شحن المحفظة"
            ).forEach { (id, name) -> manager.createNotificationChannel(NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH)) }
        }
    }
}
