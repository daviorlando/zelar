# App de campo do Zelar

Flutter, Android 10+. Funciona sem internet, guarda as respostas no aparelho e envia quando há rede.

```bash
flutter pub get
flutter run --dart-define=ZELAR_API=http://IP-DO-COMPUTADOR:3000   # painel local
flutter test
```

Não passe `ZELAR_DEVICE_KEY` no build: com ela o app pula o pareamento. Sem `ZELAR_API`, o app abre com um trabalhador de teste. Para instalar em celulares, use o APK de https://github.com/daviorlando/zelar/releases/latest e o código de **Celulares** no painel; veja [docs/implantar.md](../docs/implantar.md#7-celulares).
