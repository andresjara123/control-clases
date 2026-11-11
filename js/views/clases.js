// Mis clases: lista con filtros (fecha, categoría, módulo, estado) y orden por fecha.
import { h } from '../utils/dom.js';
import { CATEGORIAS, ORDEN_CATEGORIAS, ESTADOS, ORDEN_ESTADOS } from '../config.js';
import { filtrarClases } from '../logic.js';
import { hoyISO, fechaLarga } from '../utils/dates.js';
import { claseCard } from '../ui.js';

const VACIOS = { desde: '', hasta: '', categoria: '', modulo: '', estado: '', orden: 'asc' };
let filtros = { ...VACIOS };
let panelAbierto = false;
let forzarAbierto = false;

/** Reemplaza los filtros (lo usan Inicio y Mi progreso para saltar a la lista ya filtrada). */
export function aplicarFiltros(nuevos = {}) {
  filtros = { ...VACIOS, ...nuevos };
  forzarAbierto = Object.entries(filtros).some(([k, v]) => k !== 'orden' && v !== '');
}

export function vistaClases(ctx) {
  const { store } = ctx;
  const hoy = hoyISO(store.reloj());
  // Se conserva abierto/cerrado el panel de filtros leyendo el estado actual del DOM.
  const previo = document.querySelector('details.filtros');
  if (forzarAbierto) { panelAbierto = true; forzarAbierto = false; }
  else if (previo) panelAbierto = previo.open;
  const activos = Object.entries(filtros).filter(([k, v]) => k !== 'orden' && v !== '').length;

  const cambiar = (campo) => (e) => {
    filtros[campo] = e.target.value;
    if (campo === 'categoria' && filtros.modulo && Number(filtros.modulo) > (CATEGORIAS[filtros.categoria]?.modulos ?? 99)) filtros.modulo = '';
    ctx.render();
  };

  const maxMod = filtros.categoria ? CATEGORIAS[filtros.categoria].modulos : 6;
  const selCat = h(
    'select',
    { class: 'campo', id: 'f-cat', onchange: cambiar('categoria'), value: filtros.categoria },
    h('option', { value: '' }, 'Todas'),
    ORDEN_CATEGORIAS.map((k) => h('option', { value: k }, CATEGORIAS[k].nombre)),
  );
  const mods = [];
  for (let n = 1; n <= maxMod; n++) mods.push(h('option', { value: String(n) }, `Módulo ${n}`));
  const selMod = h('select', { class: 'campo', id: 'f-mod', onchange: cambiar('modulo'), value: filtros.modulo }, h('option', { value: '' }, 'Todos'), mods);
  const selEst = h(
    'select',
    { class: 'campo', id: 'f-est', onchange: cambiar('estado'), value: filtros.estado },
    h('option', { value: '' }, 'Todos'),
    ORDEN_ESTADOS.map((k) => h('option', { value: k }, `${ESTADOS[k].nombre}s`)),
  );
  const selOrden = h(
    'select',
    { class: 'campo', id: 'f-ord', onchange: cambiar('orden'), value: filtros.orden },
    h('option', { value: 'asc' }, 'Más antiguas primero'),
    h('option', { value: 'desc' }, 'Más recientes primero'),
  );

  const panel = h(
    'details',
    { class: 'card filtros', open: panelAbierto },
    h('summary', {}, `🔎 Filtros${activos ? ` (${activos} activo${activos > 1 ? 's' : ''})` : ''}`),
    h(
      'div',
      { class: 'filtros-grid' },
      h('label', { class: 'etq' }, 'Desde', h('input', { class: 'campo', type: 'date', id: 'f-desde', value: filtros.desde, onchange: cambiar('desde') })),
      h('label', { class: 'etq' }, 'Hasta', h('input', { class: 'campo', type: 'date', id: 'f-hasta', value: filtros.hasta, onchange: cambiar('hasta') })),
      h('label', { class: 'etq' }, 'Categoría', selCat),
      h('label', { class: 'etq' }, 'Módulo', selMod),
      h('label', { class: 'etq' }, 'Estado', selEst),
      h('label', { class: 'etq' }, 'Orden por fecha', selOrden),
      h('button', { class: 'btn ancho', type: 'button', onclick: () => { filtros = { ...VACIOS }; ctx.render(); } }, 'Limpiar filtros'),
    ),
  );

  const lista = filtrarClases(store.clases, filtros);
  const grupos = [];
  for (const c of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha === c.fecha) ultimo.clases.push(c);
    else grupos.push({ fecha: c.fecha, clases: [c] });
  }

  const cuerpo = grupos.length
    ? grupos.map((g) =>
        h(
          'section',
          { 'aria-label': fechaLarga(g.fecha) },
          h('h3', { class: 'fecha-grupo' }, fechaLarga(g.fecha), g.fecha === hoy ? h('span', { class: 'tag tag-hoy' }, 'Hoy') : null),
          h('div', { class: 'lista' }, g.clases.map((c) => claseCard(ctx, c, { mostrarFecha: false }))),
        ),
      )
    : h('p', { class: 'vacio' }, 'No hay clases con estos filtros.');

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'titulo-fila' },
      h('h2', { class: 'titulo-vista' }, 'Mis clases'),
      h('button', { class: 'btn btn-chico btn-primario', type: 'button', onclick: () => ctx.agregar('') }, '＋ Agregar'),
    ),
    panel,
    h('p', { class: 'resultado-info', role: 'status' }, `Mostrando ${lista.length} de ${store.clases.length} clases`),
    cuerpo,
  );
}
