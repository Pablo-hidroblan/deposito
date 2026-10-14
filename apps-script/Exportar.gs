/**
 * Exportación diaria a la carpeta "Control y Backup" (todos los días a las 20 h).
 *
 *  01 Stock y movimientos   Stock actual · Historial de movimientos · Cierres mensuales/
 *  02 Grava, 03 Bentonita, 04 Tripolifosfato   Stock e historial de cada uno
 *  05 Bitácora              Bitácora · Imágenes/AAAA-MM
 *  06 Trépanos              Trépanos y movimientos
 *  07 Recuentos             Resumen de recuentos · una planilla por recuento finalizado
 *  08 Notas de pedido       Notas de pedido · PDF/
 *  09 Documentos de respaldo   Índice de documentos · AAAA-MM/ con las fotos y PDF
 *  10 Backups               Respaldo AAAA-MM-DD.xlsx (copia completa de la base)
 *
 * También se puede ejecutar a mano desde el editor o desde la aplicación
 * (Administración › Copia de seguridad › Exportar ahora a Drive).
 */

var TZ = 'America/Argentina/Buenos_Aires';
var SCOPES = {
  grava: function (p) { return /grava/i.test(p.nombre || '') || /^T-GRAV/i.test(p.sku); },
  bentonita: function (p) { return /bentonit/i.test(p.nombre || '') || /^T-BENT/i.test(p.sku); },
  tripolifosfato: function (p) { return /tripoli/i.test(p.nombre || '') || /^T-TRI-/i.test(p.sku); },
  metal: function (p) { return /metal[uú]rg/i.test(p.categoria || '') || /^T-MET-/i.test(p.sku || ''); }
};
var NOMBRES = { grava: 'Grava', bentonita: 'Bentonita', tripolifosfato: 'Tripolifosfato' };

function exportarDiario() {
  var t0 = Date.now();
  asegurarCarpetas_();
  var D = datos_();
  var errores = [];
  var pasos = [
    ['stock', function () { exportarStock_(D); }],
    ['grava/bentonita/tripolifosfato', function () { ['grava', 'bentonita', 'tripolifosfato'].forEach(function (k) { exportarAlcance_(D, k); }); }],
    ['bitácora', function () { exportarBitacora_(D); }],
    ['trépanos', function () { exportarTrepanos_(D); }],
    ['recuentos', function () { exportarRecuentos_(D); }],
    ['notas de pedido', function () { exportarPedidos_(D); }],
    ['documentos', function () { exportarDocumentos_(D); }],
    ['backup', function () { backupCompleto_(); }],
    ['limpieza', function () { limpiar_(); }]
  ];
  pasos.forEach(function (p) {
    try { p[1](); } catch (e) { errores.push(p[0] + ': ' + (e && e.message || e)); console.error(p[0], e && e.stack || e); }
  });
  props_().setProperty('ULTIMA_EXPORTACION', JSON.stringify({ fecha: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000), errores: errores }));
  if (errores.length) console.warn('Exportación con errores: ' + errores.join(' | '));
}

/* ---------------- datos ---------------- */

function datos_() {
  var D = { products: [], movimientos: [], bitacora: [], documentos: [], pedidos: [], recuentos: [], lineas: {}, proveedores: [], trepanos: [], trepanos_mov: [], archivos: {} };
  snapshot_().docs.forEach(function (x) {
    var o = Object.assign({ id: x.id }, x.d);
    if (x.p === 'products') { o.sku = x.id; D.products.push(o); }
    else if (/^recuentos\/[^\/]+\/lineas$/.test(x.p)) { var r = x.p.split('/')[1]; (D.lineas[r] = D.lineas[r] || []).push(o); }
    else if (D[x.p]) D[x.p].push(o);
  });
  D.products.sort(function (a, b) { return String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }); });
  D.movimientos.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  D.stock = {};
  D.movimientos.forEach(function (m) {
    if (m.historico) return;
    var q = +m.cantidad || 0;
    D.stock[m.sku] = (D.stock[m.sku] || 0) + (m.tipo === 'egreso' ? -q : q);
  });
  D.prod = {}; D.products.forEach(function (p) { D.prod[p.sku] = p; });
  D.prov = {}; D.proveedores.forEach(function (p) { D.prov[p.id] = p.nombre || p.razonSocial || ''; });
  D.docs = {}; D.documentos.forEach(function (d) { D.docs[d.id] = d; });
  var sh = hojaArchivos_();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().forEach(function (r, i) {
    D.archivos[String(r[0])] = { fila: i + 2, driveId: String(r[1]), nombre: String(r[2]), tipo: String(r[3]), ubicacion: String(r[7] || '') };
  });
  D.alias = {};
  personas_().forEach(function (p) { D.alias[p.id] = p.name || p.alias || p.id; });
  return D;
}

function stockDe_(D, sku) { return Math.round((D.stock[sku] || 0) * 1000) / 1000; }
function estado_(D, p) { var s = stockDe_(D, p.sku), min = +p.minimo || 0; return s < 0 ? 'Stock negativo' : s <= 0 ? 'Sin stock' : min > 0 && s <= min ? 'Bajo mínimo' : 'Disponible'; }
function fecha_(iso) { if (!iso) return ''; var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)); if (m) return new Date(+m[1], +m[2] - 1, +m[3]); var d = new Date(iso); return isNaN(d) ? String(iso) : d; }
function dia_(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd'); }
function quien_(D, id) { return id ? (D.alias[id] || id) : ''; }
function presTxt_(m) {
  if (m.presN && m.presCant) return m.presCant + ' ' + m.presN;
  if (m.cajas) return m.cajas + ' caja(s)' + (m.porCaja ? ' x ' + m.porCaja : '');
  return m.pres || '';
}
function enlaces_(D, adj) {
  return (adj || []).map(function (a) { var f = D.archivos[a.id]; return f ? 'https://drive.google.com/file/d/' + f.driveId + '/view' : (a.nombre || a.id); }).join('\n');
}

/* ---------------- planillas ---------------- */

function planilla_(carpeta, nombre) {
  var it = carpeta.getFilesByName(nombre);
  while (it.hasNext()) { var f = it.next(); if (f.getMimeType() === MimeType.GOOGLE_SHEETS && !f.isTrashed()) return SpreadsheetApp.openById(f.getId()); }
  var ss = SpreadsheetApp.create(nombre);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
  return ss;
}
function existe_(carpeta, nombre) { return carpeta.getFilesByName(nombre).hasNext(); }

/* escribe una pestaña completa: encabezado + filas; fechas como fecha real */
function pestaña_(ss, nombre, head, filas, anchos) {
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  sh.clear();
  if (sh.getFilter()) sh.getFilter().remove();
  var datos = [head].concat(filas.length ? filas : [head.map(function (_, i) { return i ? '' : 'Sin registros'; })]);
  sh.getRange(1, 1, datos.length, head.length).setValues(datos);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#e8eef3');
  sh.setFrozenRows(1);
  head.forEach(function (h, i) {
    if (/^fecha|^hora|finaliz|actualiz/i.test(h) && filas.length) sh.getRange(2, i + 1, filas.length, 1).setNumberFormat(/^fecha$/i.test(h) && filas.every(function (f) { return !(f[i] instanceof Date) || (f[i].getHours() === 0 && f[i].getMinutes() === 0); }) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm');
    if (anchos && anchos[i]) sh.setColumnWidth(i + 1, anchos[i]);
  });
  if (filas.length) sh.getRange(1, 1, filas.length + 1, head.length).createFilter();
  // quitar la hoja vacía que trae toda planilla nueva
  ss.getSheets().forEach(function (s) { if (s.getName() !== nombre && /^(Hoja 1|Sheet1)$/.test(s.getName()) && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });
  return sh;
}

function info_(ss) {
  pestaña_(ss, 'Información', ['Dato', 'Valor'], [
    ['Actualizado', new Date()],
    ['Origen', 'Aplicación Depósito Hidroblan (exportación automática diaria)'],
    ['Importante', 'Esta planilla se reescribe todos los días: no la uses para cargar datos.']
  ], [160, 460]);
}

var H_STOCK = ['SKU', 'Producto', 'Categoría', 'Unidad', 'Stock', 'Mínimo', 'Estado', 'Ubicación'];
function filaStock_(D, p) { return [p.sku, p.nombre || '', p.categoria || '', p.unidad || 'u', stockDe_(D, p.sku), p.minimo === undefined || p.minimo === null || p.minimo === '' ? '' : +p.minimo, estado_(D, p), p.ubicacion || '']; }
var H_MOV = ['Fecha', 'Tipo', 'SKU', 'Producto', 'Cantidad', 'Unidad', 'Presentación', 'Origen / Proveedor', 'Destino', 'Obra', 'Solicitante', 'Autoriza', 'Remito / Documento', 'Observaciones', 'Histórico', 'Registró'];
var TIPO_MOV = { ingreso: 'Entrada', egreso: 'Salida', ajuste: 'Ajuste' };
function filaMov_(D, m) {
  var p = D.prod[m.sku] || {}, d = m.docId && D.docs[m.docId];
  var doc = d ? (d.tipo || '') + ' ' + (d.numero || '') : (m.remito || '');
  return [fecha_(m.fecha), TIPO_MOV[m.tipo] || m.tipo || '', m.sku || '', m.nombre || p.nombre || '', +m.cantidad || 0, p.unidad || 'u', presTxt_(m),
    [m.origen, D.prov[m.proveedorId]].filter(Boolean).join(' · '), m.destino || '', m.obra || '', m.solicitante || '', m.autoriza || '', doc.trim(), m.obs || '', m.historico ? 'Sí' : '', quien_(D, m.by)];
}
var ANCHO_MOV = [120, 70, 110, 260, 80, 70, 110, 170, 110, 80, 130, 130, 140, 260, 70, 160];

function exportarStock_(D) {
  var c = carpeta_('stock');
  var ss = planilla_(c, 'Stock actual');
  pestaña_(ss, 'Stock', H_STOCK, D.products.map(function (p) { return filaStock_(D, p); }), [110, 320, 160, 70, 80, 80, 120, 140]);
  info_(ss);
  var h = planilla_(c, 'Historial de movimientos');
  var todos = D.movimientos.slice().reverse();
  pestaña_(h, 'Todos los movimientos', H_MOV, todos.map(function (m) { return filaMov_(D, m); }), ANCHO_MOV);
  pestaña_(h, 'Insumos metalúrgicos', H_MOV, todos.filter(function (m) { return m.nivel === 'metal' || SCOPES.metal(D.prod[m.sku] || { sku: m.sku }); }).map(function (m) { return filaMov_(D, m); }), ANCHO_MOV);
  info_(h);
  // cierre mensual: el último día de cada mes queda una foto del stock
  var mañana = new Date(Date.now() + 864e5);
  if (Utilities.formatDate(mañana, TZ, 'd') === '1') {
    var cm = subcarpeta_(c, 'Cierres mensuales'), nom = 'Stock al ' + dia_();
    if (!existe_(cm, nom)) { var s2 = planilla_(cm, nom); pestaña_(s2, 'Stock', H_STOCK, D.products.map(function (p) { return filaStock_(D, p); })); info_(s2); }
  }
}

function exportarAlcance_(D, k) {
  var test = SCOPES[k], prods = D.products.filter(test), skus = {};
  prods.forEach(function (p) { skus[p.sku] = 1; });
  var ss = planilla_(carpeta_(k), NOMBRES[k] + ' – stock e historial');
  pestaña_(ss, 'Stock', H_STOCK, prods.map(function (p) { return filaStock_(D, p); }), [110, 320, 160, 70, 80, 80, 120, 140]);
  pestaña_(ss, 'Historial', H_MOV, D.movimientos.slice().reverse().filter(function (m) { return skus[m.sku]; }).map(function (m) { return filaMov_(D, m); }), ANCHO_MOV);
  info_(ss);
}

function exportarBitacora_(D) {
  var c = carpeta_('bitacora');
  var L = D.bitacora.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || (b.orden || 0) - (a.orden || 0); });
  ubicarArchivos_(D, L, function (e, i, n, a) { return { carpeta: subcarpeta_(subcarpeta_(c, 'Imágenes'), String(e.fecha || '').slice(0, 7) || 'sin-fecha'), nombre: (e.fecha || '') + ' bitácora ' + (e.orden || '') + (n > 1 ? ' (' + (i + 1) + ')' : '') }; });
  var ss = planilla_(c, 'Bitácora');
  pestaña_(ss, 'Registros', ['Fecha', 'Orden', 'Categoría', 'Novedad', 'Equipos', 'Registró', 'Imágenes'],
    L.map(function (e) { return [fecha_(e.fecha), e.orden || '', e.categoria || '', e.texto || '', (e.equipos || []).join(', '), e.registro || quien_(D, e.by), enlaces_(D, e.adjuntos)]; }),
    [100, 60, 110, 520, 120, 140, 260]);
  info_(ss);
}

function plano_(o) {
  var r = {};
  Object.keys(o).forEach(function (k) { var v = o[k]; r[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v; });
  return r;
}
function tablaGenerica_(ss, nombre, L) {
  var keys = [];
  L.forEach(function (o) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
  if (!keys.length) keys = ['id'];
  pestaña_(ss, nombre, keys, L.map(function (o) { var p = plano_(o); return keys.map(function (k) { return p[k] === undefined ? '' : p[k]; }); }));
}

function exportarTrepanos_(D) {
  var ss = planilla_(carpeta_('trepanos'), 'Trépanos');
  tablaGenerica_(ss, 'Trépanos', D.trepanos);
  tablaGenerica_(ss, 'Movimientos', D.trepanos_mov.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }));
  info_(ss);
}

function exportarRecuentos_(D) {
  var c = carpeta_('recuentos');
  var L = D.recuentos.slice().sort(function (a, b) { return String(b.creado).localeCompare(String(a.creado)); });
  var EST = { abierto: 'En curso', cerrado: 'Finalizado', anulado: 'Anulado' };
  var ss = planilla_(c, 'Resumen de recuentos');
  pestaña_(ss, 'Recuentos', ['Fecha', 'N°', 'Nombre', 'Responsable', 'Estado', 'Controlados', 'Con diferencia', 'No controlados', 'Finalizado', 'Finalizado por'],
    L.map(function (r) { return [fecha_(r.fecha), r.seq || '', r.nombre || '', r.responsable || '', EST[r.estado] || r.estado || '', r.n || 0, r.nDif || 0, r.nNoCtrl || (r.noControlados || []).length || '', fecha_(r.cerrado), r.cerradoPor || '']; }));
  info_(ss);
  L.filter(function (r) { return r.estado === 'cerrado'; }).forEach(function (r) {
    var nom = (r.nombre || ('Recuento ' + r.fecha + (r.seq ? ' #' + r.seq : ''))).replace(/[\\\/]/g, '-');
    if (existe_(c, nom)) return;
    var s = planilla_(c, nom);
    var lin = (D.lineas[r.id] || []).slice().sort(function (a, b) { return String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }); });
    pestaña_(s, 'Controlados', ['SKU', 'Producto', 'Unidad', 'Sistema', 'Contado', 'Diferencia', 'Hora'],
      lin.map(function (l) { return [l.sku || l.id, l.nombre || '', l.unidad || '', +l.sistema || 0, +l.contado || 0, +l.dif || 0, fecha_(l.ts)]; }), [110, 320, 70, 80, 80, 90, 130]);
    pestaña_(s, 'No controlados', ['SKU', 'Producto', 'Unidad', 'Stock que quedó'],
      (r.noControlados || []).map(function (x) { return [x.sku, x.nombre || '', x.unidad || '', +x.stock || 0]; }), [110, 320, 70, 110]);
    pestaña_(s, 'Datos', ['Dato', 'Valor'], [['Fecha', fecha_(r.fecha)], ['Responsable', r.responsable || ''], ['Finalizado', fecha_(r.cerrado)], ['Finalizado por', r.cerradoPor || ''], ['Controlados', r.n || 0], ['Con diferencia', r.nDif || 0]], [160, 300]);
  });
}

function exportarPedidos_(D) {
  var c = carpeta_('pedidos');
  subcarpeta_(c, 'PDF');
  var L = D.pedidos.slice().sort(function (a, b) { return (b.numero || 0) - (a.numero || 0); });
  var np = function (n) { return 'NP-' + String(n || 0).padStart(4, '0'); };
  var ss = planilla_(c, 'Notas de pedido');
  pestaña_(ss, 'Notas', ['N°', 'Fecha', 'Estado', 'Solicita', 'Área', 'Imputación', 'Prioridad', 'Necesario', 'Ítems', 'Observaciones', 'Enviada a'],
    L.map(function (p) { return [np(p.numero), fecha_(p.fecha), ({ pendiente: 'Pendiente de envío', enviado: 'Enviada a Compras', recibido: 'Recibida', anulado: 'Anulada' })[p.estado] || p.estado || '', p.solicita || '', p.area || '', p.imputacion || '', p.prioridad || '', fecha_(p.necesario), (p.items || []).length, p.obs || '', p.enviadoA || '']; }));
  var it = [];
  L.forEach(function (p) { (p.items || []).forEach(function (i) { it.push([np(p.numero), fecha_(p.fecha), i.sku || '', i.nombre || '', +i.cantidad || 0, i.unidad || '', i.solicitante || '', i.area || '', i.imputacion || '', i.prioridad || '', i.plazo ? i.plazo + ' Hs' : 'Sin plazo', fecha_(i.limite), i.codProv || '', i.obs || '']); }); });
  pestaña_(ss, 'Ítems', ['N°', 'Fecha', 'SKU', 'Producto', 'Cantidad', 'Unidad', 'Solicitante', 'Área', 'Imputación', 'Prioridad', 'Plazo', 'Fecha límite', 'Cód. proveedor', 'Observaciones'], it);
  info_(ss);
}

function exportarDocumentos_(D) {
  var c = carpeta_('documentos');
  var L = D.documentos.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
  ubicarArchivos_(D, L, function (d, i, n) { return { carpeta: subcarpeta_(c, String(d.fecha || '').slice(0, 7) || 'sin-fecha'), nombre: [d.fecha, d.tipo, d.numero].filter(Boolean).join(' ') + (n > 1 ? ' (' + (i + 1) + ')' : '') }; });
  var vinc = {};
  D.movimientos.forEach(function (m) { if (m.docId) (vinc[m.docId] = vinc[m.docId] || []).push(m); });
  var ss = planilla_(c, 'Índice de documentos');
  pestaña_(ss, 'Documentos', ['Fecha', 'Tipo', 'Número', 'Proveedor / cliente / equipo', 'Observaciones', 'Movimientos vinculados', 'Archivos'],
    L.map(function (d) { var v = vinc[d.id] || []; return [fecha_(d.fecha), d.tipo || '', d.numero || '', d.tercero || '', d.obs || '', v.map(function (m) { return (TIPO_MOV[m.tipo] || m.tipo) + ' ' + m.cantidad + ' ' + m.sku; }).join('\n'), enlaces_(D, d.adjuntos)]; }),
    [100, 110, 130, 200, 240, 240, 300]);
  info_(ss);
}

/* mueve y renombra las fotos/PDF según el registro al que pertenecen (una sola vez) */
function ubicarArchivos_(D, registros, destino) {
  var sh = hojaArchivos_();
  registros.forEach(function (r) {
    var adj = r.adjuntos || [];
    adj.forEach(function (a, i) {
      var f = D.archivos[a.id]; if (!f) return;
      var t = destino(r, i, adj.length, a), ext = f.tipo === 'application/pdf' ? '.pdf' : '.' + (f.tipo.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      var nombre = t.nombre.trim() + ext, marca = t.carpeta.getId() + '|' + nombre;
      if (f.ubicacion === marca) return;
      try {
        var file = DriveApp.getFileById(f.driveId);
        file.moveTo(t.carpeta); file.setName(nombre);
        sh.getRange(f.fila, 3).setValue(nombre); sh.getRange(f.fila, 8).setValue(marca);
        f.ubicacion = marca;
      } catch (e) { console.warn('No se pudo ubicar ' + a.id + ': ' + e); }
    });
  });
}

/* ---------------- backup completo ---------------- */

function backupCompleto_() {
  var c = carpeta_('backups'), nom = 'Respaldo ' + dia_() + '.xlsx';
  var it = c.getFilesByName(nom); while (it.hasNext()) it.next().setTrashed(true);
  SpreadsheetApp.flush();
  var url = 'https://docs.google.com/spreadsheets/d/' + prop_('DB_ID') + '/export?format=xlsx';
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('No se pudo exportar la base (' + res.getResponseCode() + ')');
  c.createFile(res.getBlob().setName(nom));
  // conservar: los últimos N días + el del día 1 de cada mes
  var limite = Date.now() - CONFIG.DIAS_BACKUP_DIARIO * 864e5, files = c.getFiles();
  while (files.hasNext()) {
    var f = files.next(), m = /^Respaldo (\d{4})-(\d{2})-(\d{2})\.xlsx$/.exec(f.getName());
    if (m && m[3] !== '01' && new Date(+m[1], +m[2] - 1, +m[3]).getTime() < limite) f.setTrashed(true);
  }
}

/* registro de cambios: se conservan 60 días; sesiones vencidas fuera */
function limpiar_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var sh = hoja_('_cambios', true), n = sh.getLastRow() - 1;
    if (n > 0) {
      var f = sh.getRange(2, 2, n, 1).getValues(), corte = new Date(Date.now() - 60 * 864e5).toISOString(), k = 0;
      while (k < f.length && String(f[k][0]) < corte) k++;
      if (k > 0 && k < f.length) sh.deleteRows(2, k);
    }
    var s = hoja_('_sesiones', false);
    if (s && s.getLastRow() > 1) {
      var v = s.getRange(2, 6, s.getLastRow() - 1, 1).getValues(), ahora = new Date().toISOString();
      for (var i = v.length - 1; i >= 0; i--) if (String(v[i][0]) < ahora) s.deleteRow(i + 2);
    }
  } finally { lock.releaseLock(); }
}
