// Puntazo: pequeño servidor para compartir los clips por la WiFi.
// Uso: node server.js  (o doble clic en "Iniciar Puntazo.bat")
// No necesita instalar nada más que Node.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const CLIPS = path.join(ROOT, 'clips');
const MAX_BYTES = 300 * 1024 * 1024;
fs.mkdirSync(CLIPS, { recursive: true });

// La IP de esta computadora en la WiFi (evita adaptadores virtuales).
function lanIPs() {
  const bad = /virtual|vmware|vbox|hyper-v|vethernet|loopback|bluetooth|nox|tap|tun|wsl|docker/i;
  const good = /wi-?fi|wlan|wireless|ethernet|en0|eth0|wlp|enp/i;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254')) continue;
      out.push({ name, ip: a.address, score: (good.test(name) ? 2 : 0) - (bad.test(name) ? 3 : 0) + (a.address.startsWith('192.168.56.') ? -2 : 0) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
const IP = process.env.PUNTAZO_IP || (lanIPs()[0] || { ip: 'localhost' }).ip;
const BASE = `http://${IP}:${PORT}`;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validId = id => /^[0-9]{8}-[0-9]{6}-[0-9]{3}$/.test(id);
const fileOf = id => path.join(CLIPS, `puntazo_${id}.mp4`);

function newId() {
  const d = new Date(), p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

function send(res, code, type, body, extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

// Página que ve el jugador en su móvil al escanear el QR.
function phonePage(id) {
  const y = id.slice(0, 4), mo = id.slice(4, 6), d = id.slice(6, 8), h = id.slice(9, 11), mi = id.slice(11, 13), s = id.slice(13, 15);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Tu puntazo</title>
<style>
:root{--bg:#06141f;--panel:#0c2233;--ink:#f4f8fc;--soft:#8fb0c9;--ball:#dff23a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
.brand{display:inline-block;background:var(--ball);color:#0b1a00;font:italic 800 26px/1 Impact,'Arial Narrow',sans-serif;padding:10px 26px 10px 14px;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);letter-spacing:.5px}
h1{font-size:28px;line-height:1.1;margin:18px 0 4px}p{color:var(--soft);margin:0 0 14px}
video{width:100%;border-radius:12px;background:#000;display:block}
a.dl{display:block;text-align:center;background:var(--ball);color:#0b1a00;font-weight:800;font-size:20px;text-decoration:none;padding:16px;border-radius:12px;margin:16px 0 10px}
.tip{font-size:14px}
</style></head><body><main>
<div class="brand">PUNTAZO</div>
<h1>¡Aquí está tu puntazo!</h1>
<p>${esc(`${d}/${mo}/${y} · ${h}:${mi}:${s}`)}</p>
<video src="/v/${esc(id)}" controls playsinline preload="metadata"></video>
<a class="dl" href="/v/${esc(id)}?dl=1" download="puntazo_${esc(id)}.mp4">Descargar vídeo</a>
<p class="tip">En iPhone: pulsa Descargar, abre la flecha azul de descargas, toca el vídeo y luego Compartir → Guardar vídeo.</p>
</main></body></html>`;
}

// Envía el vídeo con soporte de "Range" (el iPhone lo necesita para reproducir).
function sendVideo(req, res, id, download) {
  const file = fileOf(id);
  fs.stat(file, (err, st) => {
    if (err) return send(res, 404, 'text/plain; charset=utf-8', 'Clip no encontrado');
    const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
    if (download) headers['Content-Disposition'] = `attachment; filename="puntazo_${id}.mp4"`;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
      let end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start < 0) start = 0;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    }
  });
}

function saveClip(req, res) {
  const id = newId(), tmp = fileOf(id) + '.part';
  const out = fs.createWriteStream(tmp);
  let size = 0, failed = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BYTES && !failed) { failed = true; out.destroy(); fs.unlink(tmp, () => {}); send(res, 413, 'application/json', '{"error":"too big"}'); req.destroy(); }
  });
  req.pipe(out);
  out.on('finish', () => {
    if (failed) return;
    fs.rename(tmp, fileOf(id), err => {
      if (err) return send(res, 500, 'application/json', '{"error":"save"}');
      console.log(`Clip guardado: clips/puntazo_${id}.mp4 (${(size / 1e6).toFixed(1)} MB)`);
      send(res, 200, 'application/json', JSON.stringify({ id, url: `${BASE}/c/${id}` }));
    });
  });
  out.on('error', () => { if (!failed) { failed = true; send(res, 500, 'application/json', '{"error":"save"}'); } });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    return fs.readFile(path.join(ROOT, 'index.html'), (err, buf) => err ? send(res, 500, 'text/plain', 'Falta index.html') : send(res, 200, 'text/html; charset=utf-8', buf));
  }
  if (req.method === 'GET' && p === '/api/info') return send(res, 200, 'application/json', JSON.stringify({ base: BASE }));
  if (req.method === 'POST' && p === '/api/clips') return saveClip(req, res);
  let m;
  if (req.method === 'GET' && (m = /^\/c\/([\w-]+)$/.exec(p)) && validId(m[1])) {
    if (!fs.existsSync(fileOf(m[1]))) return send(res, 404, 'text/html; charset=utf-8', '<h1>Este clip ya no existe</h1>');
    return send(res, 200, 'text/html; charset=utf-8', phonePage(m[1]));
  }
  if (req.method === 'GET' && (m = /^\/v\/([\w-]+)$/.exec(p)) && validId(m[1])) return sendVideo(req, res, m[1], url.searchParams.has('dl'));
  send(res, 404, 'text/plain; charset=utf-8', 'No encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  PUNTAZO funcionando');
  console.log(`  En esta computadora:  http://localhost:${PORT}`);
  console.log(`  Los móviles usarán:   ${BASE}`);
  const others = lanIPs().slice(1).map(x => x.ip);
  if (others.length) console.log(`  (otras IP posibles: ${others.join(', ')})`);
  console.log('  No cierres esta ventana mientras uses Puntazo.');
  console.log('');
  if (process.platform === 'win32' && !process.env.PUNTAZO_NO_OPEN) require('child_process').exec(`start "" http://localhost:${PORT}`);
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${PORT} ya está en uso. ¿Puntazo ya está abierto en otra ventana?` : e);
  process.exitCode = 1;
});
