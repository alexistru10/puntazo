# Puntazo

Prototipo: una cámara graba la pista de pádel sin parar y, al pulsar **¡Puntazo!**, guarda los últimos 50 segundos como un vídeo MP4 con el marcador (logo, club, pista, fecha y hora).

## Cómo usarlo
1. Abre `index.html` con Chrome o Edge.
2. Pulsa **Encender cámara** y da permiso.
3. Pulsa **¡Puntazo!** (o la barra espaciadora) cuando pase algo bueno.
4. Los clips aparecen abajo para verlos, descargarlos o borrarlos.

## Cómo funciona
- Un solo codificador de vídeo (WebCodecs) comprime cada fotograma con el marcador dibujado encima.
- Se guardan en memoria los últimos ~54 s; al pulsar se arma un MP4 con [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (licencia MIT).
- El código está en `src/`; `./build.sh` genera `index.html`.
