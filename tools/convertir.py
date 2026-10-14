#!/usr/bin/env python3
"""
Convierte la planilla de claude.ai (deposito.html) en la aplicación web
independiente (web/index.html). Se usó una sola vez para la migración; desde
ese momento web/index.html es el archivo que se modifica.

    python3 tools/convertir.py ruta/a/deposito.html web/index.html
"""
import sys, re

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()

def rep(a, b, n=1):
    global s
    c = s.count(a)
    if c != n:
        raise SystemExit(f'No se encontró exactamente {n} vez/veces ({c}): {a[:80]!r}')
    s = s.replace(a, b)

# ---------- textos propios de claude.ai ----------
rep('banner("Abrí esta planilla desde claude.ai para conectarla con la base de datos.","bad")',
    'banner("No se pudo cargar el adaptador de la aplicación. Recargá la página.","bad")')
rep('banner("No se pudo conectar con la base de datos. Iniciá sesión en claude.ai y volvé a abrir la planilla.","bad")',
    'banner("No se pudo conectar con el servidor. Revisá la conexión y recargá la página.","bad")')
rep('toast("Tu acceso en Compartir es de solo lectura.")', 'toast("Tu perfil es de solo consulta.")')

# ---------- usuarios y permisos: acceso por cuenta de Google ----------
rep('<th>Acceso en Compartir</th><th>Perfil en la planilla</th>', '<th>Acceso</th><th>Perfil</th>')
rep('<span class="meta">Personas que ya usaron la planilla o tienen un perfil asignado</span>',
    '<span class="meta">Cuentas de Google habilitadas o que ya ingresaron</span>')
rep('<div class="lb">Asignar perfil a otra persona de la organización</div>', '<div class="lb">Habilitar a una persona</div>')
rep('placeholder="Buscar por nombre o apellido (ej.: Constanza)"', 'placeholder="Email de Google de la persona (ej.: juan.perez@gmail.com)"')
rep('<p class="hint" style="margin:0">Sirve para dejar asignado el perfil antes de que la persona entre por primera vez.</p>',
    '<p class="hint" style="margin:0">Escribí el email completo y elegí el perfil. Desde ese momento la persona puede ingresar con esa cuenta de Google.</p>')
s = re.sub(r'<div class="lb">Cómo se combinan los permisos</div>\s*<ul class="steps" style="list-style:disc">.*?</ul>',
    '''<div class="lb">Cómo funciona el acceso</div>
      <ul class="steps" style="list-style:disc">
        <li>Solo pueden ingresar las cuentas de Google que tengan un perfil asignado acá. Cualquier otra cuenta ve un aviso de que no está habilitada.</li>
        <li><b>Consulta</b> ve, exporta e imprime · <b>Depósito</b> además registra movimientos, bitácora, recuentos y notas de pedido · <b>Administrador</b> además cambia catálogo, ajustes y perfiles.</li>
        <li>Para quitarle el acceso a alguien, elegí <b>Sin acceso</b>. Se le cierra la sesión en todos sus dispositivos.</li>
        <li>La cuenta dueña de los datos (la que instaló el sistema) siempre es Administrador.</li>
      </ul>''', s, count=1, flags=re.S)
rep('<option value="">Según Compartir</option>', '<option value="">Sin acceso</option>')
rep('`${nm}: perfil según Compartir`', '`${nm}: sin acceso`')
rep('"Sos la propietaria de la planilla.":ROLE===SHARE_ROLE?"Según tu acceso en Compartir.":"Asignado en la planilla."',
    '"Cuenta dueña de los datos.":"Asignado en la aplicación."')
rep('<span class="meta">Propietaria · Administrador</span>', '<span class="meta">Dueña de los datos · Administrador</span>')
rep("'<span title=\"Todavía no abrió la planilla con permiso de escritura\">—</span>'", "'<span title=\"Todavía no ingresó\">—</span>'")
# solo personas reales (email); los identificadores de claude.ai quedan como alias
m = re.search(r'(function vigentes\(\)\{.*?)return Array\.from\(ids\);', s, flags=re.S)
if not m: raise SystemExit('vigentes() no encontrado')
s = s[:m.start()] + m.group(1) + 'return Array.from(ids).filter(id=>/@/.test(id));' + s[m.end():]

# ---------- aviso de copia en Inicio: en esta versión la copia es automática (Drive, 20 h) ----------
rep('hb.innerHTML=roleOk("admin")&&S.config&&(d==null||d>=7)?', 'hb.innerHTML=false?')

# ---------- fotos/PDF: dirección relativa (funciona también en usuario.github.io/deposito/) ----------
rep('const attUrl=a=>"/_blob/"+a.id;', 'const attUrl=a=>"_blob/"+a.id;')

rep('<label class="lb" for="c-url">Enlace de esta planilla</label>', '<label class="lb" for="c-url">Dirección de la aplicación</label>')
rep('placeholder="https://claude.ai/artifact/…"', 'placeholder="https://deposito.hidroblan.com.ar/"')

# ---------- accesos directos (#ruta=…) ----------
rep('function readHash(){const h=decodeURIComponent((location.hash||"").slice(1));if(!h)return;',
    'function readHash(){const h=decodeURIComponent((location.hash||"").slice(1));if(!h)return;if(/^ruta=/.test(h)){go(h.slice(5));history.replaceState(null,"",location.pathname);return}')
rep('pendingHash=decodeURIComponent((location.hash||"").slice(1))||null;',
    'pendingHash=decodeURIComponent((location.hash||"").slice(1))||null;if(pendingHash&&/^ruta=/.test(pendingHash)){go(pendingHash.slice(5));pendingHash=null;history.replaceState(null,"",location.pathname)}')

# ---------- menú: Pasar datos de la planilla anterior ----------
rep('''    {id:"respaldo",name:"Copia de seguridad",view:"backup",need:"admin"}]}''',
    '''    {id:"respaldo",name:"Copia de seguridad",view:"backup",need:"admin"},
    {id:"migrar",name:"Pasar datos de la planilla anterior",view:"migrar",need:"admin"}]}''')
rep('  if(view==="backup")renderBackup();', '  if(view==="backup")renderBackup();\n  if(view==="migrar")renderMigrar();')

# ---------- Copia de seguridad: carpeta de Drive ----------
rep('''  <section id="v-camtest" data-view="camtest" hidden>''', '''  <section id="v-migrar" data-view="migrar" hidden>
    <div class="section-head"><div><h2>Pasar datos de la planilla anterior</h2><p class="sub">Trae todo lo cargado en la planilla de claude.ai: productos, movimientos, bitácora, documentos, notas de pedido, recuentos, fotos y PDF.</p></div></div>
    <div class="card" style="padding:14px 16px;display:grid;gap:12px">
      <ol class="steps">
        <li>En la planilla anterior (claude.ai) entrá a <b>Administración › Copia de seguridad</b> y descargá <b>la copia completa (Excel)</b> y <b>las fotos y PDF (ZIP)</b>.</li>
        <li>Elegí los dos archivos acá abajo y revisá el resumen.</li>
        <li>Tocá <b>Importar</b>. Tarda unos minutos; no cierres esta pantalla hasta que termine.</li>
      </ol>
      <div class="grid2" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
        <label class="field"><span class="lb">Copia completa (.xlsx)</span><input type="file" id="mg-xlsx" accept=".xlsx"></label>
        <label class="field"><span class="lb">Fotos y PDF (.zip, opcional)</span><input type="file" id="mg-zip" accept=".zip"></label>
      </div>
      <div id="mg-sum"></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mg-reset" checked> Reemplazar todos los datos actuales de esta aplicación</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="mg-go" disabled>Importar</button><span class="meta" id="mg-st"></span></div>
    </div>
  </section>
  <section id="v-camtest" data-view="camtest" hidden>''')
rep('''      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn primary" id="bk-go">''',
    '''      <div class="card" id="bk-drive" style="padding:12px 14px;display:grid;gap:8px;background:var(--surface-2)">
        <div class="lb">Carpeta «Control y Backup» en Google Drive</div>
        <div class="meta" id="bk-drive-st">Todos los días a las 20 h se actualizan las planillas de stock e historiales y se guarda una copia completa con fecha.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" id="bk-drive-open" target="_blank" rel="noopener" hidden>Abrir la carpeta en Drive</a><button class="btn" id="bk-drive-now">Actualizar Drive ahora</button></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn primary" id="bk-go">''')

js = r'''
/* ---------- Google Drive: carpeta Control y Backup ---------- */
async function bkDrive(){if(!window.DEP)return;try{const j=await DEP.call("info");const a=$("#bk-drive-open");if(j.carpeta){a.href=j.carpeta;a.hidden=false}
  let u=null;try{u=j.ultimaExportacion&&JSON.parse(j.ultimaExportacion)}catch(e){}
  if(u)$("#bk-drive-st").textContent=`Última actualización: ${fmtD(u.fecha)}${u.errores&&u.errores.length?" · con avisos: "+u.errores.join("; "):""} · Se actualiza sola todos los días a las 20 h.`}catch(e){}}
$("#bk-drive-now").addEventListener("click",async()=>{if(!guardWrite("admin"))return;const b=$("#bk-drive-now");b.disabled=true;b.textContent="Actualizando… (puede tardar 1 o 2 minutos)";
  try{await DEP.call("exportNow");toast("Carpeta de Drive actualizada.");bkDrive()}catch(e){toast("No se pudo actualizar Drive: "+(e.message||"error"))}finally{b.disabled=false;b.textContent="Actualizar Drive ahora"}});
/* ---------- pasar datos de la planilla anterior ---------- */
const MG={ops:null,zip:null,man:null,legacy:[]};
function renderMigrar(){if($("#v-migrar").hidden)return;const s=$("#mg-sum");
  if(!MG.ops){s.innerHTML='<div class="meta">Elegí la copia completa para ver el resumen.</div>';$("#mg-go").disabled=true;return}
  const NOM={products:"Productos",movimientos:"Movimientos",bitacora:"Bitácora",documentos:"Documentos de respaldo",pedidos:"Notas de pedido",recuentos:"Recuentos",proveedores:"Proveedores",clientes:"Clientes",trepanos:"Trépanos",trepanos_mov:"Movimientos de trépanos",sugerencias:"Sugerencias",perfiles:"Perfiles",usuarios:"Usuarios",config:"Ajustes generales"};const cnt={};MG.ops.forEach(o=>{const k=/^recuentos\/[^/]+\/lineas$/.test(o.p)?"Líneas de recuento":(NOM[o.p]||o.p);cnt[k]=(cnt[k]||0)+1});
  const me=(window.DEP&&DEP.user()&&DEP.user().email)||"";
  s.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Datos</th><th class="r">Registros</th></tr></thead><tbody>${Object.keys(cnt).sort().map(k=>`<tr><td>${esc(k)}</td><td class="r">${cnt[k]}</td></tr>`).join("")}<tr><td><b>Fotos y PDF</b></td><td class="r">${MG.man?Object.keys(MG.man).length:'<span class="meta">sin ZIP</span>'}</td></tr></tbody></table></div>`+
    (MG.legacy.length?`<div class="lb" style="margin-top:10px">Usuarios de la planilla anterior</div><p class="hint" style="margin:0 0 6px">Los registros guardan quién los cargó. Indicá el email de Google de cada uno para que se vea su nombre.</p>`+MG.legacy.map((id,i)=>`<label class="field"><span class="meta">Usuario ${i+1} (${MG.legacy.length>1?esc(id.slice(0,8))+"…":"quien cargó los datos"})</span><input type="email" data-mgal="${esc(id)}" value="${esc(me)}"></label>`).join(""):"");
  $("#mg-go").disabled=false}
$("#mg-xlsx").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;$("#mg-st").textContent="Leyendo…";
  try{await loadXlsx();const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});const ws=wb.Sheets["Respaldo completo"];if(!ws)throw new Error("El archivo no tiene la hoja «Respaldo completo». Usá la copia completa descargada desde Administración › Copia de seguridad.");
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true}).slice(1).filter(r=>r[0]&&r[1]!=="");const ops=[],leg=new Set();
    rows.forEach(r=>{const d=JSON.parse(r.slice(2).join(""));ops.push({op:"set",p:String(r[0]),id:String(r[1]),d});["by","byId","cerradoPorId","asignadoPor"].forEach(k=>{if(d[k]&&!/@/.test(d[k]))leg.add(String(d[k]))});if(r[0]==="usuarios"&&!/@/.test(r[1]))leg.add(String(r[1]))});
    MG.ops=ops;MG.legacy=Array.from(leg);$("#mg-st").textContent="";renderMigrar()}catch(err){MG.ops=null;$("#mg-st").textContent="";toast(err.message||"No se pudo leer el archivo.");renderMigrar()}});
$("#mg-zip").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;$("#mg-st").textContent="Leyendo ZIP…";
  try{await loadZip();MG.zip=await JSZip.loadAsync(f);const m=MG.zip.file("manifiesto.json");if(!m)throw new Error("El ZIP no es el de «Descargar fotos y PDF».");MG.man=JSON.parse(await m.async("string")).archivos||{};$("#mg-st").textContent="";renderMigrar()}
  catch(err){MG.zip=null;MG.man=null;$("#mg-st").textContent="";toast(err.message||"No se pudo leer el ZIP.");renderMigrar()}});
$("#mg-go").addEventListener("click",async()=>{if(!guardWrite("admin")||!MG.ops)return;const b=$("#mg-go"),st=$("#mg-st"),reset=$("#mg-reset").checked;
  if(reset&&!b.dataset.ok){b.dataset.ok="1";b.textContent="Confirmar: reemplazar los datos actuales";setTimeout(()=>{delete b.dataset.ok;b.textContent="Importar"},8000);return}
  delete b.dataset.ok;b.disabled=true;b.textContent="Importando…";
  try{if(reset){st.textContent="Borrando datos actuales…";await DEP.call("importReset",{confirm:"BORRAR TODO"})}
    const base=location.origin+location.pathname.replace(/index\.html$/,"");
    const ops=MG.ops.map(o=>o.p==="config"&&o.id==="app"?Object.assign({},o,{d:Object.assign({},o.d,{baseUrl:base})}):o);
    for(let i=0;i<ops.length;i+=200){st.textContent=`Datos: ${Math.min(i+200,ops.length)} de ${ops.length}…`;await DEP.call("import",{ops:ops.slice(i,i+200)})}
    let nf=0,ff=0;const ids=MG.man?Object.keys(MG.man):[];
    for(const id of ids){const a=MG.man[id];st.textContent=`Fotos y PDF: ${nf+ff+1} de ${ids.length}…`;
      try{const zf=MG.zip.file(a.archivo);if(!zf)throw 0;await DEP.call("importFile",{id,name:a.nombre||id,type:a.tipo,b64:await zf.async("base64")});nf++}catch(e){ff++}}
    const pares=$$("[data-mgal]").map(i=>[i.dataset.mgal,i.value.trim()]).filter(p=>p[1]);if(pares.length)await DEP.call("importAlias",{pares});
    st.textContent="Actualizando la pantalla…";await DEP.resync();
    st.textContent=`Listo: ${ops.length} registros${ids.length?` y ${nf} archivos`:""}${ff?` (${ff} archivos no se pudieron subir)`:""}.`;toast("Datos importados.")}
  catch(e){console.error(e);st.textContent="";toast("Se cortó la importación: "+(e.message||"error")+". Podés volver a intentarlo.")}
  finally{b.disabled=false;b.textContent="Importar"}});
'''
rep('/* ---------- export / labels ---------- */', js + '/* ---------- export / labels ---------- */')
rep('''  if(u&&u.byId&&user&&user.profiles)''', '''  bkDrive();
  if(u&&u.byId&&user&&user.profiles)''')

# ---------- estilos de ingreso, usuario y conexión ----------
css = '''
#dep-gate{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:var(--bg);padding:16px}
#dep-gate[hidden]{display:none}
#dep-gate .dg-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:28px 24px;max-width:380px;width:100%;display:grid;gap:10px;justify-items:center;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}
#dep-gate h1{font-family:var(--f-display);font-size:34px;margin:0;letter-spacing:.02em}
#dep-gate .dg-sub{margin:0;color:var(--muted)}
#dep-gate .dg-msg{margin:4px 0;min-height:1.2em;color:var(--muted)}
#dep-gate .dg-msg.bad{color:var(--bad)}
#dep-gate .dg-foot{font-size:13px;color:var(--muted);margin:6px 0 0}
#dep-gate #dg-dev{display:grid;gap:8px;width:100%}
#dep-user{position:relative;margin-left:8px}
#dep-user-btn{padding:4px;border-radius:50%;width:38px;height:38px;display:grid;place-items:center}
#dep-user-btn img{width:30px;height:30px;border-radius:50%}
#dep-user .dep-ini{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--accent-ink);font-weight:600;font-size:13px}
#dep-user-pop{position:absolute;right:0;top:44px;z-index:60;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;gap:6px;min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,.12)}
#dep-user-pop[hidden]{display:none}
#dep-offline{position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:80;background:var(--warn-soft);color:var(--warn);border-radius:10px;padding:8px 14px;font-size:14px;max-width:calc(100% - 32px)}
#dep-offline[hidden]{display:none}
'''
s = s.replace('<style>', '<style>' + css, 1)

head = '''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0c5a7a">
<meta name="description" content="Control de stock del depósito de Hidroblan Perforaciones">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/favicon.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<script src="config.js"></script>
<script src="shim.js"></script>
'''
# el archivo de claude.ai empieza con <title>, <link> y <style>: van al <head>
i = s.index('<header class="top">')
pre, body = s[:i], s[i:]
out = head + pre + '</head>\n<body>\n' + body + '\n</body>\n</html>\n'
open(dst, 'w', encoding='utf-8').write(out)
print('OK', dst, len(out))
