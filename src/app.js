<script>
{
const $ = id => document.getElementById(id);
const CLIP = 50;          // segundos que se guardan al pulsar
const KEEP = CLIP + 4;    // segundos que se guardan en memoria
const KEY_EVERY = 1e6;    // un fotograma clave cada segundo (µs)

let vEnc = null, aEnc = null, vMeta = null, aMeta = null, vMux = '', aMux = '', aInfo = null, size = null;
let vChunks = [], aChunks = [], clips = [];

// ---------- Grabación en bucle con un solo codificador ----------
// Cada fotograma se dibuja con el marcador encima, se comprime una vez
// y se guarda en una "cinta" de 54 s.
// Lo más viejo se va borrando. Al pulsar, se copia el trozo final a un MP4.
// ---------- Ajustes (nombre del club y pista) ----------
const cfg = { club: 'Mi club de pádel', pista: 'Pista 1' };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('puntazo-cfg') || '{}')); } catch(e){}
function applyCfg(){
  $('clubTxt').textContent = cfg.club || ' ';
  $('pistaTxt').textContent = cfg.pista || '';
  $('cfgClub').value = cfg.club; $('cfgPista').value = cfg.pista;
}
for (const [id, k] of [['cfgClub','club'], ['cfgPista','pista']]) {
  $(id).addEventListener('input', e => {
    cfg[k] = e.target.value.trim();
    try { localStorage.setItem('puntazo-cfg', JSON.stringify(cfg)); } catch(e){}
    $('clubTxt').textContent = cfg.club || ' '; $('pistaTxt').textContent = cfg.pista;
  });
}
applyCfg();

const pad = n => String(n).padStart(2,'0');
const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const hhmmss = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
setInterval(() => { $('clock').textContent = hhmmss(new Date()); }, 500);
$('clock').textContent = hhmmss(new Date());

// ---------- Marcador que va "pegado" al vídeo ----------
const COND = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
function slant(ctx, x, y, w, h, k, color){
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
}
function drawOverlay(ctx, W, H, now){
  const s = W / 1280, m = 24*s, h = 52*s, k = 14*s;
  ctx.save();
  ctx.textBaseline = 'middle';
  // logo PUNTAZO
  ctx.font = `italic 800 ${34*s}px ${COND}`;
  const brandW = ctx.measureText('PUNTAZO').width + 70*s;
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12*s; ctx.shadowOffsetY = 3*s;
  slant(ctx, m, m, brandW, h, k, '#dff23a');
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#0b1a00'; ctx.beginPath(); ctx.arc(m + 26*s, m + h/2, 13*s, 0, 7); ctx.fill();
  ctx.fillStyle = '#dff23a'; ctx.beginPath(); ctx.arc(m + 26*s, m + h/2, 10.5*s, 0, 7); ctx.fill();
  ctx.strokeStyle = '#0b1a00'; ctx.lineWidth = 1.8*s; ctx.beginPath();
  ctx.moveTo(m + 18*s, m + h/2 - 7*s); ctx.quadraticCurveTo(m + 24*s, m + h/2, m + 18*s, m + h/2 + 7*s);
  ctx.moveTo(m + 34*s, m + h/2 - 7*s); ctx.quadraticCurveTo(m + 28*s, m + h/2, m + 34*s, m + h/2 + 7*s); ctx.stroke();
  ctx.fillStyle = '#0b1a00'; ctx.fillText('PUNTAZO', m + 48*s, m + h/2 + 1*s);
  // club y pista
  const club = (cfg.club || '').toUpperCase(), pista = cfg.pista || '';
  if (club || pista) {
    ctx.font = `800 ${24*s}px ${COND}`; const cw = ctx.measureText(club).width;
    ctx.font = `600 ${17*s}px Inter, Arial, sans-serif`; const pw = ctx.measureText(pista).width;
    const bw = Math.max(cw, pw) + 44*s;
    slant(ctx, m + brandW - k, m, bw, h, k, 'rgba(6,20,31,.82)');
    ctx.fillStyle = '#fff'; ctx.font = `800 ${24*s}px ${COND}`;
    ctx.fillText(club, m + brandW + 8*s, m + (pista ? 17 : 26)*s);
    ctx.fillStyle = '#b9d0e2'; ctx.font = `600 ${17*s}px Inter, Arial, sans-serif`;
    ctx.fillText(pista, m + brandW + 8*s, m + 38*s);
  }
  // fecha y hora
  const date = `${pad(now.getDate())} ${MESES[now.getMonth()]} ${now.getFullYear()}`, time = hhmmss(now);
  ctx.font = `800 ${30*s}px ${COND}`; const tw = ctx.measureText(time).width;
  ctx.font = `600 ${15*s}px Inter, Arial, sans-serif`; const dw = ctx.measureText(date).width;
  const bw2 = tw + dw + 44*s, x2 = W - m - bw2;
  ctx.fillStyle = 'rgba(6,20,31,.82)'; ctx.beginPath(); ctx.roundRect(x2, m, bw2, h, 8*s); ctx.fill();
  ctx.fillStyle = '#b9d0e2'; ctx.fillText(date, x2 + 16*s, m + h/2);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${30*s}px ${COND}`; ctx.fillText(time, x2 + 28*s + dw, m + h/2 + 1*s);
  ctx.restore();
}

async function firstSupported(list, Klass){
  for (const [cfg, mux] of list) {
    try { const r = await Klass.isConfigSupported(cfg); if (r.supported) return [cfg, mux]; } catch(e){}
  }
  return [null, null];
}

function trim(arr, isVideo){
  const limit = performance.now() - KEEP*1000;
  while (arr.length && arr[0].w < limit) arr.shift();
  if (isVideo) while (arr.length && arr[0].c.type !== 'key') arr.shift();
}

async function pump(track, onItem){
  const reader = new MediaStreamTrackProcessor({track}).readable.getReader();
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    onItem(value);
  }
}

async function startRecording(stream){
  const vt = stream.getVideoTracks()[0], at = stream.getAudioTracks()[0];
  const st = vt.getSettings();
  size = { width: (st.width || 1280) & ~1, height: (st.height || 720) & ~1 };
  const base = { ...size, bitrate: 4_000_000, framerate: 30, latencyMode: 'realtime' };
  let vCfg;
  [vCfg, vMux] = await firstSupported([
    [{...base, codec: 'avc1.42001f', avc: {format: 'avc'}}, 'avc'],
    [{...base, codec: 'avc1.4d401f', avc: {format: 'avc'}}, 'avc'],
    [{...base, codec: 'vp09.00.31.08'}, 'vp9'],
    [{...base, codec: 'av01.0.04M.08'}, 'av1'],
  ], VideoEncoder);
  if (!vCfg) throw new Error('codec');

  vEnc = new VideoEncoder({
    output: (c, meta) => { if (meta && meta.decoderConfig) vMeta = meta; vChunks.push({c, w: performance.now()}); trim(vChunks, true); },
    error: e => console.error(e)
  });
  vEnc.configure(vCfg);
  const cv = $('view'); cv.width = size.width; cv.height = size.height;
  const ctx = cv.getContext('2d');
  let lastKey = -Infinity;
  pump(vt, frame => {
    ctx.drawImage(frame, 0, 0, size.width, size.height);
    drawOverlay(ctx, size.width, size.height, new Date());
    const ts = frame.timestamp; frame.close();
    if (vEnc.encodeQueueSize > 3) return;   // si el PC va lento, salta un fotograma
    const vf = new VideoFrame(cv, {timestamp: ts});
    const keyFrame = ts - lastKey >= KEY_EVERY;
    if (keyFrame) lastKey = ts;
    vEnc.encode(vf, {keyFrame});
    vf.close();
  });

  if (at) {
    const as = at.getSettings();
    const ab = { sampleRate: as.sampleRate || 48000, numberOfChannels: Math.min(as.channelCount || 1, 2), bitrate: 128000 };
    let aCfg;
    [aCfg, aMux] = await firstSupported([[{...ab, codec: 'mp4a.40.2'}, 'aac'], [{...ab, codec: 'opus'}, 'opus']], AudioEncoder);
    if (aCfg) {
      aInfo = ab;
      aEnc = new AudioEncoder({
        output: (c, meta) => { if (meta && meta.decoderConfig) aMeta = meta; aChunks.push({c, w: performance.now()}); trim(aChunks, false); },
        error: e => { console.error(e); aEnc = null; }
      });
      aEnc.configure(aCfg);
      pump(at, data => { if (aEnc) aEnc.encode(data); data.close(); });
    }
  }
  setInterval(meter, 500); meter();
}

function meter(){
  const have = vChunks.length ? (performance.now() - vChunks[0].w)/1000 : 0;
  const ready = Math.min(CLIP, have);
  $('fill').style.width = (ready/CLIP*100) + '%';
  $('mlbl').textContent = ready >= CLIP - 0.5 ? 'Listo: se guardarán 50 s' : `Llenando memoria… ${Math.floor(ready)} de ${CLIP} s`;
}

// El navegador no siempre dice cuánto dura cada trozo: se calcula con el siguiente.
function feed(list, add, meta, fallback){
  let last = fallback;
  list.forEach((x, j) => {
    const c = x.c, next = list[j+1];
    let du = c.duration || (next ? next.c.timestamp - c.timestamp : last);
    if (!(du > 0)) du = last;
    last = du;
    const data = new Uint8Array(c.byteLength); c.copyTo(data);
    add(data, c.type, c.timestamp, du, j === 0 ? meta : undefined);
  });
}

function save(){
  if (!vChunks.length || !vMeta) return;
  const target = performance.now() - CLIP*1000;
  // último fotograma clave antes de "hace 30 s" (o el primero que haya)
  let i = -1;
  for (let k = 0; k < vChunks.length; k++) {
    if (vChunks[k].c.type !== 'key') continue;
    if (vChunks[k].w <= target) i = k; else { if (i < 0) i = k; break; }
  }
  const vs = vChunks.slice(i);
  const as = aEnc && aMeta ? aChunks.filter(x => x.w >= vs[0].w) : [];
  try {
    const out = new Mp4Muxer.ArrayBufferTarget();
    const mux = new Mp4Muxer.Muxer({
      target: out,
      video: { codec: vMux, width: size.width, height: size.height },
      audio: as.length ? { codec: aMux, sampleRate: aInfo.sampleRate, numberOfChannels: aInfo.numberOfChannels } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset'
    });
    feed(vs, (d, t, ts, du, m) => mux.addVideoChunkRaw(d, t, ts, du, m), vMeta, 33333);
    feed(as, (d, t, ts, du, m) => mux.addAudioChunkRaw(d, t, ts, du, m), aMeta, 20000);
    mux.finalize();
    const secs = (vs[vs.length-1].c.timestamp - vs[0].c.timestamp) / 1e6;
    addClip(new Blob([out.buffer], {type: 'video/mp4'}), secs);
    toast(secs < CLIP - 1 ? `Guardado (solo había ${Math.round(secs)} s)` : '¡Puntazo guardado!');
  } catch (e) {
    console.error(e); toast('No se pudo guardar el clip');
  }
}

$('start').onclick = async () => {
  if (!window.VideoEncoder || !window.MediaStreamTrackProcessor || !window.Mp4Muxer) {
    $('camErr').textContent = 'Este navegador no sirve para esto. Abre el archivo con Chrome o Edge.'; return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: {width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}}, audio: true });
  } catch (e) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: {width:{ideal:1280}, height:{ideal:720}} }); }
    catch (e2) { $('camErr').textContent = 'No pude abrir la cámara. Dale permiso en el navegador (icono de la cámara junto a la dirección) y vuelve a probar.'; return; }
  }
  try { await document.fonts.load(`800 30px 'Barlow Condensed'`); await document.fonts.load(`italic 800 30px 'Barlow Condensed'`); } catch(e){}
  try { await startRecording(stream); }
  catch (e) { $('camErr').textContent = 'Tu navegador no puede comprimir vídeo. Prueba con Chrome o Edge actualizados.'; return; }
  $('startBox').style.display = 'none';
  $('live').classList.remove('off'); $('liveTxt').textContent = 'EN VIVO';
  $('save').disabled = false;
};

$('save').onclick = () => { save(); $('save').blur(); };
const typing = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !typing(e)) { e.preventDefault(); if (!e.repeat && !$('save').disabled) save(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideQR(); });
document.addEventListener('keyup', e => { if (e.code === 'Space' && !typing(e)) e.preventDefault(); });

let tt;
function toast(t){ const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2600); }

// ---------- Clips guardados en este navegador (IndexedDB) ----------
let db = null;
function openDB(){
  return new Promise(res => {
    try {
      const q = indexedDB.open('puntazo', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('clips', {keyPath: 'id'});
      q.onsuccess = () => res(q.result); q.onerror = () => res(null);
    } catch(e) { res(null); }
  });
}
const store = mode => db.transaction('clips', mode).objectStore('clips');

function addClip(blob, secs){
  const c = { id: Date.now(), date: new Date(), secs: Math.round(secs), blob };
  clips.unshift(c);
  if (db) try { store('readwrite').put(c); } catch(e){}
  render();
  if (SERVER) upload(c);
}

// ---------- Compartir por QR (solo si se abrió con "Iniciar Puntazo") ----------
const SERVER = location.protocol === 'http:' || location.protocol === 'https:';
$('mode').textContent = SERVER
  ? 'Los clips se comparten por QR con los móviles conectados a la misma WiFi.'
  : 'Para descargar clips en el móvil con un QR, abre Puntazo con "Iniciar Puntazo".';

async function upload(c){
  try {
    const r = await fetch('/api/clips', { method: 'POST', headers: {'Content-Type': 'video/mp4'}, body: c.blob });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    c.remote = j.url;
    if (db && clips.includes(c)) try { store('readwrite').put({id: c.id, date: c.date, secs: c.secs, blob: c.blob, remote: c.remote}); } catch(e){}
    render();
    showQR(j.url);
  } catch (e) {
    console.error(e); toast('No se pudo preparar el QR');
  }
}

let qrTimer = null;
function showQR(url){
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const img = new Image(); img.alt = 'Código QR para descargar el clip'; img.src = q.createDataURL(8, 2);
  $('qrCode').replaceChildren(img);
  $('qrUrl').textContent = url;
  $('qr').classList.add('show');
  let left = 30;
  clearInterval(qrTimer);
  const upd = () => { $('qrCount').textContent = `Se cierra solo en ${left} s`; if (left-- <= 0) hideQR(); };
  upd(); qrTimer = setInterval(upd, 1000);
}
function hideQR(){ clearInterval(qrTimer); $('qr').classList.remove('show'); }
$('qrClose').onclick = hideQR;
$('qr').addEventListener('click', e => { if (e.target === $('qr')) hideQR(); });
function delClip(id){
  const c = clips.find(x => x.id === id);
  if (c && c.url) URL.revokeObjectURL(c.url);
  clips = clips.filter(x => x.id !== id);
  if (db) try { store('readwrite').delete(id); } catch(e){}
  render();
}
function fileName(c){
  const d = new Date(c.date), ext = (c.blob.type || '').includes('mp4') ? 'mp4' : 'webm';
  return `puntazo_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${ext}`;
}
function render(){
  const box = $('clips');
  $('count').textContent = clips.length ? `${clips.length} guardado${clips.length>1?'s':''}` : '';
  if (!clips.length) { box.innerHTML = '<div class="empty">Aún no hay clips. Pulsa ¡Puntazo! cuando pase algo bueno.</div>'; return; }
  box.innerHTML = '';
  clips.forEach((c, idx) => {
    if (!c.url) c.url = URL.createObjectURL(c.blob);
    const el = document.createElement('div'); el.className = 'clip';
    const v = document.createElement('video'); v.controls = true; v.preload = 'metadata'; v.src = c.url;
    const b = document.createElement('div'); b.className = 'body';
    const m = document.createElement('div'); m.className = 'meta';
    const d = new Date(c.date);
    const t = document.createElement('span'); t.className = 'num'; t.textContent = `Puntazo #${clips.length - idx}`;
    const s = document.createElement('span'); s.className = 'when'; s.textContent = `${hhmmss(d)} · ${c.secs} s`;
    m.append(t, s);
    const a = document.createElement('div'); a.className = 'acts';
    const dl = document.createElement('a'); dl.href = c.url; dl.download = fileName(c); dl.textContent = 'Descargar';
    const del = document.createElement('button'); del.textContent = 'Borrar'; del.onclick = () => delClip(c.id);
    a.append(dl);
    if (c.remote) { const qb = document.createElement('button'); qb.className = 'qrb'; qb.textContent = 'QR'; qb.onclick = () => showQR(c.remote); a.append(qb); }
    a.append(del); b.append(m, a); el.append(v, b); box.append(el);
  });
}
render();
openDB().then(d => {
  db = d; if (!db) return;
  const q = store('readonly').getAll();
  q.onsuccess = () => { clips = q.result.sort((a,b) => b.id - a.id); render(); };
});
}
</script>
