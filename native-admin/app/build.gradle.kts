plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}
val adminPanelUrl = providers.gradleProperty("ADMIN_PANEL_URL")
    .orElse(providers.environmentVariable("ADMIN_PANEL_URL"))
    .getOrElse("")
val escapedAdminPanelUrl = adminPanelUrl.replace("\\", "\\\\").replace("\"", "\\\"")

android {
    namespace = "com.sonaa.nativeadmin"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.sonaa.nativeadmin"
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "2.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"sonaa-app-notifications\"")
        buildConfigField("String", "FIREBASE_SENDER_ID", "\"228718138416\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"1:228718138416:android:c49c85878c948fcbb809f5\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"AIzaSyDOBGJCHuevDX1utn0M9VqDknmB15XJdj4\"")
        buildConfigField("String", "ADMIN_PANEL_URL", "\"$escapedAdminPanelUrl\"")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = true
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-messaging")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
