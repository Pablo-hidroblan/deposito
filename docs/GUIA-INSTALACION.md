# Guía de instalación — Depósito Hidroblan

Esta guía deja funcionando la aplicación en **https://deposito.hidroblan.com.ar**, con los datos en Google Drive y las actualizaciones automáticas desde GitHub.

**Tiempo estimado:** 1 a 2 horas la primera vez. Los pasos 1 a 6 se hacen una sola vez.
**Quién:** pasos 1 a 5 y 7, la persona responsable (Carla). Paso 6, quien administra el dominio hidroblan.com.ar. Paso 8 es opcional y conviene que lo haga alguien de sistemas.

> Mientras no termines el paso 9, la planilla de claude.ai sigue funcionando normalmente. Seguí cargando ahí hasta el día del cambio.

---

## Qué vas a necesitar

- Una computadora con Chrome.
- La **cuenta de Gmail de la empresa** creada para esto (paso 1).
- Acceso a quien maneje el dominio **hidroblan.com.ar** (solo para el paso 6).
- El archivo **hidroblan-deposito.zip** (descomprimido en una carpeta de tu PC).

---

## Paso 1 · Crear la cuenta de Gmail de la empresa

1. Entrá a <https://accounts.google.com/signup> y creá una cuenta, por ejemplo **deposito.hidroblan@gmail.com**.
2. Guardá la contraseña en un lugar seguro y activá la verificación en dos pasos (Cuenta de Google › Seguridad).
3. Esta cuenta va a ser **la dueña de todos los datos**: la carpeta *Control y Backup*, la base de datos y las fotos. Siempre tiene perfil Administrador.

> En los pasos 2 a 5, trabajá con esta cuenta. Si en Chrome usás también tu cuenta personal, abrí una ventana con el perfil de la cuenta de la empresa (ícono de persona arriba a la derecha › Agregar).

## Paso 2 · Instalar el servidor en Google Apps Script

1. Con la cuenta de la empresa, entrá a <https://script.google.com> y tocá **Nuevo proyecto**.
2. Arriba a la izquierda, cambiá el nombre "Proyecto sin título" por **Depósito Hidroblan – Servidor**.
3. Tocá el engranaje (**Configuración del proyecto**) y marcá **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
4. Volvé al editor (ícono `< >`). Vas a ver dos archivos: `Código.gs` y `appsscript.json`.
   - Abrí `appsscript.json`, borrá todo y pegá el contenido de **apps-script/appsscript.json**.
   - Abrí `Código.gs`, borrá todo y pegá el contenido de **apps-script/Api.gs**. Renombralo a `Api` (tres puntitos › Cambiar nombre).
   - Con el **+** de *Archivos* › *Secuencia de comandos*, creá `Config`, `Exportar` e `Instalacion`, y pegá en cada uno el contenido del archivo `.gs` del mismo nombre.
   - Guardá (ícono de disquete o Ctrl+S).
5. Arriba, en la lista de funciones, elegí **instalar** y tocá **Ejecutar**.
   - Aparece *"Se requiere autorización"* › **Revisar permisos** › elegí la cuenta de la empresa.
   - Aparece *"Google no verificó esta app"*: es normal porque la app es tuya. Tocá **Configuración avanzada** › **Ir a Depósito Hidroblan – Servidor (no seguro)** › **Permitir**.
   - Abajo, en el *Registro de ejecución*, aparece **"Listo"** con los enlaces a la carpeta *Control y Backup* y a la base de datos. En tu Drive ya está la carpeta con sus 11 subcarpetas.
6. Publicá el servidor: **Implementar › Nueva implementación**.
   - En *Seleccionar tipo* (engranaje), elegí **Aplicación web**.
   - Descripción: `Servidor`. **Ejecutar como: Yo**. **Quién tiene acceso: Cualquier persona**.
   - Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`). Guardala: es la *dirección del servidor*.
   - Copiá también el **ID de implementación** (lo vas a usar en el paso 8).

> "Cualquier persona" significa que la dirección responde a cualquiera, pero el servidor solo entrega datos a quien ingresó con una cuenta de Google habilitada en la aplicación.

## Paso 3 · Crear el "ID de cliente" para el ingreso con Google

Es lo que permite el botón *Ingresar con Google* en la aplicación.

1. Con la cuenta de la empresa, entrá a <https://console.cloud.google.com>. Si es la primera vez, aceptá las condiciones.
2. Arriba, en el selector de proyectos, tocá **Proyecto nuevo** › nombre **Deposito Hidroblan** › **Crear**. Asegurate de que quede seleccionado.
3. En el menú (☰) entrá a **APIs y servicios › Pantalla de consentimiento de OAuth** (puede aparecer como **Google Auth Platform**) y tocá **Comenzar**:
   - Nombre de la aplicación: **Depósito Hidroblan**. Correo de asistencia: la cuenta de la empresa.
   - Público: **Externo**. Información de contacto: la cuenta de la empresa. Aceptá y tocá **Crear**.
   - En **Público**, tocá **Publicar app** › **Confirmar** (estado *En producción*). Como la app solo pide nombre, email y foto, Google no exige ninguna verificación.
4. Entrá a **Clientes** (o *Credenciales › Crear credenciales › ID de cliente de OAuth*):
   - Tipo de aplicación: **Aplicación web**. Nombre: `Depósito web`.
   - **Orígenes autorizados de JavaScript**: agregá `https://deposito.hidroblan.com.ar`. Si vas a probar antes de tener el dominio, agregá también `https://pablo-hidroblan.github.io` (con tu usuario de GitHub del paso 4).
   - Dejá vacío *URI de redireccionamiento autorizados* y tocá **Crear**.
   - Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`).
5. Volvé al proyecto de Apps Script, abrí `Config` y reemplazá `PEGAR-AQUI.apps.googleusercontent.com` por ese ID de cliente. Guardá.
6. **Implementar › Administrar implementaciones** › lápiz (editar) › Versión: **Nueva versión** › **Implementar**. La dirección `/exec` no cambia.

## Paso 4 · Crear la cuenta de GitHub y subir la aplicación

1. Entrá a <https://github.com/signup> y creá una cuenta con el email de la empresa. Elegí un usuario, por ejemplo **hidroblan-deposito** (de acá sale la dirección provisoria `https://hidroblan-deposito.github.io/deposito/`).
2. Tocá **+** › **New repository**:
   - Repository name: **deposito**. Visibilidad: **Public** (GitHub Pages es gratis solo con repositorios públicos; en el código no hay datos ni contraseñas).
   - Tocá **Create repository**.
3. En la página del repositorio vacío, tocá **uploading an existing file** y arrastrá **todo el contenido** de la carpeta `hidroblan-deposito` (las carpetas `web`, `apps-script`, `docs`, `tools`, `.github` y los archivos `README.md` y `.gitignore`).
   - La carpeta `.github` está oculta en algunos equipos. En Mac, en el Finder apretá **Cmd + Shift + .** para verla. En Windows, en el Explorador: **Vista › Mostrar › Elementos ocultos**.
   - Abajo, tocá **Commit changes**.
4. Completá la configuración de la aplicación: en el repositorio, abrí `web/config.js` › lápiz (**Edit this file**):
   - `apiUrl`: la dirección del servidor del paso 2 (termina en `/exec`).
   - `clientId`: el ID de cliente del paso 3.
   - Tocá **Commit changes**.

## Paso 5 · Publicar la aplicación con GitHub Pages

1. En el repositorio: **Settings › Pages**. En *Build and deployment › Source*, elegí **GitHub Actions**.
2. Entrá a la pestaña **Actions**. Si aparece un botón para habilitar los flujos de trabajo, tocalo. Abrí **Publicar aplicación web** › **Run workflow** › **Run workflow**.
3. En 1 o 2 minutos aparece un tilde verde. La aplicación ya funciona en `https://pablo-hidroblan.github.io/deposito/` (agregá esa dirección en los orígenes del paso 3.4 si todavía no lo hiciste).

## Paso 6 · Dirección propia: deposito.hidroblan.com.ar

**Para quien administra el dominio hidroblan.com.ar** (en el panel del proveedor del dominio o de DNS):

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `deposito` | `pablo-hidroblan.github.io` |

Después, en GitHub: **Settings › Pages › Custom domain** › `deposito.hidroblan.com.ar` › **Save**. Cuando GitHub confirme el DNS (puede tardar de minutos a unas horas), marcá **Enforce HTTPS**.

## Paso 7 · Primer ingreso

1. Abrí **https://deposito.hidroblan.com.ar** y tocá **Ingresar con Google** con la cuenta de la empresa.
2. Para habilitar más personas: **Administración › Usuarios y permisos › Habilitar a una persona**. Escribí su email de Google y elegí el perfil:
   - **Consulta:** ve, exporta e imprime.
   - **Depósito:** además registra movimientos, bitácora, recuentos y notas de pedido.
   - **Administrador:** además cambia catálogo, ajustes y perfiles.
3. Cada persona necesita una **cuenta de Google**. Si alguien no tiene Gmail, puede crear una cuenta de Google con su email actual (en la página de registro: *Usar mi dirección de correo electrónico actual*).

> Recomendado: habilitá tu cuenta personal de trabajo como **Administrador** y usá la cuenta de la empresa solo para administrar Google y GitHub.

## Paso 8 · Actualizaciones automáticas del servidor (opcional, sistemas)

Las mejoras en las pantallas (`web/`) se publican solas en cuanto se guardan en GitHub. Para que los cambios del servidor (`apps-script/`) también se publiquen solos:

1. Con la cuenta de la empresa, entrá a <https://script.google.com/home/usersettings> y activá **API de Google Apps Script**.
2. En una PC con Node.js: `npm install -g @google/clasp@2.4.2` y después `clasp login` (abre el navegador: ingresá con la cuenta de la empresa y permití).
3. Se crea el archivo `.clasprc.json` en la carpeta del usuario (`C:\Users\<usuario>\` o `~/`). Copiá su contenido completo.
4. En GitHub: **Settings › Secrets and variables › Actions › New repository secret**, y cargá:
   - `CLASPRC_JSON`: el contenido de `.clasprc.json`.
   - `SCRIPT_ID`: en Apps Script, **Configuración del proyecto › ID de la secuencia de comandos**.
   - `DEPLOYMENT_ID`: el ID de implementación del paso 2.6.
5. Para probar: **Actions › Publicar servidor (Apps Script) › Run workflow**. Tiene que terminar con tilde verde.

Si no se hace este paso, los cambios del servidor se aplican a mano: se pega el archivo nuevo en el editor de Apps Script y se hace **Implementar › Administrar implementaciones › editar › Nueva versión**.

## Paso 9 · Día del cambio: pasar los datos de la planilla de claude.ai

Hacelo al terminar una jornada, cuando nadie esté cargando.

1. En la planilla de claude.ai: **Administración › Copia de seguridad**:
   - **Descargar copia completa (Excel)**.
   - **Descargar fotos y PDF (ZIP)**.
2. En la aplicación nueva, con la cuenta de la empresa: **Administración › Pasar datos de la planilla anterior**:
   - Elegí los dos archivos y revisá el resumen (cantidad de productos, movimientos, etc.).
   - En *Usuarios de la planilla anterior* dejá tu email (o el de quien cargaba los datos) para que se vean los nombres.
   - Tocá **Importar** y después **Confirmar**. Tarda unos minutos; no cierres la pantalla hasta que diga **Listo**.
3. Revisá el stock de algunos productos conocidos (por ejemplo Grava 2-4mm) y la bitácora del día.
4. **Administración › Copia de seguridad › Actualizar Drive ahora** para generar ya las planillas de *Control y Backup*.
5. **Ajustes generales:** confirmá que *Dirección de la aplicación* sea `https://deposito.hidroblan.com.ar/` (la importación la deja así). Las **etiquetas QR impresas antes** apuntan a la planilla de claude.ai: reimprimí las que vayas a escanear.
6. Avisá al equipo la nueva dirección y que instalen la aplicación (paso 10). Desde ese momento, no cargues más en la planilla de claude.ai.

## Paso 10 · Instalar la aplicación

- **PC (Chrome o Edge):** abrí la dirección, ingresá y tocá el ícono **Instalar** (pantalla con flecha) a la derecha de la barra de direcciones. Queda en el escritorio y en el menú Inicio, y se abre en su propia ventana.
- **Celular Android (Chrome):** abrí la dirección, ingresá y tocá **⋮ › Instalar aplicación** (o *Agregar a la pantalla principal › Instalar*). Queda con su ícono como cualquier app. Manteniendo apretado el ícono aparecen atajos a **Recuento de stock** y **Registrar salida**.
- **iPhone (Safari):** botón Compartir › **Agregar a inicio**.

La cámara para escanear QR funciona en vivo desde la aplicación instalada (la primera vez pide permiso de cámara: tocá **Permitir**).

---

## Uso diario y mantenimiento

- **Copias:** todos los días a las 20 h se actualizan las planillas de *Control y Backup* y se guarda *10 Backups/Respaldo AAAA-MM-DD.xlsx*. Los backups diarios se conservan 90 días y el del día 1 de cada mes, siempre.
- **No modificar** la carpeta *00 Sistema* ni la planilla *Base de datos Depósito*: la aplicación depende de ellas.
- Las planillas de *01* a *09* se reescriben cada día: para corregir un dato, hacelo en la aplicación.
- Si cambia la contraseña de la cuenta de la empresa, la aplicación sigue funcionando. Si se **revocan los permisos** de la app en la cuenta, hay que volver a ejecutar **instalar** (paso 2.5).
- **Cerrar sesión:** el círculo con tu inicial, arriba a la derecha.

## Problemas frecuentes

| Qué pasa | Qué hacer |
|---|---|
| *"La cuenta X no está habilitada"* | Un administrador tiene que habilitarla en *Usuarios y permisos*. |
| El botón de Google no aparece o dice *origin_mismatch* | La dirección exacta (con `https://`, sin `/` al final) tiene que estar en *Orígenes autorizados de JavaScript* (paso 3.4). |
| *"La aplicación no coincide con la configuración (CLIENT_ID)"* | El ID de cliente de `apps-script/Config.gs` y el de `web/config.js` tienen que ser iguales. Después de cambiar Config, hacé *Nueva versión* de la implementación. |
| *"El sistema todavía no está instalado"* | Ejecutá **instalar** en Apps Script (paso 2.5). |
| Aparece *"Sin conexión"* abajo | Revisá internet. La aplicación muestra los últimos datos guardados y vuelve a sincronizar sola. |
| Un cambio en GitHub no se ve | En la pestaña **Actions** fijate que el último trabajo tenga tilde verde; después recargá la aplicación. |
