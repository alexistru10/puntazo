#!/bin/sh
# Junta las partes en index.html (incluye mp4-muxer 5.2.1, licencia MIT)
cd "$(dirname "$0")"
[ -f vendor/mp4-muxer.js ] || { mkdir -p vendor && curl -sL https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.js -o vendor/mp4-muxer.js; }
{ cat src/head.html; echo '<script>/* mp4-muxer 5.2.1, MIT license, https://github.com/Vanilagy/mp4-muxer */'; cat vendor/mp4-muxer.js; echo '</script>'; cat src/app.js src/tail.html; } > index.html
