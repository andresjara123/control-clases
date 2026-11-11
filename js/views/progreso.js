// Mi progreso: avance general y por categoría, módulo por módulo.
import { h } from '../utils/dom.js';
import { CATEGORIAS, ORDEN_CATEGORIAS, etiquetaHorario } from '../config.js';
import { progresoCategoria, progresoGeneral } from '../logic.js';
import { ahoraLocal, fechaCorta, fechaHoraLegible } from '../utils/dates.js';
import { barra } from '../ui.js';

export function vistaProgreso(ctx) {
  const { store } = ctx;
  const ahora = ahoraLocal(store.reloj());
  const g = progresoGeneral(store.clases);

  const general = h(
    'section',
    { class: 'card hero' },
    h('div', { class: 'hero-top' }, h('div', {}, h('p', { class: 'etiqueta' }, 'Avance total'), h('p', { class: 'hero-pct' }, `${g.pct}%`)), h('p', { class: 'hero-detalle' }, `${g.vistos} de ${g.total} módulos`)),
    barra(g.pct, 'barra-grande'),
  );

  const tarjetas = ORDEN_CATEGORIAS.map((k) => {
    const cat = CATEGORIAS[k];
    const p = progresoCategoria(store.clases, k, ahora);
    const filas = p.modulos.map((m) => {
      let detalle;
      if (m.realizado) detalle = `Realizado${m.fechaRealizada ? ` · ${fechaHoraLegible(m.fechaRealizada)}` : ''}`;
      else if (m.proxima) detalle = `Pendiente · próxima: ${fechaCorta(m.proxima.fecha)}, ${etiquetaHorario(m.proxima.inicio, m.proxima.fin)}${m.opciones > 1 ? ` (+${m.opciones - 1} más)` : ''}`;
      else detalle = 'Pendiente · sin clases programadas';
      return h(
        'div',
        { class: `modulo ${m.realizado ? 'hecho' : ''}`, dataset: { modulo: `${k}-${m.modulo}` } },
        h('span', { class: 'marca', 'aria-hidden': 'true' }, '✓'),
        h('div', { class: 'modulo-txt' }, h('strong', {}, `Módulo ${m.modulo}`), h('span', {}, detalle)),
        h('button', { class: 'btn btn-chico', type: 'button', onclick: () => ctx.irAClases({ categoria: k, modulo: String(m.modulo) }), 'aria-label': `Ver clases de ${cat.nombre} módulo ${m.modulo}` }, 'Ver clases'),
      );
    });
    return h(
      'section',
      { class: `card prog-cat ${cat.clase}`, dataset: { categoria: k } },
      h('div', { class: 'prog-cab' }, h('span', { 'aria-hidden': 'true', class: 'sig-icono' }, cat.icono), h('h2', {}, cat.nombre.toUpperCase()), h('span', { class: 'cuenta' }, `${p.vistos}/${p.total}`)),
      barra(p.pct),
      h('p', { class: 'nota' }, `${p.pct}% completado`),
      h('div', { class: 'modulos' }, filas),
    );
  });

  return h('div', {}, h('h2', { class: 'titulo-vista', style: 'margin-bottom:10px' }, 'Mi progreso'), general, h('div', { class: 'prog-grid' }, tarjetas));
}
