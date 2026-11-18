package com.sonaa.nativeadmin

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AdminLaunchSmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun unauthenticatedLaunchShowsAdminLoginForm() {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("سجّل الدخول للمتابعة").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("إدارة حمزاوي سات CON").assertExists()
        composeRule.onNodeWithText("رقم الهاتف").assertExists()
        composeRule.onNodeWithText("كلمة المرور").assertExists()
        composeRule.onNodeWithText("تسجيل الدخول").assertExists()
    }
}
