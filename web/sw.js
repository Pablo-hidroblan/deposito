/*
 * Service worker de Depósito Hidroblan.
 *  - Permite instalar la aplicación y abrirla sin conexión (última versión guardada).
 *  - Sirve las fotos y PDF guardados en Drive en la dirección /_blob/<id>,
 *    pidiéndolos a la API con la sesión del usuario y guardándolos en caché.
 * Al publicar cambios no hace falta tocar este archivo: la aplicación se
 * busca primero en la red y la caché queda solo como respaldo.
 */
const SHELL = 'dep-shell-v1', BLOBS = 'dep-blobs-v1';
const SHELL_FILES = ['./', 'index.html', 'shim.js', 'config.js', 'jsqr.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
let TOKEN = null, API = null;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES).catch(() => { })).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== BLOBS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data && e.data.t === 'token') { TOKEN = e.data.token; API = e.data.api; }
});

async function askToken() {
  if (TOKEN && API) return true;
  const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of cs) {
    const r = await new Promise(res => { const ch = new MessageChannel(); const t = setTimeout(() => res(null), 1500); ch.port1.onmessage = ev => { clearTimeout(t); res(ev.data); }; c.postMessage({ t: 'token?' }, [ch.port2]); });
    if (r && r.token && r.api) { TOKEN = r.token; API = r.api; return true; }
  }
  return false;
}

async function blob(req, id) {
  const cache = await caches.open(BLOBS), key = new Request(new URL('/_blob/' + id, self.location.origin).href);
  const hit = await cache.match(key);
  if (hit) return hit;
  if (!(await askToken())) return new Response('Iniciá sesión en la aplicación para ver este archivo.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    const r = await fetch(API, { method: 'POST', body: JSON.stringify({ a: 'file', s: TOKEN, id }) });
    const j = await r.json();
    if (!j.ok) return new Response(j.msg || 'No disponible', { status: j.code === 'not_found' ? 404 : 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const bin = Uint8Array.from(atob(j.b64), c => c.charCodeAt(0));
    const res = new Response(bin, { headers: { 'Content-Type': j.type || 'application/octet-stream', 'Content-Disposition': 'inline; filename="' + encodeURIComponent(j.name || id) + '"', 'Cache-Control': 'private, max-age=31536000, immutable' } });
    cache.put(key, res.clone());
    return res;
  } catch (e) {
    return new Response('Sin conexión.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  const m = /\/_blob\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  if (m) { e.respondWith(blob(e.request, m[1])); return; }
  // aplicación: primero la red (siempre la última versión), si no hay conexión la copia guardada
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(SHELL).then(ca => ca.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
