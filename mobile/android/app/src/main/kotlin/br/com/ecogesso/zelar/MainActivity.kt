package br.com.ecogesso.zelar

import android.content.ActivityNotFoundException
import android.content.Intent
import android.media.AudioManager
import android.provider.Settings
import android.speech.tts.TextToSpeech
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ecogesso.zelar/sistema")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "abrirConfiguracoesDeVoz" -> result.success(abrirConfiguracoesDeVoz())
                    "volumeDeMidia" -> result.success(volumeDeMidia())
                    else -> result.notImplemented()
                }
            }
    }

    /** Só abre a tela: quem instala a voz é a pessoa. Os fabricantes variam, daí as alternativas. */
    private fun abrirConfiguracoesDeVoz(): Boolean {
        val telas = listOf(
            "com.android.settings.TTS_SETTINGS",
            TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA,
            Settings.ACTION_SETTINGS,
        )
        for (tela in telas) {
            try {
                startActivity(Intent(tela))
                return true
            } catch (_: ActivityNotFoundException) {
                // Tenta a próxima.
            }
        }
        return false
    }

    private fun volumeDeMidia(): Int {
        val audio = getSystemService(AUDIO_SERVICE) as AudioManager
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC)
    }
}
