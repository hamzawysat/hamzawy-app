package com.sonaa.nativeadmin

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AdminLaunchSmokeTest {
    @Test
    fun launchShowsOnlyConfiguredAdminWebViewOrOneTimeAdminUrlSetup() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val content = activity.findViewById<ViewGroup>(android.R.id.content)
                assertTrue("Activity content should not be empty", content.childCount > 0)
                val root = content.getChildAt(0)
                val isAdminWebView = root is WebView
                val isOneTimeSetup = containsText(root, "إعداد رابط لوحة الإدارة")
                assertTrue(
                    "Expected the restricted admin WebView or its one-time URL setup screen",
                    isAdminWebView || isOneTimeSetup
                )
            }
        }
    }

    private fun containsText(view: View, expected: String): Boolean {
        if (view is TextView && view.text?.toString()?.contains(expected) == true) return true
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                if (containsText(view.getChildAt(index), expected)) return true
            }
        }
        return false
    }
}
