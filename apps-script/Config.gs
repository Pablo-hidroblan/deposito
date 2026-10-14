/**
 * Configuración del sistema Depósito Hidroblan.
 *
 * CLIENT_ID: el "ID de cliente de OAuth" (tipo Aplicación web) creado en
 * Google Cloud Console para la dirección de la aplicación. Es un dato público:
 * también figura en web/config.js. Ver docs/GUIA-INSTALACION.md, paso 3.
 */
var CONFIG = {
  CLIENT_ID: '438376853123-cdnjombn7fnk5u9jo498b11vagmd0j8l.apps.googleusercontent.com',
  NOMBRE_CARPETA: 'Control y Backup',
  SUBCARPETAS: {
    sistema: '00 Sistema (no modificar)',
    stock: '01 Stock y movimientos',
    grava: '02 Grava',
    bentonita: '03 Bentonita',
    tripolifosfato: '04 Tripolifosfato',
    bitacora: '05 Bitácora',
    trepanos: '06 Trépanos',
    recuentos: '07 Recuentos',
    pedidos: '08 Notas de pedido',
    documentos: '09 Documentos de respaldo',
    backups: '10 Backups'
  },
  HORA_EXPORTACION: 20,          // todos los días a las 20 h (hora de Argentina)
  DIAS_BACKUP_DIARIO: 90,        // los backups diarios se guardan 90 días; el del día 1 de cada mes, siempre
  DIAS_SESION: 30                // días que dura el ingreso en un dispositivo sin volver a elegir la cuenta
};
