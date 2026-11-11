// Inicio: avance general, tarjetas de resumen, siguiente módulo pendiente y clases de hoy.
import { h } from '../utils/dom.js';
import { CATEGORIAS, etiquetaHorario } from '../config.js';
import { resumen, progresoGeneral, siguientePendiente, clasesDelDia, festivoDe, nombreClase } from '../logic.js';
import { ahoraLocal, hoyISO, fechaLarga } from '../utils/dates.js';
import { barra, claseCard } from '../ui.js';

export function vistaInicio(ctx) {
  const { store } = ctx;
  const reloj = store.reloj();
  const hoy = hoyISO(reloj);
  const r = resumen(store.clases);
  const g = progresoGeneral(store.clases);
  const sig = siguientePendiente(store.clases, ahoraLocal(reloj));
  const baseClases = r.realizadas + r.pendientes;

  const hero = h(
    'section',
    { class: 'card hero', 'aria-label': 'Avance del curso' },
    h(
      'div',
      { class: 'hero-top' },
      h('div', {}, h('p', { class: 'etiqueta' }, 'Avance del curso'), h('p', { class: 'hero-pct', id: 'pct-curso' }, `${g.pct}%`)),
      h('p', { class: 'hero-detalle' }, `${g.vistos} de ${g.total} módulos vistos`),
    ),
    barra(g.pct, 'barra-grande'),
    h('div', { class: 'hero-sub' }, h('span', {}, `Clases realizadas: ${r.realizadas} de ${baseClases}`), h('span', {}, `${r.pctClases}%`)),
    barra(r.pctClases, 'barra-fina'),
    h('p', { class: 'nota' }, 'Un módulo cuenta como visto cuando marcas como realizada cualquiera de sus clases del calendario.'),
  );

  const stat = (valor, etiqueta, clase, estado) =>
    h(
      'button',
      { class: `stat ${clase}`, type: 'button', onclick: () => ctx.irAClases({ estado }), 'aria-label': `${etiqueta}: ${valor}. Ver lista` },
      h('span', { class: 'stat-num' }, valor),
      h('span', { class: 'stat-et' }, etiqueta),
    );
  const stats = h(
    'section',
    { class: 'stats', 'aria-label': 'Resumen de clases' },
    stat(r.total, 'Programadas', 's-total', ''),
    stat(r.realizadas, 'Realizadas', 's-real', 'REALIZADA'),
    stat(r.pendientes, 'Pendientes', 's-pend', 'PENDIENTE'),
    stat(r.canceladas, 'Canceladas', 's-canc', 'CANCELADA'),
  );

  const sinProg = sig.sinProgramar.map((m) => nombreClase(m)).join(', ');
  let siguiente;
  if (sig.clase) {
    const c = sig.clase;
    const cat = CATEGORIAS[c.categoria];
    siguiente = h(
      'section',
      { class: `card siguiente ${cat.clase}`, 'aria-label': 'Siguiente módulo pendiente' },
      h('p', { class: 'etiqueta' }, 'Siguiente módulo pendiente'),
      h(
        'div',
        { class: 'sig-cuerpo' },
        h('span', { class: 'sig-icono', 'aria-hidden': 'true' }, cat.icono),
        h(
          'div',
          {},
          h('h2', {}, `${cat.nombre} ${c.modulo}`),
          h('p', {}, fechaLarga(c.fecha)),
          h('p', {}, etiquetaHorario(c.inicio, c.fin)),
        ),
      ),
      h('div', { class: 'sig-fila' }, c.fecha === hoy ? h('span', { class: 'tag tag-hoy' }, 'Hoy') : null),
      h('button', { class: 'btn btn-grande btn-primario', type: 'button', onclick: () => ctx.alternar(c.id) }, 'Marcar como realizada'),
      sinProg ? h('p', { class: 'nota aviso' }, `Sin clases programadas para: ${sinProg}. Agrega horarios en Configuración.`) : null,
    );
  } else if (sig.completo) {
    siguiente = h('section', { class: 'card siguiente cat-movilidad' }, h('p', { class: 'etiqueta' }, 'Siguiente módulo pendiente'), h('h2', {}, '🎉 ¡Completaste todos los módulos!'));
  } else {
    siguiente = h(
      'section',
      { class: 'card siguiente cat-vehiculo' },
      h('p', { class: 'etiqueta' }, 'Siguiente módulo pendiente'),
      h('h2', {}, 'No hay clases programadas para lo que te falta'),
      sinProg ? h('p', { class: 'nota aviso' }, `Faltan: ${sinProg}.`) : null,
      h('button', { class: 'btn btn-grande btn-primario', type: 'button', onclick: () => ctx.irA('config') }, 'Agregar horario'),
    );
  }

  const delDia = clasesDelDia(store.clases, hoy);
  const festivo = festivoDe(store.festivos, hoy);
  const seccionHoy = h(
    'section',
    { class: 'seccion' },
    h('h2', {}, `Hoy · ${fechaLarga(hoy)}`),
    festivo
      ? h('p', { class: 'vacio' }, 'Hoy es festivo: no hay clases.')
      : delDia.length
        ? h('div', { class: 'lista' }, delDia.map((c) => claseCard(ctx, c, { mostrarFecha: false })))
        : h('p', { class: 'vacio' }, 'Hoy no hay clases programadas.'),
  );

  return h('div', {}, hero, stats, siguiente, seccionHoy);
}
