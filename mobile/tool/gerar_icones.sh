#!/usr/bin/env bash
# Gera os ícones do site e do app a partir de frontend/src/app/icon.svg.
# Precisa de inkscape e magick. Rode depois de mudar a logo e faça o commit dos arquivos gerados.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SVG="$RAIZ/frontend/src/app/icon.svg"
RES="$RAIZ/mobile/android/app/src/main/res"
FUNDO="#F5F5F0" # ZelarColors.surface
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# logo LADO: PNG quadrado da logo em LADO pixels; o caminho sai em stdout.
logo() {
  local f="$TMP/logo-$1.png"
  [ -f "$f" ] || inkscape "$SVG" --export-type=png --export-filename="$f" -w "$1" -h "$1" >/dev/null 2>&1
  echo "$f"
}

# tela LOGO TELA FUNDO SAIDA: centraliza a logo em uma tela quadrada.
tela() {
  magick -size "$2x$2" "xc:$3" "$(logo "$1")" -gravity center -composite -define png:color-type=6 "$4"
}

# Densidades do Android: multiplicador x 4 (mdpi=4 ... xxxhdpi=16), para evitar frações.
for par in mdpi:4 hdpi:6 xhdpi:8 xxhdpi:12 xxxhdpi:16; do
  d="${par%%:*}"; m="${par##*:}"
  mkdir -p "$RES/mipmap-$d" "$RES/drawable-$d"
  # Ícone para quem não usa ícone adaptativo: 48 dp.
  tela $((36 * m / 4)) $((48 * m / 4)) "$FUNDO" "$RES/mipmap-$d/ic_launcher.png"
  # Ícone adaptativo: tela de 108 dp, com a logo dentro da área segura de 66 dp.
  tela $((64 * m / 4)) $((108 * m / 4)) none "$RES/mipmap-$d/ic_launcher_foreground.png"
  # Abertura: tela de 288 dp, com a logo em 160 dp. ZelarOpening.logoSize precisa ser igual.
  tela $((160 * m / 4)) $((288 * m / 4)) none "$RES/drawable-$d/splash_logo.png"
done

# Site: a aba do navegador e a tela inicial do iPhone.
magick "$(logo 16)" "$(logo 32)" "$(logo 48)" "$RAIZ/frontend/src/app/favicon.ico"
tela 140 180 "$FUNDO" "$RAIZ/frontend/src/app/apple-icon.png"

echo "Ícones gerados."
