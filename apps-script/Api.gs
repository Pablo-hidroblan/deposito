/**
 * API del sistema Depósito Hidroblan (Google Apps Script).
 *
 * La aplicación web (carpeta web/) llama a esta API con POST y cuerpo JSON
 * en texto plano: {a: acción, s: sesión, ...}. Responde {ok:true,...} o
 * {ok:false, code, msg}.
 *
 * Datos: una planilla de Google ("Base de datos") con una hoja por colección.
 * Cada fila guarda un registro completo en JSON. La hoja _cambios lleva el
 * registro de cambios que usan los dispositivos para sincronizarse.
 */

var HEAD = ['clave', 'padre', 'id', 'version', 'actualizado', 'por', 'json', 'json2', 'json3', 'json4'];
var LOG_HEAD = ['seq', 'fecha', 'coleccion', 'id', 'version', 'borrado', 'por', 'json', 'json2', 'json3', 'json4'];
var CHUNK = 45000;
var RANK = { consulta: 0, deposito: 1, admin: 2 };

/* ---------------- entrada ---------------- */

function doGet() {
  return ContentService.createTextOutput('API Depósito Hidroblan: funcionando.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = handle_(req);
  } catch (err) {
    out = err && err.code ? { ok: false, code: err.code, msg: err.message } : { ok: false, code: 'internal', msg: String(err && err.message || err) };
    if (!(err && err.code)) console.error(err && err.stack || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, msg) { var e = new Error(msg || code); e.code = code; throw e; }

function handle_(req) {
  var a = req.a;
  if (a === 'ping') return { ok: true, t: new Date().toISOString() };
  if (a === 'login') return login_(req.idToken);
  var u = auth_(req.s);
  switch (a) {
    case 'me': return { ok: true, user: u };
    case 'logout': cerrarSesion_(req.s); return { ok: true };
    case 'snapshot': return snapshot_();
    case 'sync': return sync_(+req.since || 0);
    case 'write': return { ok: true, seq: escribir_(req.ops || [], u, false) };
    case 'people': return { ok: true, people: personas_() };
    case 'upload': need_(u, 'deposito'); return subirArchivo_(req, u, false);
    case 'file': return leerArchivo_(req.id);
    case 'fileDelete': need_(u, 'deposito'); return borrarArchivo_(req.id);
    case 'fileList': return { ok: true, assets: listarArchivos_() };
    case 'archive': need_(u, 'deposito'); return archivar_(req, u);
    case 'import': need_(u, 'admin'); return { ok: true, seq: escribir_(req.ops || [], u, true) };
    case 'importFile': need_(u, 'admin'); return subirArchivo_(req, u, true);
    case 'importAlias': need_(u, 'admin'); guardarAlias_(req.pares || []); return { ok: true };
    case 'importReset': need_(u, 'admin'); if (req.confirm !== 'BORRAR TODO') fail_('invalid_argument', 'Falta confirmar.'); return borrarTodo_(u);
    case 'exportNow': need_(u, 'admin'); exportarDiario(); return { ok: true, url: carpeta_('raiz').getUrl() };
    case 'info': return { ok: true, carpeta: RANK[u.perfil] >= RANK.admin ? carpeta_('raiz').getUrl() : null, ultimaExportacion: prop_('ULTIMA_EXPORTACION') || null };
  }
  fail_('invalid_argument', 'Acción desconocida: ' + a);
}

/* ---------------- propiedades y planilla ---------------- */

function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k) { return props_().getProperty(k); }
function db_() {
  if (!db_.ss) {
    var id = prop_('DB_ID');
    if (!id) fail_('unavailable', 'El sistema todavía no está instalado. Ejecutá instalar() en Apps Script.');
    db_.ss = SpreadsheetApp.openById(id);
  }
  return db_.ss;
}

/* ruta de colección → hoja: "movimientos" → movimientos; "recuentos/ID/lineas" → recuentos__lineas (padre ID) */
function hojaDe_(coll) {
  var seg = String(coll || '').split('/');
  if (seg.length === 1 && seg[0]) return { nombre: seg[0], padre: '' };
  if (seg.length === 3) return { nombre: seg[0] + '__' + seg[2], padre: seg[1] };
  fail_('invalid_argument', 'Ruta inválida: ' + coll);
}
function collDe_(nombreHoja, padre) {
  var p = nombreHoja.split('__');
  return p.length === 2 ? p[0] + '/' + padre + '/' + p[1] : nombreHoja;
}
function hoja_(nombre, crear) {
  var ss = db_(), sh = ss.getSheetByName(nombre);
  if (!sh && crear) {
    sh = ss.insertSheet(nombre);
    var head = nombre === '_cambios' ? LOG_HEAD : HEAD;
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function partir_(s) { var r = []; for (var i = 0; i < s.length; i += CHUNK) r.push(s.slice(i, i + CHUNK)); if (r.length > 4) fail_('invalid_argument', 'El registro es demasiado grande.'); while (r.length < 4) r.push(''); return r; }
function unir_(row, from) { return String(row[from] || '') + String(row[from + 1] || '') + String(row[from + 2] || '') + String(row[from + 3] || ''); }
function buscarFila_(sh, clave) {
  if (sh.getLastRow() < 2) return 0;
  var r = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(clave).matchCase(true).matchEntireCell(true).findNext();
  return r ? r.getRow() : 0;
}

/* ---------------- lectura ---------------- */

function snapshot_() {
  var seq = +prop_('SEQ') || 0;
  var docs = [];
  db_().getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n.charAt(0) === '_' || sh.getLastRow() < 2) return;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
    vals.forEach(function (r) {
      if (!r[0]) return;
      var d; try { d = JSON.parse(unir_(r, 6)); } catch (e) { return; }
      docs.push({ p: collDe_(n, String(r[1] || '')), id: String(r[2]), v: +r[3] || 1, d: d });
    });
  });
  return { ok: true, seq: seq, docs: docs };
}

function sync_(since) {
  var seq = +prop_('SEQ') || 0;
  if (since >= seq) return { ok: true, seq: seq, changes: [] };
  var sh = hoja_('_cambios', true), last = sh.getLastRow();
  if (last < 2) return { ok: true, seq: seq, reset: true };
  var changes = [], row = last, done = false;
  while (row >= 2 && !done) {
    var from = Math.max(2, row - 199), vals = sh.getRange(from, 1, row - from + 1, LOG_HEAD.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var r = vals[i];
      if (+r[0] <= since) { done = true; break; }
      var d = null; if (!r[5]) { try { d = JSON.parse(unir_(r, 7)); } catch (e) { d = null; } }
      changes.push({ q: +r[0], p: String(r[2]), id: String(r[3]), v: +r[4] || 1, del: !!r[5], d: d });
    }
    row = from - 1;
  }
  if (!done && since > 0) return { ok: true, seq: seq, reset: true };   // el registro ya no llega tan atrás
  changes.reverse();
  return { ok: true, seq: seq, changes: changes };
}

/* ---------------- escritura ---------------- */

function permiso_(u, coll, id) {
  var raiz = String(coll).split('/')[0];
  if (raiz === 'perfiles' || raiz === 'config') return RANK[u.perfil] >= RANK.admin;
  if (raiz === 'usuarios') return id === u.id || RANK[u.perfil] >= RANK.admin;
  return RANK[u.perfil] >= RANK.deposito;
}

function escribir_(ops, u, esImport) {
  if (!ops.length) return +prop_('SEQ') || 0;
  if (ops.length > 500) fail_('invalid_argument', 'Demasiadas operaciones juntas.');
  if (!esImport) ops.forEach(function (o) { if (!permiso_(u, o.p, o.id)) fail_('invalid_argument', 'Tu perfil no permite modificar ' + o.p + '.'); });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) fail_('unavailable', 'La base está ocupada. Probá de nuevo.');
  try {
    var seq = +prop_('SEQ') || 0, now = new Date().toISOString(), log = [], hojas = {};
    ops.forEach(function (o) {
      if (!o.id || /[\/]/.test(o.id)) fail_('invalid_argument', 'Identificador inválido.');
      var h = hojaDe_(o.p), sh = hojas[h.nombre] || (hojas[h.nombre] = hoja_(h.nombre, true));
      var clave = h.padre ? h.padre + '/' + o.id : o.id, fila = buscarFila_(sh, clave);
      var prev = null, ver = 0;
      if (fila) { var r = sh.getRange(fila, 1, 1, HEAD.length).getValues()[0]; ver = +r[3] || 1; try { prev = JSON.parse(unir_(r, 6)); } catch (e) { prev = null; } }
      seq++;
      if (String(o.p) === 'perfiles') CacheService.getScriptCache().remove('perfiles');
      if (o.op === 'delete') {
        if (fila) sh.deleteRow(fila);
        log.push([seq, now, o.p, o.id, ver + 1, 1, u.id].concat(['', '', '', '']));
        return;
      }
      var data = o.d || {};
      if (o.op === 'update') data = fusionar_(prev || {}, data);
      else if (o.op !== 'set') fail_('invalid_argument', 'Operación inválida: ' + o.op);
      var json = JSON.stringify(data), partes = partir_(json);
      var fil = [clave, h.padre, o.id, ver + 1, now, u.id].concat(partes);
      if (fila) sh.getRange(fila, 1, 1, HEAD.length).setValues([fil]);
      else sh.appendRow(fil);
      log.push([seq, now, o.p, o.id, ver + 1, '', u.id].concat(partes));
    });
    var lg = hoja_('_cambios', true);
    lg.getRange(lg.getLastRow() + 1, 1, log.length, LOG_HEAD.length).setValues(log);
    props_().setProperty('SEQ', String(seq));
    return seq;
  } finally { lock.releaseLock(); }
}

/* update: une campos de primer nivel; {"__delete__":true} borra el campo */
function fusionar_(a, b) {
  var o = JSON.parse(JSON.stringify(a));
  Object.keys(b).forEach(function (k) {
    var v = b[k];
    if (v && typeof v === 'object' && v.__delete__ === true) delete o[k]; else o[k] = v;
  });
  return o;
}

function borrarTodo_(u) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) fail_('unavailable', 'La base está ocupada.');
  try {
    db_().getSheets().forEach(function (sh) {
      var n = sh.getName();
      if (n === '_cambios' || n.charAt(0) !== '_') { if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1); }
    });
    props_().setProperty('SEQ', String((+prop_('SEQ') || 0) + 1));
    CacheService.getScriptCache().remove('perfiles');
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------------- ingreso con Google ---------------- */

function verificarToken_(idToken) {
  if (!idToken) fail_('unauthenticated', 'Falta el ingreso con Google.');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail_('unauthenticated', 'No se pudo verificar la cuenta de Google.');
  var t = JSON.parse(res.getContentText());
  if (t.aud !== CONFIG.CLIENT_ID) fail_('unauthenticated', 'La aplicación no coincide con la configuración (CLIENT_ID).');
  if (String(t.email_verified) !== 'true') fail_('unauthenticated', 'La cuenta de Google no tiene el correo verificado.');
  if (+t.exp * 1000 < Date.now()) fail_('unauthenticated', 'El ingreso venció. Volvé a elegir la cuenta.');
  return { email: String(t.email).toLowerCase(), nombre: t.name || t.email, foto: t.picture || '' };
}

function perfilDe_(email) {
  if (email === String(prop_('OWNER_EMAIL') || '').toLowerCase()) return 'admin';
  var c = CacheService.getScriptCache(), raw = c.get('perfiles'), map;
  if (raw) map = JSON.parse(raw);
  else {
    map = {};
    var sh = db_().getSheetByName('perfiles');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues().forEach(function (r) {
      try { map[String(r[2]).toLowerCase()] = JSON.parse(unir_(r, 6)).perfil; } catch (e) { }
    });
    c.put('perfiles', JSON.stringify(map), 60);
  }
  return RANK[map[email]] != null ? map[email] : null;
}

function login_(idToken) {
  var g = verificarToken_(idToken), perfil = perfilDe_(g.email);
  if (!perfil) fail_('sin_acceso', 'La cuenta ' + g.email + ' no está habilitada. Pedile a un administrador que te agregue en Administración › Usuarios y permisos.');
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var vence = new Date(Date.now() + CONFIG.DIAS_SESION * 864e5).toISOString();
  var sh = hoja_('_sesiones', false) || crearHojaSimple_('_sesiones', ['token', 'email', 'nombre', 'foto', 'creada', 'vence']);
  sh.appendRow([token, g.email, g.nombre, g.foto, new Date().toISOString(), vence]);
  CacheService.getScriptCache().put('s:' + token, JSON.stringify({ email: g.email, nombre: g.nombre, foto: g.foto, vence: vence }), 21600);
  registrarPersona_(g);
  return { ok: true, session: token, user: { id: g.email, email: g.email, nombre: g.nombre, foto: g.foto, perfil: perfil, owner: g.email === String(prop_('OWNER_EMAIL') || '').toLowerCase() } };
}

function auth_(token) {
  if (!token) fail_('unauthenticated', 'Iniciá sesión.');
  var c = CacheService.getScriptCache(), raw = c.get('s:' + token), s = raw ? JSON.parse(raw) : null;
  if (!s) {
    var sh = hoja_('_sesiones', false), fila = sh ? buscarFila_(sh, token) : 0;
    if (!fila) fail_('unauthenticated', 'La sesión venció. Volvé a ingresar.');
    var r = sh.getRange(fila, 1, 1, 6).getValues()[0];
    s = { email: String(r[1]), nombre: String(r[2]), foto: String(r[3]), vence: String(r[5]) };
  }
  if (new Date(s.vence).getTime() < Date.now()) fail_('unauthenticated', 'La sesión venció. Volvé a ingresar.');
  c.put('s:' + token, JSON.stringify(s), 21600);
  var perfil = perfilDe_(s.email);
  if (!perfil) fail_('revoked', 'Tu cuenta ya no tiene acceso a la aplicación.');
  return { id: s.email, email: s.email, nombre: s.nombre, foto: s.foto, perfil: perfil, owner: s.email === String(prop_('OWNER_EMAIL') || '').toLowerCase() };
}

function cerrarSesion_(token) {
  CacheService.getScriptCache().remove('s:' + token);
  var sh = hoja_('_sesiones', false), fila = sh ? buscarFila_(sh, token) : 0;
  if (fila) sh.deleteRow(fila);
}

function crearHojaSimple_(nombre, head) {
  var sh = db_().insertSheet(nombre);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/* directorio de personas que ingresaron (para mostrar nombres) */
function registrarPersona_(g) {
  var sh = hoja_('_personas', false) || crearHojaSimple_('_personas', ['email', 'nombre', 'foto', 'primerIngreso', 'ultimoIngreso']);
  var fila = buscarFila_(sh, g.email), now = new Date().toISOString();
  if (fila) sh.getRange(fila, 2, 1, 4).setValues([[g.nombre, g.foto, sh.getRange(fila, 4).getValue() || now, now]]);
  else sh.appendRow([g.email, g.nombre, g.foto, now, now]);
}

function personas_() {
  var out = [];
  var sh = hoja_('_personas', false);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
    if (r[0]) out.push({ id: String(r[0]), name: String(r[1] || ''), avatarUrl: String(r[2] || ''), last: String(r[4] || '') });
  });
  var al = hoja_('_alias', false);   // identificadores de la planilla anterior (claude.ai) → email
  if (al && al.getLastRow() > 1) al.getRange(2, 1, al.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (!r[0]) return;
    var p = out.filter(function (x) { return x.id === String(r[1]).toLowerCase(); })[0];
    out.push({ id: String(r[0]), name: p ? p.name : String(r[1]), avatarUrl: p ? p.avatarUrl : '', alias: String(r[1]) });
  });
  return out;
}

function guardarAlias_(pares) {
  var sh = hoja_('_alias', false) || crearHojaSimple_('_alias', ['idAnterior', 'email']);
  pares.forEach(function (p) { if (!buscarFila_(sh, p[0])) sh.appendRow([p[0], String(p[1]).toLowerCase()]); });
}

function need_(u, nivel) { if (RANK[u.perfil] < RANK[nivel]) fail_('invalid_argument', 'Esta acción es para el perfil ' + nivel + '.'); }

/* ---------------- archivos (fotos y PDF) en Drive ---------------- */

function hojaArchivos_() { return hoja_('_archivos', false) || crearHojaSimple_('_archivos', ['id', 'driveId', 'nombre', 'tipo', 'tam', 'fecha', 'por', 'ubicacion']); }
function idNuevo_() { return Utilities.getUuid().replace(/-/g, ''); }

function subirArchivo_(req, u, esImport) {
  if (!req.b64) fail_('invalid_argument', 'Falta el archivo.');
  var tipo = String(req.type || 'application/octet-stream');
  if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(tipo)) fail_('unsupported_type', 'Tipo de archivo no admitido.');
  var bytes = Utilities.base64Decode(req.b64);
  if (bytes.length > 20 * 1024 * 1024) fail_('too_large', 'El archivo supera 20 MB.');
  var id = esImport && req.id ? String(req.id) : idNuevo_();
  var sh = hojaArchivos_();
  if (esImport && buscarFila_(sh, id)) return { ok: true, id: id, url: '/_blob/' + id, sizeBytes: bytes.length, contentType: tipo, existia: true };
  var ext = tipo === 'application/pdf' ? '.pdf' : '.' + tipo.split('/')[1].replace('jpeg', 'jpg');
  var nombre = String(req.name || ('archivo-' + id.slice(0, 8))).replace(/[\\\/]/g, '-');
  if (!/\.[a-z0-9]{2,4}$/i.test(nombre)) nombre += ext;
  var f = carpeta_('archivos').createFile(Utilities.newBlob(bytes, tipo, nombre));
  sh.appendRow([id, f.getId(), nombre, tipo, bytes.length, new Date().toISOString(), u.id, '']);
  return { ok: true, id: id, url: '/_blob/' + id, sizeBytes: bytes.length, contentType: tipo };
}

function driveIdDe_(id) {
  var sh = hojaArchivos_(), fila = buscarFila_(sh, String(id));
  return fila ? String(sh.getRange(fila, 2).getValue()) : null;
}

function leerArchivo_(id) {
  var did = driveIdDe_(id);
  if (!did) fail_('not_found', 'No se encontró el archivo.');
  var b = DriveApp.getFileById(did).getBlob();
  return { ok: true, type: b.getContentType(), name: b.getName(), b64: Utilities.base64Encode(b.getBytes()) };
}

function borrarArchivo_(id) {
  var sh = hojaArchivos_(), fila = buscarFila_(sh, String(id));
  if (!fila) return { ok: true, deleted: false };
  try { DriveApp.getFileById(String(sh.getRange(fila, 2).getValue())).setTrashed(true); } catch (e) { }
  sh.deleteRow(fila);
  return { ok: true, deleted: true };
}

function listarArchivos_() {
  var sh = hojaArchivos_(); if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map(function (r) {
    return { id: String(r[0]), url: '/_blob/' + r[0], sizeBytes: +r[4] || 0, contentType: String(r[3]), name: String(r[2]), createdAt: String(r[5]) };
  });
}

/* PDF de notas de pedido u otros comprobantes que la aplicación genera */
function archivar_(req, u) {
  var tipo = String(req.type || 'application/pdf'), nombre = String(req.name || 'documento.pdf').replace(/[\\\/]/g, '-');
  var dest = req.kind === 'np' ? subcarpeta_(carpeta_('pedidos'), 'PDF') : carpeta_('archivos');
  var it = dest.getFilesByName(nombre); while (it.hasNext()) it.next().setTrashed(true);
  var f = dest.createFile(Utilities.newBlob(Utilities.base64Decode(req.b64), tipo, nombre));
  return { ok: true, url: f.getUrl() };
}
