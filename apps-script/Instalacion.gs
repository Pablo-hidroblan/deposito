/**
 * Instalación y carpetas en Google Drive.
 *
 * instalar(): ejecutar UNA vez desde el editor de Apps Script, con la cuenta
 * de Gmail de la empresa que va a ser dueña de los datos. Crea:
 *   Mi unidad / Control y Backup / 00 Sistema … 10 Backups
 *   la planilla "Base de datos Depósito (no modificar)" dentro de 00 Sistema
 *   la tarea diaria de exportación a las 20 h
 * Se puede volver a ejecutar sin riesgo: no duplica ni borra nada.
 */

function instalar() {
  var p = props_();
  var dueño = Session.getEffectiveUser().getEmail();
  if (!p.getProperty('OWNER_EMAIL')) p.setProperty('OWNER_EMAIL', dueño.toLowerCase());
  var f = asegurarCarpetas_();
  if (!p.getProperty('DB_ID')) {
    var ss = SpreadsheetApp.create('Base de datos Depósito (no modificar)');
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(f.sistema));
    p.setProperty('DB_ID', ss.getId());
    db_.ss = ss;
    hoja_('_cambios', true);
    ss.getSheets().forEach(function (sh) { if (sh.getName() !== '_cambios' && sh.getLastRow() === 0) ss.deleteSheet(sh); });
  }
  if (!p.getProperty('SEQ')) p.setProperty('SEQ', '0');
  programarExportacion_();
  console.log('Listo. Dueña/o: ' + p.getProperty('OWNER_EMAIL'));
  console.log('Carpeta Control y Backup: ' + DriveApp.getFolderById(f.raiz).getUrl());
  console.log('Base de datos: https://docs.google.com/spreadsheets/d/' + p.getProperty('DB_ID'));
  if (CONFIG.CLIENT_ID.indexOf('PEGAR-AQUI') === 0) console.warn('Falta completar CLIENT_ID en Config.gs (guía, paso 3).');
}

function programarExportacion_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'exportarDiario') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('exportarDiario').timeBased().atHour(CONFIG.HORA_EXPORTACION).everyDays(1).inTimezone('America/Argentina/Buenos_Aires').create();
}

function existeCarpeta_(id) {
  if (!id) return false;
  try { var c = DriveApp.getFolderById(id); return !c.isTrashed(); } catch (e) { return false; }
}

function subcarpeta_(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

/* crea (o repara) la estructura de carpetas y devuelve sus ids */
function asegurarCarpetas_() {
  var p = props_(), f = JSON.parse(p.getProperty('FOLDERS') || '{}'), cambio = false;
  if (!existeCarpeta_(f.raiz)) {
    var it = DriveApp.getRootFolder().getFoldersByName(CONFIG.NOMBRE_CARPETA);
    f.raiz = (it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.NOMBRE_CARPETA)).getId(); cambio = true;
  }
  var raiz = DriveApp.getFolderById(f.raiz);
  Object.keys(CONFIG.SUBCARPETAS).forEach(function (k) {
    if (!existeCarpeta_(f[k])) { f[k] = subcarpeta_(raiz, CONFIG.SUBCARPETAS[k]).getId(); cambio = true; }
  });
  if (!existeCarpeta_(f.archivos)) { f.archivos = subcarpeta_(DriveApp.getFolderById(f.sistema), 'Archivos subidos').getId(); cambio = true; }
  if (cambio) p.setProperty('FOLDERS', JSON.stringify(f));
  carpeta_.cache = f;
  return f;
}

function carpeta_(clave) {
  var f = carpeta_.cache || (carpeta_.cache = JSON.parse(prop_('FOLDERS') || '{}'));
  if (!f[clave]) f = asegurarCarpetas_();
  return DriveApp.getFolderById(f[clave]);
}
