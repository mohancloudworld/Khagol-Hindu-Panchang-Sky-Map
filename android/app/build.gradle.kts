import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: android/keystore/keystore.properties + upload-keystore.jks (both gitignored;
// created by build.sh on first release build). Absent -> release falls back to debug signing so
// local builds always succeed.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore/keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "io.github.mohancloudworld.khagol"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.mohancloudworld.khagol"
        minSdk = 26            // Android 8.0 -- solid WASM + WebGL + adaptive icons
        targetSdk = 36         // Play: new apps + updates must target API 36 from 31 Aug 2026
        versionCode = 1
        versionName = "1.1.0"
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // The app is one small Kotlin file + bundled web assets; shrinking buys nothing and
            // R8 config would be pure risk. Keep the store package deterministic and readable.
            isMinifyEnabled = false
            signingConfig = if (keystoreProps.isNotEmpty())
                signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
