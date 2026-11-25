plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "ru.albedo.raidtalk"
    compileSdk = 35
    defaultConfig {
        applicationId = "ru.albedo.raidtalk"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}
