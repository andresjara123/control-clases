// Arranque de la aplicación: repositorio, estado, rutas y service worker.
import { Store } from './store.js';
import { LocalRepository } from './repo/localRepository.js';
import { SUPABASE, nubeConfigurada } from './repo/supabaseConfig.js';
import { SupabaseAuth } from './repo/supabaseAuth.js';
import { SupabaseRepository } from './repo/supabaseRepository.js';
import { SyncRepository } from './repo/syncRepository.js';
import { h } from './utils/dom.js';
import { toast, confirmar } from './ui.js';
import { vistaInicio } from './views/inicio.js';
import { vistaCalendario } from './views/calendario.js';
import { vistaClases, aplicarFiltros } from './views/clases.js';
import { vistaProgreso } from './views/progreso.js';
import { vistaConfig } from './views/config.js';
import { abrirFormularioClase } from './views/claseForm.js';
import { vistaLogin } from './views/cuenta.js';

const RUTAS = {
  inicio: { titulo: 'Inicio', vista: vistaInicio },
  calendario: { titulo: 'Calendario', vista: vistaCalendario },
  clases: { titulo: 'Mis clases', vista: vistaClases },
  progreso: { titulo: 'Mi progreso', vista: vistaProgreso },
  config: { titulo: 'Configuración', vista: vistaConfig },
};

/** Almacenamiento de respaldo si el navegador no deja guardar (p. ej. modo privado). */
class MemoriaTemporal {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

function crearAlmacenamiento() {
  try {
    const s = window.localStorage;
    s.setItem('__prueba', '1');
    s.removeItem('__prueba');
    return { storage: s, persistente: true };
  } catch {
    return { storage: new MemoriaTemporal(), persistente: false };
  }
}

const { storage, persistente } = crearAlmacenamiento();
const MODO_LOCAL = 'control-clases:modo-local';
const local = new LocalRepository(storage);

// Con la clave de Supabase configurada (js/repo/supabaseConfig.js) los datos se guardan también en la nube.
const auth = nubeConfigurada() ? new SupabaseAuth(SUPABASE, storage) : null;
const sync = auth ? new SyncRepository(local, new SupabaseRepository(SUPABASE, auth), auth, storage) : null;
const store = new Store(sync || local);
const main = document.getElementById('main');
const appEl = document.querySelector('.app');
let enLogin = false;
let cerrando = false;

function rutaActual() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return RUTAS[r] ? r : 'inicio';
}

async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast('No se pudo guardar el cambio. Inténtalo de nuevo.');
    return { ok: false, errores: ['No se pudo guardar el cambio.'] };
  }
}

let ultimaRecarga = 0;
async function sincronizar({ avisar = false } = {}) {
  if (!sync || !auth.haySesion() || !store.listo) return;
  try {
    const cambio = await store.recargar();
    if (avisar) toast(sync.resumen().error ? sync.resumen().error : cambio ? '✓ Datos actualizados desde la nube' : '✓ Todo está sincronizado');
  } catch (e) {
    console.error(e);
    if (avisar) toast('No se pudo sincronizar.');
  }
  ultimaRecarga = Date.now();
  if (rutaActual() === 'config') render();
}

function mostrarLogin() {
  enLogin = true;
  appEl.classList.add('login-activo');
  main.replaceChildren(vistaLogin(ctx));
  document.title = 'Entrar · Control de clases';
}

async function salirDelLogin() {
  enLogin = false;
  appEl.classList.remove('login-activo');
  main.replaceChildren(h('p', { class: 'cargando' }, 'Cargando…'));
  await arrancar();
}

const nube = auth && {
  auth,
  sync,
  sincronizar,
  mostrarLogin,
  async alEntrar() {
    storage.removeItem?.(MODO_LOCAL);
    await salirDelLogin();
    toast('✓ Sesión iniciada');
  },
  async usarSinCuenta() {
    storage.setItem(MODO_LOCAL, '1');
    await salirDelLogin();
  },
  async cerrarSesion() {
    await sync.vaciar();
    const pend = sync.resumen().pendientes;
    const ok = await confirmar(
      pend
        ? `Hay ${pend} cambio(s) que aún no se han enviado a la nube y se perderán. ¿Cerrar sesión de todos modos?`
        : 'Se cerrará la sesión y se quitarán los datos de este dispositivo (siguen guardados en la nube). ¿Continuar?',
      { titulo: 'Cerrar sesión', ok: 'Cerrar sesión', peligro: true },
    );
    if (!ok) return;
    cerrando = true;
    await auth.cerrarSesion();
    sync.olvidar();
    await local.reemplazarTodo({ version: 1, clases: [], festivos: [] });
    storage.removeItem?.('control-clases:datos:v1');
    location.hash = '#/inicio';
    location.reload();
  },
};

const ctx = {
  store,
  nube,
  instalarEvento: null,
  toast,
  confirmar,
  run,
  render: () => render(),
  irA(ruta) { location.hash = `#/${ruta}`; },
  irAClases(filtros) { aplicarFiltros(filtros); this.irA('clases'); if (rutaActual() === 'clases') render(); },
  async alternar(id) {
    const antes = store.obtener(id);
    const r = await run(() => store.alternarRealizada(id));
    if (r.ok && antes) {
      if (antes.estado === 'REALIZADA') toast(r.revertidas ? `Clase desmarcada (y ${r.revertidas} del mismo módulo)` : 'Clase desmarcada');
      else toast(r.cubiertas ? `✓ Realizada · se marcaron también ${r.cubiertas} clases del mismo módulo` : '✓ Clase marcada como realizada');
    }
  },
  editar: (clase) => abrirFormularioClase(ctx, { clase }),
  agregar: (fecha) => abrirFormularioClase(ctx, { fecha }),
};

let ultimaRuta = null;
function render() {
  if (!store.listo || enLogin) return;
  const ruta = rutaActual();
  const y = window.scrollY;
  let contenido;
  try {
    contenido = RUTAS[ruta].vista(ctx);
  } catch (e) {
    console.error(e);
    contenido = h('p', { class: 'vacio' }, 'Ocurrió un error al mostrar esta pantalla. Recarga la página.');
  }
  const aviso = persistente ? null : h('p', { class: 'banner' }, '⚠ Tu navegador no permite guardar datos (¿modo privado?). Los cambios se perderán al cerrar la página.');
  main.replaceChildren(...[aviso, contenido].filter(Boolean));
  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${RUTAS[ruta].titulo} · Control de clases`;
  if (ruta === ultimaRuta) {
    window.scrollTo(0, y);
  } else {
    window.scrollTo(0, 0);
    if (ultimaRuta !== null) main.focus({ preventScroll: true });
  }
  ultimaRuta = ruta;
}

store.subscribe(render);
window.addEventListener('hashchange', render);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  ctx.instalarEvento = e;
  if (rutaActual() === 'config') render();
});
window.addEventListener('appinstalled', () => {
  ctx.instalarEvento = null;
  toast('✓ App instalada');
  if (rutaActual() === 'config') render();
});

async function arrancar() {
  if (auth && !auth.haySesion() && storage.getItem(MODO_LOCAL) !== '1') {
    mostrarLogin();
    return;
  }
  await store.iniciar();
}

arrancar().catch((e) => {
  console.error(e);
  main.replaceChildren(h('p', { class: 'vacio' }, 'No se pudieron cargar los datos. Recarga la página.'));
});

if (sync) {
  // Indicador de nube en el encabezado.
  const chip = document.getElementById('nube');
  const pintarNube = () => {
    if (!chip) return;
    const r = sync.resumen();
    chip.hidden = !r.conSesion;
    if (!r.conSesion) return;
    if (r.error) { chip.textContent = '☁️ ⚠'; chip.title = r.error; }
    else if (r.sincronizando || r.pendientes) { chip.textContent = '☁️ ↻'; chip.title = 'Sincronizando…'; }
    else { chip.textContent = '☁️ ✓'; chip.title = 'Guardado en la nube'; }
    if (rutaActual() === 'config' && store.listo && !enLogin && !document.querySelector('dialog[open]') && !document.activeElement?.closest?.('textarea,input')) render();
  };
  sync.onCambio(pintarNube);
  auth.onCambio(pintarNube);
  pintarNube();
  auth.onCambio(() => {
    if (!auth.haySesion() && store.listo && !enLogin && !cerrando) toast('Tu sesión venció. Inicia sesión de nuevo en Configuración.');
  });
  // Traer lo hecho en otros dispositivos al volver a la app o recuperar la conexión.
  const refrescar = () => { if (Date.now() - ultimaRecarga > 15000) sincronizar(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescar(); });
  window.addEventListener('online', () => { ultimaRecarga = 0; refrescar(); });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker no registrado:', e));
  });
}
