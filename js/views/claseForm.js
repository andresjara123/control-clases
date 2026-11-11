// Formulario para agregar, editar, eliminar y reprogramar una clase.
import { h } from '../utils/dom.js';
import { CATEGORIAS, ORDEN_CATEGORIAS, ESTADOS, ORDEN_ESTADOS, HORARIOS, etiquetaHorario } from '../config.js';
import { abrirModal, confirmar } from '../ui.js';

/** Selector de horario: los 4 estándar + "Otro horario" con hora de inicio y fin. */
function campoHorario(inicio, fin) {
  const idx = HORARIOS.findIndex((x) => x.inicio === inicio && x.fin === fin);
  const sel = h(
    'select',
    { class: 'campo', 'aria-label': 'Horario' },
    HORARIOS.map((x, i) => h('option', { value: String(i) }, etiquetaHorario(x.inicio, x.fin))),
    h('option', { value: 'otro' }, 'Otro horario…'),
  );
  sel.value = idx >= 0 ? String(idx) : 'otro';
  const ini = h('input', { type: 'time', class: 'campo', value: inicio || '08:00', 'aria-label': 'Hora de inicio' });
  const fi = h('input', { type: 'time', class: 'campo', value: fin || '10:00', 'aria-label': 'Hora de fin' });
  const otro = h(
    'div',
    { class: 'fila-2' },
    h('label', { class: 'etq' }, 'Inicio', ini),
    h('label', { class: 'etq' }, 'Fin', fi),
  );
  const actualizar = () => { otro.hidden = sel.value !== 'otro'; };
  sel.addEventListener('change', actualizar);
  actualizar();
  return {
    el: h('div', {}, sel, otro),
    leer: () => (sel.value === 'otro' ? { inicio: ini.value, fin: fi.value } : { ...HORARIOS[Number(sel.value)] }),
  };
}

function mostrarErrores(caja, errores) {
  caja.replaceChildren(h('ul', {}, errores.map((e) => h('li', {}, e))));
  caja.hidden = false;
  caja.scrollIntoView({ block: 'nearest' });
}

/**
 * @param ctx
 * @param opciones { clase?: object, fecha?: 'AAAA-MM-DD' }  — con `clase` se edita; sin ella se agrega.
 */
export function abrirFormularioClase(ctx, { clase = null, fecha = '' } = {}) {
  const { store } = ctx;
  const editando = Boolean(clase);
  const base = clase || { fecha, inicio: '08:00', fin: '10:00', categoria: 'MOVILIDAD', modulo: 1, estado: 'PENDIENTE', nota: '' };

  const errores = h('div', { class: 'form-errores', role: 'alert', hidden: true });
  const inpFecha = h('input', { type: 'date', class: 'campo', value: base.fecha || '' });
  const horario = campoHorario(base.inicio, base.fin);
  const selCat = h(
    'select',
    { class: 'campo' },
    ORDEN_CATEGORIAS.map((k) => h('option', { value: k }, `${CATEGORIAS[k].icono} ${CATEGORIAS[k].nombre}`)),
  );
  selCat.value = base.categoria;
  const selMod = h('select', { class: 'campo' });
  const llenarModulos = (cat, actual) => {
    const max = CATEGORIAS[cat].modulos;
    const opciones = [];
    for (let n = 1; n <= max; n++) opciones.push(h('option', { value: String(n) }, `Módulo ${n}`));
    if (actual && (actual > max || actual < 1)) opciones.push(h('option', { value: String(actual) }, `Módulo ${actual} (no existe)`));
    selMod.replaceChildren(...opciones);
    selMod.value = String(actual && actual >= 1 ? actual : 1);
  };
  llenarModulos(base.categoria, base.modulo);
  selCat.addEventListener('change', () => llenarModulos(selCat.value, Number(selMod.value) <= CATEGORIAS[selCat.value].modulos ? Number(selMod.value) : 1));
  const selEstado = h(
    'select',
    { class: 'campo' },
    ORDEN_ESTADOS.map((k) => h('option', { value: k }, ESTADOS[k].nombre)),
  );
  selEstado.value = base.estado;
  const nota = h('textarea', { class: 'campo', maxlength: '500', placeholder: 'Opcional', value: base.nota || '' });

  const leer = () => ({
    fecha: inpFecha.value,
    ...horario.leer(),
    categoria: selCat.value,
    modulo: Number(selMod.value),
    estado: selEstado.value,
    nota: nota.value,
  });

  let modal;
  const terminar = (mensaje) => { modal.cerrar(); ctx.toast(mensaje); };

  const guardar = async (e) => {
    e.preventDefault();
    const r = await ctx.run(() => (editando ? store.editarClase(clase.id, leer()) : store.agregarClase(leer())));
    if (!r.ok) return mostrarErrores(errores, r.errores);
    terminar(editando ? 'Cambios guardados' : 'Clase agregada');
  };

  const acciones = [
    h('button', { class: 'btn', type: 'button', onclick: () => modal.cerrar() }, 'Cancelar'),
    h('button', { class: 'btn btn-primario', type: 'submit' }, editando ? 'Guardar cambios' : 'Agregar clase'),
  ];

  // ---- Reprogramar -----------------------------------------------------------
  let bloqueRepro = null;
  let botonRepro = null;
  const puedeReprogramar = editando && clase.estado !== 'REALIZADA' && clase.estado !== 'REPROGRAMADA';
  if (puedeReprogramar) {
    const fechaNueva = h('input', { type: 'date', class: 'campo', value: clase.fecha });
    const horarioNuevo = campoHorario(clase.inicio, clase.fin);
    bloqueRepro = h(
      'div',
      { class: 'repro', hidden: true },
      h('p', { class: 'nota' }, 'La clase actual quedará como «Reprogramada» y se creará una clase pendiente en la nueva fecha.'),
      h('label', { class: 'etq' }, 'Nueva fecha', fechaNueva),
      h('div', { class: 'etq' }, 'Nuevo horario', horarioNuevo.el),
      h(
        'button',
        {
          class: 'btn btn-primario',
          type: 'button',
          onclick: async () => {
            const r = await ctx.run(() => store.reprogramar(clase.id, { fecha: fechaNueva.value, ...horarioNuevo.leer() }));
            if (!r.ok) return mostrarErrores(errores, r.errores);
            terminar('Clase reprogramada');
          },
        },
        'Confirmar reprogramación',
      ),
    );
    botonRepro = h('button', { class: 'btn', type: 'button', onclick: () => { bloqueRepro.hidden = !bloqueRepro.hidden; } }, '📅 Reprogramar…');
  }

  const botonEliminar = editando
    ? h(
        'button',
        {
          class: 'btn btn-texto-peligro',
          type: 'button',
          onclick: async () => {
            const ok = await confirmar('¿Eliminar esta clase? No se puede deshacer.', { titulo: 'Eliminar clase', ok: 'Eliminar', peligro: true });
            if (!ok) return;
            const r = await ctx.run(() => store.eliminarClase(clase.id));
            if (r.ok) terminar('Clase eliminada');
          },
        },
        '🗑 Eliminar',
      )
    : null;

  const form = h(
    'form',
    { class: 'form', novalidate: true, onsubmit: guardar },
    errores,
    h('label', { class: 'etq' }, 'Fecha', inpFecha),
    h('div', { class: 'etq' }, 'Horario', horario.el),
    h('div', { class: 'fila-2' }, h('label', { class: 'etq' }, 'Categoría', selCat), h('label', { class: 'etq' }, 'Módulo', selMod)),
    h('label', { class: 'etq' }, 'Estado', selEstado),
    h('label', { class: 'etq' }, 'Nota', nota),
    bloqueRepro,
    h('div', { class: 'acciones-form' }, botonRepro, botonEliminar, acciones),
  );

  modal = abrirModal(editando ? 'Editar clase' : 'Agregar clase', form);
  return modal;
}
