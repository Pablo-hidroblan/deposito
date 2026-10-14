/*
 * Adaptador Depósito Hidroblan ↔ Google (Apps Script).
 *
 * La aplicación (index.html) usa window.claude.use("db" | "user" | "assets" |
 * "downloads"), la misma interfaz que tenía en claude.ai. Este archivo la
 * implementa contra la API de Google Apps Script:
 *   - ingreso con la cuenta de Google (pantalla propia, sesión de 30 días)
 *   - base de datos en memoria + copia local, sincronizada cada pocos segundos
 *   - fotos y PDF en Google Drive (las sirve el service worker en /_blob/<id>)
 *   - descargas normales del navegador
 * Además expone window.DEP con utilidades para las pantallas de administración.
 */
(function () {
  'use strict';
  var CFG = window.DEP_CONFIG || {};
  var API = CFG.apiUrl;
  var LS_S = 'dep-sesion', LS_C = 'dep-cache:';
  var SESSION = null, USER = null;
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  /* ---------------- llamadas a la API ---------------- */
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  async function call(a, body, opts) {
    var payload = Object.assign({ a: a, s: SESSION }, body || {});
    var res;
    try { res = await fetch(API, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' }); }
    catch (e) { setOnline(false); throw err('unavailable', 'Sin respuesta del servidor (' + (e && e.message || e) + ').'); }
    if (!res.ok) { setOnline(false); throw err('unavailable', 'El servidor no respondió (' + res.status + ').'); }
    var txt = await res.text(), j; try { j = JSON.parse(txt); } catch (e) { throw err('unavailable', 'El servidor respondió algo que no es JSON: ' + txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)); }
    setOnline(true);
    if (!j.ok) {
      if ((j.code === 'unauthenticated' || j.code === 'revoked') && !(opts && opts.quiet)) onAuthLost(j);
      throw err(j.code || 'internal', j.msg);
    }
    return j;
  }

  /* ---------------- estado de conexión ---------------- */
  var ONLINE = true;
  function setOnline(v) {
    if (v === ONLINE) return; ONLINE = v;
    var b = document.getElementById('dep-offline');
    if (!b) { b = document.createElement('div'); b.id = 'dep-offline'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.textContent = v ? '' : 'Sin conexión: mostrando los últimos datos guardados. Los cambios se guardan al volver la conexión.';
    b.hidden = v;
  }

  /* ---------------- pantalla de ingreso ---------------- */
  var gate, gateMsg;
  function showGate(msg, bad) {
    if (!gate) {
      gate = document.createElement('div'); gate.id = 'dep-gate';
      gate.innerHTML = '<div class="dg-card"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>Depósito</h1><p class="dg-sub">Hidroblan · Control de stock</p>' +
        '<p class="dg-msg" id="dg-msg"></p><div id="dg-btn"></div><div id="dg-dev"></div><p class="dg-foot">Ingresá con la cuenta de Google que te habilitó un administrador.</p></div>';
      document.body.appendChild(gate);
      gateMsg = gate.querySelector('#dg-msg');
      renderGoogleButton();
    }
    gate.hidden = false;
    gateMsg.textContent = msg || '';
    gateMsg.className = 'dg-msg' + (bad ? ' bad' : '');
  }
  function hideGate() { if (gate) gate.hidden = true; }

  var GIS_READY = null;
  function loadGis() {
    if (GIS_READY) return GIS_READY;
    GIS_READY = new Promise(function (ok, ko) {
      if (window.google && google.accounts && google.accounts.id) return ok();
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { ok(); }; s.onerror = function () { ko(err('unavailable', 'No se pudo cargar el ingreso de Google.')); };
      document.head.appendChild(s);
    });
    return GIS_READY;
  }
  function renderGoogleButton() {
    if (CFG.dev) {   // solo pruebas locales: ingresar escribiendo un email
      var d = gate.querySelector('#dg-dev');
      d.innerHTML = '<input id="dg-email" type="email" placeholder="email de prueba"><button id="dg-go" class="btn primary">Ingresar (prueba)</button>';
      d.querySelector('#dg-go').onclick = function () { var e = d.querySelector('#dg-email').value.trim(); if (e) loginWith('test:' + e + ':' + e.split('@')[0]); };
      return;
    }
    loadGis().then(function () {
      google.accounts.id.initialize({ client_id: CFG.clientId, callback: function (r) { loginWith(r.credential); }, auto_select: true, itp_support: true, use_fedcm_for_prompt: true });
      google.accounts.id.renderButton(gate.querySelector('#dg-btn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es' });
      google.accounts.id.prompt();
    }, function (e) { showGate(e.message, true); });
  }

  var loginResolve;
  var LOGGED = new Promise(function (r) { loginResolve = r; });
  async function loginWith(idToken) {
    showGate('Verificando la cuenta…');
    try {
      var j = await call('login', { idToken: idToken }, { quiet: true });
      SESSION = j.session; USER = j.user;
      ls.set(LS_S, JSON.stringify({ s: SESSION, u: USER }));
      tellSW();
      if (authLost) { location.reload(); return; }   // se volvió a ingresar después de vencer la sesión
      hideGate();
      loginResolve();
    } catch (e) {
      showGate(e.code === 'sin_acceso' ? e.message : e.code === 'unavailable' ? 'No se pudo conectar con el servidor. Detalle: ' + e.message : (e.message || 'No se pudo ingresar.'), true);
      var dg = gate && gate.querySelector('.dg-foot'); if (dg && !dg.querySelector('a')) dg.insertAdjacentHTML('beforeend', ' <a href="diagnostico.html">Diagnóstico de conexión</a>');
    }
  }
  var authLost = false;
  function onAuthLost(j) {
    if (authLost) return; authLost = true;
    ls.del(LS_S);
    if (USER && j.code === 'revoked') { emitError({ code: 'revoked' }); }
    showGate(j.code === 'revoked' ? 'Tu cuenta ya no tiene acceso a la aplicación.' : 'La sesión venció. Volvé a ingresar con tu cuenta de Google.', true);
  }
  async function logout() {
    try { await call('logout', {}, { quiet: true }); } catch (e) { }
    ls.del(LS_S); if (USER) ls.del(LS_C + USER.id);
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { }
    location.reload();
  }

  async function ensureLogin() {
    var saved = null; try { saved = JSON.parse(ls.get(LS_S) || 'null'); } catch (e) { }
    if (saved && saved.s) {
      SESSION = saved.s; USER = saved.u;
      tellSW();
      // validar en segundo plano; si venció, aparece la pantalla de ingreso
      call('me').then(function (j) { USER = j.user; ls.set(LS_S, JSON.stringify({ s: SESSION, u: USER })); refreshUserUi(); }, function () { });
      return;
    }
    showGate('');
    await LOGGED;
  }

  /* ---------------- base de datos ---------------- */
  var C = new Map();           // ruta de colección → Map(id → {v, d})
  var SEQ = 0, LOADED = false, listeners = [], dirty = new Set(), notifyQueued = false;
  function coll(p) { var m = C.get(p); if (!m) { m = new Map(); C.set(p, m); } return m; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function applyDoc(p, id, v, d, del) {
    var m = coll(p), cur = m.get(id);
    if (cur && v && cur.v && v < cur.v) return;
    if (del) m.delete(id); else m.set(id, { v: v || ((cur && cur.v) || 0) + 1, d: d });
    markDirty(p);
  }
  function markDirty(p) {
    dirty.add(p);
    if (!notifyQueued) { notifyQueued = true; setTimeout(flushNotify, 0); }
    saveCacheSoon();
  }
  function flushNotify() {
    notifyQueued = false;
    var d = dirty; dirty = new Set();
    listeners.slice().forEach(function (l) { if (d.has(l.p)) fire(l); });
  }
  function snapOf(p, order) {
    var m = coll(p), arr = [];
    m.forEach(function (x, id) { arr.push({ id: id, exists: true, data: function () { return clone(x.d); }, ref: docRef(p, id) }); });
    if (order) {
      var f = order.f, desc = order.d === 'desc';
      arr.sort(function (a, b) {
        var x = m.get(a.id).d[f], y = m.get(b.id).d[f];
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1);
      });
    } else arr.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { docs: arr, size: arr.length, empty: !arr.length, forEach: function (fn) { arr.forEach(fn); }, docChanges: function () { return []; }, metadata: { fromCache: !ONLINE, hasPendingWrites: PENDING > 0 } };
  }
  function fire(l) {
    try {
      if (l.id != null) { var x = coll(l.p).get(l.id); l.fn({ id: l.id, exists: !!x, data: function () { return x ? clone(x.d) : undefined; }, ref: docRef(l.p, l.id) }); }
      else l.fn(snapOf(l.p, l.order));
    } catch (e) { console.error(e); }
  }
  function emitError(e) { listeners.forEach(function (l) { if (l.err) try { l.err(e); } catch (x) { } }); }

  function splitPath(path) {
    var s = String(path).split('/');
    if (s.length % 2 !== 0) throw err('invalid_argument', 'Ruta de documento inválida: ' + path);
    return { p: s.slice(0, -1).join('/'), id: s[s.length - 1] };
  }
  function newId() { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = ''; var r = crypto.getRandomValues(new Uint8Array(20)); for (var i = 0; i < 20; i++) s += a[r[i] % a.length]; return s; }

  function merge(a, b) {
    var o = clone(a || {});
    Object.keys(b).forEach(function (k) { var v = b[k]; if (v && typeof v === 'object' && v.__delete__ === true) delete o[k]; else o[k] = v; });
    return o;
  }

  /* las escrituras se aplican al instante en pantalla y se envían en orden */
  var PENDING = 0, chain = Promise.resolve();
  function write(op, p, id, data) {
    data = data === undefined ? undefined : clone(data);
    var m = coll(p), prev = m.get(id);
    if (op === 'delete') applyDoc(p, id, 0, null, true);
    else if (op === 'update') { if (!prev) return Promise.reject(err('not_found', 'El registro no existe.')); applyDoc(p, id, 0, merge(prev.d, data)); }
    else applyDoc(p, id, 0, data);
    PENDING++;
    var job = chain.then(function () { return send([{ op: op, p: p, id: id, d: data }]); });
    chain = job.catch(function () { });
    return job.then(function (j) { PENDING--; pollSoon(); return undefined; }, function (e) {
      PENDING--;
      if (prev) m.set(id, prev); else m.delete(id);   // deshacer en pantalla
      markDirty(p);
      throw e;
    });
  }
  async function send(ops) {
    var last;
    for (var i = 0; i < 4; i++) {
      try { var j = await call('write', { ops: ops }); return j; }
      catch (e) { last = e; if (e.code !== 'unavailable') throw e; await new Promise(function (r) { setTimeout(r, 1500 * (i + 1)); }); }
    }
    throw last;
  }

  function docRef(p, id) {
    var path = p + '/' + id;
    return {
      id: id, path: path,
      get: async function () { await READY; var x = coll(p).get(id); return { id: id, exists: !!x, data: function () { return x ? clone(x.d) : undefined; }, ref: this }; },
      set: function (d) { return write('set', p, id, d); },
      update: function (d) { return write('update', p, id, d); },
      delete: function () { return write('delete', p, id); },
      collection: function (sub) { return collRef(path + '/' + sub); },
      onSnapshot: function (fn, e) { var l = { p: p, id: id, fn: fn, err: e }; listeners.push(l); READY.then(function () { fire(l); }); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; }
    };
  }
  function collRef(p, order) {
    var q = {
      path: p,
      doc: function (id) { return docRef(p, id || newId()); },
      add: async function (d) { var r = docRef(p, newId()); await r.set(d); return r; },
      orderBy: function (f, d) { return collRef(p, { f: f, d: d || 'asc' }); },
      where: function () { throw err('invalid_argument', 'where() no está disponible en esta versión.'); },
      limit: function () { return q; },
      get: async function () { await READY; return snapOf(p, order); },
      onSnapshot: function (fn, e) { var l = { p: p, order: order, fn: fn, err: e }; listeners.push(l); READY.then(function () { fire(l); }); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; }
    };
    return q;
  }
  var DB = { doc: function (path) { var s = splitPath(path); return docRef(s.p, s.id); }, collection: function (p) { return collRef(p); } };

  /* carga inicial: primero la copia local (instantánea), después el servidor */
  var readyResolve; var READY = new Promise(function (r) { readyResolve = r; });
  function loadFrom(docs) { C = new Map(); docs.forEach(function (x) { coll(x.p).set(x.id, { v: x.v, d: x.d }); }); C.forEach(function (_, p) { dirty.add(p); }); listeners.forEach(function (l) { dirty.add(l.p); }); markDirty('__'); }
  async function fullLoad() { var j = await call('snapshot'); loadFrom(j.docs); SEQ = j.seq; LOADED = true; }
  var saveT = null;
  function saveCacheSoon() {
    if (!USER || saveT) return;
    saveT = setTimeout(function () {
      saveT = null; var docs = [];
      C.forEach(function (m, p) { m.forEach(function (x, id) { docs.push({ p: p, id: id, v: x.v, d: x.d }); }); });
      ls.set(LS_C + USER.id, JSON.stringify({ seq: SEQ, docs: docs, t: Date.now() }));
    }, 3000);
  }
  async function initData() {
    var cached = null; try { cached = JSON.parse(ls.get(LS_C + USER.id) || 'null'); } catch (e) { }
    if (cached && cached.docs) { loadFrom(cached.docs); SEQ = cached.seq || 0; LOADED = true; readyResolve(); poll(); return; }
    await fullLoad(); readyResolve(); schedule();
  }

  /* sincronización: trae lo que cargaron otros dispositivos */
  var pollT = null, polling = false;
  function schedule(ms) { clearTimeout(pollT); pollT = setTimeout(poll, ms || (document.hidden ? 60000 : (CFG.syncMs || 15000))); }
  function pollSoon() { schedule(1200); }
  async function poll() {
    if (polling) return schedule(); polling = true;
    try {
      var j = await call('sync', { since: SEQ });
      if (j.reset) await fullLoad();
      else { (j.changes || []).forEach(function (c) { applyDoc(c.p, c.id, c.v, c.d, c.del); }); SEQ = j.seq; if ((j.changes || []).length) saveCacheSoon(); }
    } catch (e) { /* sin conexión: se reintenta */ }
    polling = false; schedule();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && SESSION) schedule(200); });
  window.addEventListener('online', function () { if (SESSION) schedule(200); });

  /* ---------------- personas ---------------- */
  var PEOPLE = {}, peopleAt = 0;
  var AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#c9d4dd"/><circle cx="12" cy="9.5" r="4" fill="#fff"/><path d="M4.5 20a8 8 0 0115 0" fill="#fff"/></svg>');
  async function people(force) {
    if (!force && Date.now() - peopleAt < 300000) return PEOPLE;
    try { var j = await call('people'); PEOPLE = {}; j.people.forEach(function (p) { PEOPLE[p.id] = p; }); peopleAt = Date.now(); } catch (e) { }
    return PEOPLE;
  }
  var USERNS = {
    id: async function () { return USER.id; },
    isOwner: async function () { return !!USER.owner; },
    canEdit: async function () { return USER.perfil === 'admin'; },
    can: async function (n) { return n === 'data.write' ? USER.perfil !== 'consulta' : null; },
    me: async function () { return { id: USER.id, name: USER.nombre, avatarUrl: USER.foto || AVATAR, guest: false }; },
    profiles: async function (ids) {
      var P = await people(), out = {};
      [].concat(ids || []).forEach(function (id) {
        var p = P[id];
        out[id] = { id: id, name: p ? (p.name || p.alias || id) : (id === USER.id ? USER.nombre : /@/.test(id) ? id : ''), avatarUrl: (p && p.avatarUrl) || AVATAR, guest: false };
      });
      return out;
    },
    search: async function (q) {
      q = String(q || '').trim().toLowerCase();
      var P = await people(true), hits = [];
      Object.keys(P).forEach(function (id) { var p = P[id]; if (!/@/.test(id)) return; if (!q || id.indexOf(q) >= 0 || String(p.name || '').toLowerCase().indexOf(q) >= 0) hits.push({ id: id, name: p.name || id, avatarUrl: p.avatarUrl || AVATAR }); });
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && !P[q]) hits.unshift({ id: q, name: q, avatarUrl: AVATAR });
      return hits.slice(0, 20);
    }
  };

  /* ---------------- archivos ---------------- */
  function b64(blob) { return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = function () { ko(err('internal', 'No se pudo leer el archivo.')); }; r.readAsDataURL(blob); }); }
  var ASSETS = {
    upload: async function (blob, o) {
      var type = (o && o.type) || blob.type || 'application/octet-stream';
      var j = await call('upload', { name: (o && o.name) || blob.name || '', type: type, b64: await b64(blob) });
      return { id: j.id, url: j.url, sizeBytes: j.sizeBytes, contentType: j.contentType };
    },
    delete: async function (id) { var j = await call('fileDelete', { id: id }); return { deleted: !!j.deleted }; },
    list: async function () { var j = await call('fileList'); return { assets: j.assets, usage: { count: j.assets.length } }; }
  };

  /* ---------------- descargas ---------------- */
  var DOWNLOADS = {
    save: async function (o) {
      var data = o.data instanceof Blob ? o.data : new Blob([o.data], { type: /\.csv$/i.test(o.filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      var u = URL.createObjectURL(data), a = document.createElement('a');
      a.href = u; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
      // las notas de pedido también quedan guardadas en Drive (08 Notas de pedido/PDF)
      if (/^Nota de pedido .*\.pdf$/i.test(o.filename) && USER && USER.perfil !== 'consulta')
        b64(data).then(function (x) { return call('archive', { kind: 'np', name: o.filename, type: 'application/pdf', b64: x }); }).catch(function () { });
      return { status: 'saved' };
    }
  };

  /* ---------------- service worker (instalación y archivos) ---------------- */
  function tellSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (r) { if (r.active) r.active.postMessage({ t: 'token', token: SESSION, api: API }); });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW', e); });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.t === 'token?' && e.ports && e.ports[0]) e.ports[0].postMessage({ token: SESSION, api: API });
    });
  }
  // si una imagen /_blob/ falla antes de que el service worker tome control, se reintenta
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG' || !/\/_blob\//.test(el.src) || el.dataset.depRetry) return;
    el.dataset.depRetry = '1';
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function () { setTimeout(function () { el.src = el.src.split('?')[0] + '?r=' + Date.now(); }, 400); });
  }, true);

  /* ---------------- usuario en la barra superior ---------------- */
  function refreshUserUi() {
    var top = document.querySelector('.top-in'); if (!top || !USER) return;
    var b = document.getElementById('dep-user');
    if (!b) {
      b = document.createElement('div'); b.id = 'dep-user';
      b.innerHTML = '<button type="button" class="btn ghost" id="dep-user-btn" aria-haspopup="true" aria-expanded="false"></button><div id="dep-user-pop" hidden></div>';
      top.appendChild(b);
      var btn = b.querySelector('#dep-user-btn'), pop = b.querySelector('#dep-user-pop');
      btn.onclick = function () { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); };
      document.addEventListener('click', function (e) { if (!b.contains(e.target)) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    }
    var ini = (USER.nombre || USER.email || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    b.querySelector('#dep-user-btn').innerHTML = USER.foto ? '<img src="' + USER.foto.replace(/"/g, '') + '" alt="" referrerpolicy="no-referrer">' : '<span class="dep-ini">' + ini + '</span>';
    b.querySelector('#dep-user-btn').title = USER.nombre + ' · ' + USER.email;
    var pop = b.querySelector('#dep-user-pop');
    pop.innerHTML = '<b></b><span class="meta"></span><button type="button" class="btn" id="dep-logout">Cerrar sesión</button>';
    pop.querySelector('b').textContent = USER.nombre || USER.email;
    pop.querySelector('.meta').textContent = USER.email;
    pop.querySelector('#dep-logout').onclick = logout;
  }

  /* ---------------- window.claude.use ---------------- */
  var BOOT = (async function () {
    if (!API) { document.addEventListener('DOMContentLoaded', function () { showGate('Falta configurar la dirección del servidor (web/config.js).', true); }); throw err('unavailable'); }
    if (document.readyState === 'loading') await new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); });
    await ensureLogin();
    refreshUserUi();
    await initData();
    people();
  })();
  BOOT.catch(function (e) { console.error(e); if (e && e.code === 'unavailable' && API) showGate('No se pudo conectar con el servidor. Revisá la conexión y recargá la página.', true); });

  window.claude = {
    use: async function (name) {
      try { await BOOT; } catch (e) { return null; }
      if (name === 'db') return DB;
      if (name === 'user') return USERNS;
      if (name === 'assets') return USER.perfil === 'consulta' ? null : ASSETS;
      if (name === 'downloads') return DOWNLOADS;
      return null;
    }
  };

  window.DEP = {
    call: call,
    user: function () { return USER; },
    resync: async function () { await fullLoad(); },
    logout: logout,
    pending: function () { return PENDING; }
  };
})();
