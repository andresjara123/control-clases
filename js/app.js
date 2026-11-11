// Arranque de la aplicación: repositorio, estado, rutas y service worker.
import { Store } from './store.js';
import { LocalRepository } from './repo/localRepository.js';
// import { HttpRepository } from './repo/httpRepository.js';   // ← para la versión con backend
import { h } from './utils/dom.js';
import { toast, confirmar } from './ui.js';
import { vistaInicio } from './views/inicio.js';
import { vistaCalendario } from './views/calendario.js';
import { vistaClases, aplicarFiltros } from './views/clases.js';
import { vistaProgreso } from './views/progreso.js';
import { vistaConfig } from './views/config.js';
import { abrirFormularioClase } from './views/claseForm.js';

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
// Para usar un backend: new Store(new HttpRepository('https://tu-servidor/api', () => ({ Authorization: `Bearer ${token}` })))
const store = new Store(new LocalRepository(storage));
const main = document.getElementById('main');

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

const ctx = {
  store,
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
  if (!store.listo) return;
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

store.iniciar().catch((e) => {
  console.error(e);
  main.replaceChildren(h('p', { class: 'vacio' }, 'No se pudieron cargar los datos. Recarga la página.'));
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker no registrado:', e));
  });
}
