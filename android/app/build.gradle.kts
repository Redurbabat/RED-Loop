plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bbtred.redloop"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bbtred.redloop"
        // Android 8 and newer; the foreground service type only matters from 34.
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.5.0"
    }

    buildTypes {
        // The debug build is signed with the standard debug key, so the APK
        // installs directly on a tablet without any developer account.
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    testImplementation("junit:junit:4.13.2")
    // Android stubs org.json in unit tests; the real one keeps the parser testable.
    testImplementation("org.json:json:20240303")
}
