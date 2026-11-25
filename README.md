# Puntazo

Prototipo: una cámara graba la pista de pádel sin parar y, al pulsar **¡Puntazo!**, guarda los últimos 50 segundos como un vídeo MP4 con el marcador (logo, club, pista, fecha y hora).

## Cómo usarlo
1. Haz doble clic en **Iniciar Puntazo.bat** (necesita [Node.js](https://nodejs.org)). Se abre una ventana negra (no la cierres) y la app en el navegador.
2. Pulsa **Encender cámara** y da permiso.
3. Pulsa **¡Puntazo!** (o la barra espaciadora) cuando pase algo bueno.
4. Sale un **QR**: el jugador lo escanea con su móvil (misma WiFi) y descarga el vídeo.
5. Después de cada clip hay una pausa de 5 s. Se puede guardar desde el primer segundo (guarda lo grabado hasta ese momento, máximo 50 s).
6. Los clips quedan en la carpeta `clips` y se borran solos a las 24 horas.

También puedes abrir `index.html` directamente, pero entonces no hay QR.

## Cómo funciona
- Un solo codificador de vídeo (WebCodecs) comprime cada fotograma con el marcador dibujado encima.
- Se guardan en memoria los últimos ~54 s; al pulsar se arma un MP4 con [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (licencia MIT).
- `server.js` (sin dependencias) recibe los clips, los guarda en `clips/` y sirve una página para el móvil con el vídeo y un botón de descarga.
- El QR se genera con [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (licencia MIT).
- El código de la página está en `src/`; `./build.sh` genera `index.html`.
