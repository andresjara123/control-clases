// Calendario mensual con las clases de cada día y panel del día seleccionado.
import { h } from '../utils/dom.js';
import { CATEGORIAS, ORDEN_CATEGORIAS, MESES } from '../config.js';
import { clasesDelDia, festivoDe, codigoClase } from '../logic.js';
import { hoyISO, toISO, matrizMes, sumarMeses, fechaLarga, nombreMes } from '../utils/dates.js';
import { claseCard } from '../ui.js';

const vista = { anio: null, mes0: null, sel: null };
const CABECERA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function pill(c) {
  const cat = CATEGORIAS[c.categoria];
  return h(
    'span',
    { class: `pill ${cat ? cat.clase : ''} est-${String(c.estado).toLowerCase()}` },
    h('span', { class: 'corto' }, codigoClase(c)),
    h('span', { class: 'largo' }, cat ? `${cat.nombre} ${c.modulo}` : codigoClase(c)),
    c.estado === 'REALIZADA' ? h('span', { class: 'ok', 'aria-hidden': 'true' }, '✓') : null,
  );
}

export function vistaCalendario(ctx) {
  const { store } = ctx;
  const reloj = store.reloj();
  const hoy = hoyISO(reloj);
  if (vista.anio === null) {
    vista.anio = reloj.getFullYear();
    vista.mes0 = reloj.getMonth();
    vista.sel = hoy;
  }
  const prefijo = `${vista.anio}-${String(vista.mes0 + 1).padStart(2, '0')}`;
  if (!vista.sel || !vista.sel.startsWith(prefijo)) vista.sel = `${prefijo}-01`;

  const cambiarMes = (delta) => {
    const n = sumarMeses(vista.anio, vista.mes0, delta);
    vista.anio = n.anio;
    vista.mes0 = n.mes0;
    ctx.render();
  };
  const irAHoy = () => {
    vista.anio = reloj.getFullYear();
    vista.mes0 = reloj.getMonth();
    vista.sel = hoy;
    ctx.render();
  };

  const nav = h(
    'div',
    { class: 'cal-nav' },
    h('button', { class: 'btn btn-icono', type: 'button', 'aria-label': 'Mes anterior', onclick: () => cambiarMes(-1) }, '‹'),
    h('h2', { 'aria-live': 'polite' }, `${MESES[vista.mes0]} ${vista.anio}`),
    h('button', { class: 'btn btn-chico', type: 'button', onclick: irAHoy }, 'Hoy'),
    h('button', { class: 'btn btn-icono', type: 'button', 'aria-label': 'Mes siguiente', onclick: () => cambiarMes(1) }, '›'),
  );

  const leyenda = h(
    'div',
    { class: 'leyenda', 'aria-label': 'Leyenda de colores' },
    ORDEN_CATEGORIAS.map((k) => h('span', { class: `ley ${CATEGORIAS[k].clase}` }, h('i', { class: 'punto' }), CATEGORIAS[k].nombre)),
    h('span', { class: 'ley ley-fest' }, h('i', { class: 'punto' }), 'Festivo'),
    h('span', { class: 'ley' }, h('i', { class: 'ok-mini' }, '✓'), 'Realizada'),
  );

  const celda = (d) => {
    const iso = toISO(d);
    const cls = clasesDelDia(store.clases, iso);
    const fest = festivoDe(store.festivos, iso);
    const hechas = cls.filter((c) => c.estado === 'REALIZADA').length;
    const etiqueta = `${d.getDate()} de ${nombreMes(d.getMonth())}${fest ? ', festivo' : ''}, ${cls.length} ${cls.length === 1 ? 'clase' : 'clases'}${hechas ? `, ${hechas} realizadas` : ''}`;
    const extra = cls.length > 4 ? h('span', { class: 'dia-fest' }, `+${cls.length - 4} más`) : null;
    return h(
      'button',
      {
        type: 'button',
        class: ['dia', iso === hoy ? 'hoy' : '', iso === vista.sel ? 'sel' : '', fest ? 'festivo' : '', d.getDay() === 0 ? 'domingo' : ''].filter(Boolean).join(' '),
        'aria-label': etiqueta,
        'aria-pressed': iso === vista.sel ? 'true' : 'false',
        dataset: { fecha: iso },
        onclick: () => { vista.sel = iso; ctx.render(); },
      },
      h('span', { class: 'dia-num' }, d.getDate()),
      fest ? h('span', { class: 'dia-fest' }, 'Festivo') : null,
      h('div', { class: 'pills' }, cls.slice(0, 4).map(pill), extra),
    );
  };

  const semanas = matrizMes(vista.anio, vista.mes0);
  const grid = h(
    'div',
    { class: 'cal-grid', role: 'group', 'aria-label': `Calendario de ${MESES[vista.mes0]} ${vista.anio}` },
    semanas.flat().map((d) => (d ? celda(d) : h('div', { class: 'dia vacio', 'aria-hidden': 'true' }))),
  );

  // ---- Panel del día seleccionado
  const delDia = clasesDelDia(store.clases, vista.sel);
  const fest = festivoDe(store.festivos, vista.sel);
  const panel = h(
    'section',
    { class: 'panel-dia', 'aria-label': 'Clases del día seleccionado' },
    h(
      'div',
      { class: 'titulo-fila' },
      h('h2', {}, fechaLarga(vista.sel)),
      h('button', { class: 'btn btn-chico', type: 'button', onclick: () => ctx.agregar(vista.sel) }, '＋ Agregar clase'),
    ),
    fest ? h('p', { class: 'vacio' }, `🎉 ${fest.nombre}: no hay clases.`) : null,
    delDia.length
      ? h('div', { class: 'lista' }, delDia.map((c) => claseCard(ctx, c, { mostrarFecha: false })))
      : fest
        ? null
        : h('p', { class: 'vacio' }, 'No hay clases este día.'),
  );

  return h('div', {}, nav, leyenda, h('div', { class: 'cal-cab', 'aria-hidden': 'true' }, CABECERA.map((d) => h('span', {}, d))), grid, panel);
}
