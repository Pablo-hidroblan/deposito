# Depósito Hidroblan

Aplicación de control de stock del depósito de Hidroblan Perforaciones: movimientos de productos e insumos metalúrgicos, grava, bentonita, tripolifosfato, bitácora diaria, documentación de respaldo, notas de pedido, recuentos y trépanos.

- **Dirección:** https://deposito.hidroblan.com.ar (se instala en PC y celular desde el navegador).
- **Ingreso:** con cuenta de Google; solo las cuentas habilitadas en *Administración › Usuarios y permisos*.
- **Datos:** Google Drive de la cuenta de la empresa, carpeta **Control y Backup**.

## Cómo está armado

| Carpeta | Qué es | Dónde se publica |
|---|---|---|
| `web/` | La aplicación (pantallas). `index.html` es la aplicación completa; `shim.js` la conecta con Google; `sw.js` permite instalarla y ver fotos/PDF. | GitHub Pages (automático al guardar cambios en `main`) |
| `apps-script/` | El servidor: API, base de datos en Google Sheets, archivos en Drive y exportación diaria a *Control y Backup*. | Google Apps Script (automático si están cargados los secrets; si no, a mano) |
| `tools/` | `gas-sim.js`: simulador local de Apps Script para pruebas. `convertir.py`: conversión única desde la planilla de claude.ai. | — |
| `docs/` | Guía de instalación y de uso. | — |

## Carpeta «Control y Backup» en Drive

```
Control y Backup/
  00 Sistema (no modificar)/      base de datos y archivos recién subidos
  01 Stock y movimientos/         Stock actual · Historial de movimientos · Cierres mensuales/
  02 Grava/  03 Bentonita/  04 Tripolifosfato/   stock e historial de cada uno
  05 Bitácora/                    Bitácora · Imágenes/AAAA-MM
  06 Trépanos/
  07 Recuentos/                   Resumen · una planilla por recuento finalizado
  08 Notas de pedido/             Notas de pedido · PDF/
  09 Documentos de respaldo/      Índice de documentos · AAAA-MM/ (fotos y PDF)
  10 Backups/                     Respaldo AAAA-MM-DD.xlsx (90 días + el día 1 de cada mes)
```

Las planillas de 01 a 09 se reescriben todos los días a las 20 h: sirven para consultar y compartir, no para cargar datos.

## Instalación

Ver [docs/GUIA-INSTALACION.md](docs/GUIA-INSTALACION.md).

## Pruebas locales

```bash
node tools/gas-sim.js 8790        # servidor simulado en http://localhost:8790/exec
```

Con `web/config.js` apuntando a esa dirección y `dev: true`, la pantalla de ingreso acepta un email de prueba (la cuenta dueña simulada es `deposito.hidroblan@gmail.com`).
