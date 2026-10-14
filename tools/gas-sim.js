/*
 * Simulador local de Google Apps Script (solo para pruebas de desarrollo).
 * Carga los .gs de apps-script/ con versiones en memoria de SpreadsheetApp,
 * DriveApp, CacheService, etc., y expone doPost como servidor HTTP:
 *
 *   node tools/gas-sim.js [puerto]        → http://localhost:8790/exec
 *
 * Ingreso de prueba: idToken "test:<email>:<nombre>".
 * GET /__drive devuelve el árbol de carpetas simulado (para revisar exportaciones).
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), crypto = require('crypto');

function makeEnv(opts = {}) {
  let uid = 0; const nid = p => p + (++uid).toString(36) + crypto.randomBytes(4).toString('hex');
  /* ---------- Drive ---------- */
  const items = new Map();
  class Blob {
    constructor(bytes, type, name) { this.bytes = Buffer.from(bytes || []); this.type = type || 'application/octet-stream'; this.name = name || ''; }
    getBytes() { return [...this.bytes].map(b => b > 127 ? b - 256 : b); } getContentType() { return this.type; } getName() { return this.name; }
    setName(n) { this.name = n; return this; } getDataAsString() { return this.bytes.toString('utf8'); }
  }
  const toBuf = b => Buffer.from((Array.isArray(b) ? b : [...b]).map(x => x & 255));
  class DFile {
    constructor(name, mime, parent, blob) { this.id = nid('f'); this.name = name; this.mime = mime; this.parent = parent; this.trashed = false; this.blob = blob; items.set(this.id, this); }
    getId() { return this.id; } getName() { return this.name; } setName(n) { this.name = n; if (this.ss) this.ss.name = n; return this; } getMimeType() { return this.mime; }
    isTrashed() { return this.trashed; } setTrashed(t) { this.trashed = t; return this; } moveTo(f) { this.parent = f.id; return this; }
    getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; } getBlob() { return new Blob(this.blob ? this.blob.bytes : [], this.blob ? this.blob.type : this.mime, this.name); }
    getParents() { const p = [items.get(this.parent)]; return iter(p); } getSize() { return this.blob ? this.blob.bytes.length : 0; }
  }
  class DFolder {
    constructor(name, parent) { this.id = nid('d'); this.name = name; this.parent = parent; this.trashed = false; items.set(this.id, this); }
    getId() { return this.id; } getName() { return this.name; } isTrashed() { return this.trashed; } setTrashed(t) { this.trashed = t; return this; }
    getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
    kids() { return [...items.values()].filter(x => x.parent === this.id && !x.trashed); }
    getFoldersByName(n) { return iter(this.kids().filter(x => x instanceof DFolder && x.name === n)); }
    getFilesByName(n) { return iter(this.kids().filter(x => x instanceof DFile && x.name === n)); }
    getFiles() { return iter(this.kids().filter(x => x instanceof DFile)); }
    createFolder(n) { return new DFolder(n, this.id); }
    createFile(blob) { return new DFile(blob.getName(), blob.getContentType(), this.id, blob); }
  }
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const root = new DFolder('Mi unidad', null);
  const DriveApp = {
    getRootFolder: () => root, createFolder: n => root.createFolder(n),
    getFolderById: id => { const f = items.get(id); if (!(f instanceof DFolder)) throw new Error('No folder ' + id); return f; },
    getFileById: id => { const f = items.get(id); if (!(f instanceof DFile)) throw new Error('No file ' + id); return f; }
  };
  /* ---------- Sheets ---------- */
  const books = new Map();
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; const a = []; for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; a.push(v === undefined || v === null ? '' : v); } o.push(a); } return o; }
    setValues(v) { if (v.length !== this.nr || v.some(r => r.length !== this.nc)) throw new Error(`setValues: tamaño ${v.length}x${v[0] && v[0].length} ≠ ${this.nr}x${this.nc}`); v.forEach((row, i) => { const R = this.sh.rows[this.r - 1 + i] || (this.sh.rows[this.r - 1 + i] = []); row.forEach((x, j) => { if (typeof x === 'string' && x.length > 50000) throw new Error('celda > 50000'); R[this.c - 1 + j] = x; }); }); return this; }
    getValue() { return this.getValues()[0][0]; } setValue(x) { return this.setValues([[x]]); } getRow() { return this.r; }
    setFontWeight() { return this; } setBackground() { return this; } setNumberFormat() { return this; } createFilter() { this.sh.filter = { remove: () => { this.sh.filter = null; } }; return this.sh.filter; }
    createTextFinder(q) { const self = this; return { matchCase() { return this; }, matchEntireCell() { return this; }, findNext() { for (let i = 0; i < self.nr; i++) for (let j = 0; j < self.nc; j++) { const row = self.sh.rows[self.r - 1 + i] || []; if (String(row[self.c - 1 + j]) === String(q)) return new Range(self.sh, self.r + i, self.c + j, 1, 1); } return null; } }; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; this.filter = null; }
    getName() { return this.name; } getLastRow() { let n = this.rows.length; while (n && !(this.rows[n - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) n--; return n; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    appendRow(a) { this.rows[this.getLastRow()] = a.slice(); return this; }
    deleteRow(r) { this.rows.splice(r - 1, 1); } deleteRows(r, n) { this.rows.splice(r - 1, n); }
    clear() { this.rows = []; return this; } getFilter() { return this.filter; } setFrozenRows() { } setColumnWidth() { }
  }
  class SS {
    constructor(name) { this.file = new DFile(name, 'application/vnd.google-apps.spreadsheet', root.id); this.file.ss = this; this.name = name; this.sheets = [new Sheet('Hoja 1')]; books.set(this.file.id, this); }
    getId() { return this.file.id; } getName() { return this.name; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.file.id; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; } getSheets() { return this.sheets.slice(); }
    insertSheet(n) { if (this.getSheetByName(n)) throw new Error('dup sheet ' + n); const s = new Sheet(n); this.sheets.push(s); return s; }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  }
  const SpreadsheetApp = { create: n => new SS(n), openById: id => { const b = books.get(id); if (!b) throw new Error('No ss ' + id); return b; }, flush() { } };
  /* ---------- otros servicios ---------- */
  const store = {}, cache = new Map();
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); }, getProperties: () => ({ ...store }) }) };
  const CacheService = { getScriptCache: () => ({ get: k => { const e = cache.get(k); return e && e.t > Date.now() ? e.v : null; }, put: (k, v, s) => { if (String(v).length > 100000) throw new Error('cache > 100KB'); cache.set(k, { v: String(v), t: Date.now() + (s || 600) * 1000 }); }, remove: k => cache.delete(k) }) };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock() { }, releaseLock() { } }) };
  const fmt = (d, tz, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {}); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace(/\bd\b/, String(+p.day)); };
  const Utilities = {
    getUuid: () => crypto.randomUUID(), base64Decode: s => [...Buffer.from(s, 'base64')].map(b => b > 127 ? b - 256 : b),
    base64Encode: b => toBuf(b).toString('base64'), newBlob: (b, t, n) => new Blob(toBuf(b), t, n), formatDate: fmt
  };
  const triggers = [];
  const ScriptApp = { getOAuthToken: () => 'tok', getProjectTriggers: () => triggers.slice(), deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
    newTrigger: fn => { const b = { timeBased: () => b, atHour: h => (b.h = h, b), everyDays: () => b, inTimezone: () => b, create: () => { const t = { getHandlerFunction: () => fn, h: b.h }; triggers.push(t); return t; } }; return b; } };
  const resp = (code, body, blob) => ({ getResponseCode: () => code, getContentText: () => body, getBlob: () => blob || new Blob(Buffer.from(body), 'application/octet-stream', 'x') });
  const ctx = {};
  const UrlFetchApp = { fetch: (url) => {
    let m = /tokeninfo\?id_token=(.*)$/.exec(url);
    if (m) { const t = decodeURIComponent(m[1]).split(':'); if (t[0] !== 'test') return resp(400, '{}'); return resp(200, JSON.stringify({ aud: ctx.CONFIG.CLIENT_ID, email: t[1], email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600), name: t[2] || t[1], picture: '' })); }
    m = /spreadsheets\/d\/([^/]+)\/export/.exec(url);
    if (m) { const b = books.get(m[1]); const json = JSON.stringify(b.sheets.map(s => ({ n: s.name, rows: s.rows.length }))); return resp(200, json, new Blob(Buffer.from(json), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'export.xlsx')); }
    return resp(404, 'not mocked');
  } };
  const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) };
  Object.assign(ctx, { DriveApp, SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, ScriptApp, UrlFetchApp, ContentService,
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.owner || 'deposito.hidroblan@gmail.com' }) },
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' }, console: opts.quiet ? { log() { }, warn() { }, error: console.error } : console });
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  vm.runInContext("CONFIG.CLIENT_ID='test-client.apps.googleusercontent.com'", ctx);
  ctx.__drive = () => { const walk = (f, d) => [' '.repeat(d * 2) + (f instanceof DFolder ? '📁 ' : '📄 ') + f.name + (f.ss ? ' [' + f.ss.sheets.map(s => s.name + ':' + Math.max(0, s.getLastRow() - 1)).join(', ') + ']' : '')].concat(f instanceof DFolder ? f.kids().sort((a, b) => a.name.localeCompare(b.name)).flatMap(k => walk(k, d + 1)) : []); return walk(root, 0).join('\n'); };
  ctx.__books = books; ctx.__items = items;
  return ctx;
}

function serve(ctx, port) {
  return http.createServer((req, res) => {
    const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...h, 'Access-Control-Allow-Headers': '*' }); return res.end(); }
    if (req.method === 'GET') { res.writeHead(200, h); return res.end(req.url.startsWith('/__drive') ? ctx.__drive() : 'ok'); }
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      try { const out = ctx.doPost({ postData: { contents: body } }); res.writeHead(200, h); res.end(out.getContent()); }
      catch (e) { res.writeHead(500, h); res.end(JSON.stringify({ ok: false, code: 'internal', msg: String(e) })); }
    });
  }).listen(port);
}

module.exports = { makeEnv, serve };
if (require.main === module) {
  const ctx = makeEnv(); ctx.instalar(); const port = +process.argv[2] || 8790; serve(ctx, port); console.log('Simulador en http://localhost:' + port + '/exec');
}
