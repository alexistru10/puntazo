#!/bin/sh
# Junta las partes en index.html. Incluye mp4-muxer 5.2.1 y qrcode-generator 1.4.4 (ambas con licencia MIT).
cd "$(dirname "$0")"
mkdir -p vendor
[ -f vendor/mp4-muxer.js ] || curl -sL https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.js -o vendor/mp4-muxer.js
[ -f vendor/qrcode.js ] || curl -sL https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js -o vendor/qrcode.js
{
  cat src/head.html
  echo '<script>/* mp4-muxer 5.2.1, MIT license, https://github.com/Vanilagy/mp4-muxer */'; cat vendor/mp4-muxer.js; echo '</script>'
  echo '<script>/* qrcode-generator 1.4.4, MIT license, https://github.com/kazuhikoarase/qrcode-generator */'; cat vendor/qrcode.js; echo '</script>'
  cat src/app.js src/tail.html
} > index.html
