import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "app.zelar.campo"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Mudou na 1.2.0 (antes br.com.ecogesso.zelo), junto com a chave de assinatura: os celulares
        // com a versão antiga precisam desinstalá-la uma vez. Trocar de novo exige outra reinstalação.
        applicationId = "app.zelar.campo"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 29 // Android 10+ (escopo v0.5, seção 11)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Chave de release: mobile/android/key.properties nesta máquina, ou variáveis de ambiente no CI
    // (.github/workflows/release.yml). Sem nenhuma das duas, o build de release falha: um APK
    // assinado com outra chave não atualiza por cima do instalado nos celulares.
    val chave = Properties().apply {
        val arquivo = rootProject.file("key.properties")
        if (arquivo.exists()) arquivo.inputStream().use { load(it) }
    }
    fun valor(nome: String, variavel: String): String? = chave.getProperty(nome) ?: System.getenv(variavel)
    val arquivoDaChave = valor("storeFile", "ZELAR_KEYSTORE_FILE")

    signingConfigs {
        if (arquivoDaChave != null) {
            create("release") {
                storeFile = file(arquivoDaChave)
                storePassword = valor("storePassword", "ZELAR_KEYSTORE_PASSWORD")
                keyAlias = valor("keyAlias", "ZELAR_KEY_ALIAS")
                keyPassword = valor("keyPassword", "ZELAR_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
        }
    }
}

// Falha só quando se pede um APK de release: debug e testes não precisam da chave.
gradle.taskGraph.whenReady {
    if (android.signingConfigs.findByName("release") == null &&
        allTasks.any { it.project == project && it.name == "packageRelease" }
    ) {
        throw GradleException("Falta a chave de release: crie mobile/android/key.properties (veja docs/implantar.md).")
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
