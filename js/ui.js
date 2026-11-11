// Componentes de interfaz compartidos por las vistas.
import { h } from './utils/dom.js';
import { CATEGORIAS, ESTADOS, etiquetaHorario } from './config.js';
import { fechaCorta, fechaHoraLegible, diaSemana } from './utils/dates.js';

export function chipEstado(estado) {
  const e = ESTADOS[estado] || { nombre: estado };
  const icono = { PENDIENTE: '⏳', REALIZADA: '✓', CANCELADA: '✕', REPROGRAMADA: '↻' }[estado] || '';
  return h('span', { class: `chip chip-${String(estado).toLowerCase()}` }, `${icono} ${e.nombre}`.trim());
}

export function barra(pct, extra = '') {
  return h(
    'div',
    { class: `barra ${extra}`.trim(), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
    h('div', { class: 'barra-relleno', style: `width:${Math.max(0, Math.min(100, pct))}%` }),
  );
}

/**
 * Tarjeta de una clase con botón grande para marcar / desmarcar.
 * @param ctx  contexto de la app (store, alternar, editar…)
 */
export function claseCard(ctx, c, { mostrarFecha = true } = {}) {
  const cat = CATEGORIAS[c.categoria] || { nombre: String(c.categoria), icono: '❔', clase: '' };
  const hecha = c.estado === 'REALIZADA';
  const nombre = `${cat.nombre} ${c.modulo}`;

  const extras = [];
  if (c.revisar) extras.push(h('span', { class: 'tag tag-aviso' }, '⚠ Revisar dato'));
  if (c.reprogramadaA) {
    const destino = ctx.store.obtener(c.reprogramadaA);
    extras.push(h('span', { class: 'tag' }, destino ? `Movida al ${fechaCorta(destino.fecha)}` : 'Reprogramada'));
  }
  if (c.cubiertaPor) {
    const origen = ctx.store.obtener(c.cubiertaPor);
    extras.push(h('span', { class: 'tag', title: 'Este módulo ya se vio en otra clase' }, origen ? `✓ Módulo visto el ${fechaCorta(origen.fecha)}` : '✓ Módulo ya visto'));
  }
  if (c.reprogramadaDe) extras.push(h('span', { class: 'tag' }, 'Reprogramada'));
  if (c.marcaVerde) {
    extras.push(h('span', { class: 'tag', title: 'En la imagen del horario esta clase tenía una marca verde' }, '● Marca verde en el horario'));
  }

  const meta = [
    mostrarFecha ? `${fechaCorta(c.fecha)} · ` : '',
    etiquetaHorario(c.inicio, c.fin),
  ].join('');

  return h(
    'article',
    { class: `clase-card ${cat.clase} ${hecha ? 'es-hecha' : ''} est-${String(c.estado).toLowerCase()} ${c.revisar ? 'revisar' : ''}`.replace(/\s+/g, ' '), dataset: { id: c.id } },
    h('div', { class: 'cc-icono', 'aria-hidden': 'true' }, cat.icono),
    h(
      'div',
      { class: 'cc-cuerpo' },
      h('div', { class: 'cc-titulo' }, h('strong', {}, nombre), chipEstado(c.estado)),
      h('div', { class: 'cc-meta' }, mostrarFecha ? `${diaSemana(c.fecha)} · ` : '', meta),
      hecha && c.fechaRealizada ? h('div', { class: 'cc-hecha' }, `✓ Completada el ${fechaHoraLegible(c.fechaRealizada)}`) : null,
      c.nota ? h('div', { class: 'cc-meta' }, `📝 ${c.nota}`) : null,
      extras.length ? h('div', { class: 'cc-extra' }, extras) : null,
      h(
        'div',
        { class: 'cc-acciones' },
        h(
          'button',
          {
            class: `btn btn-grande ${hecha ? 'btn-hecha' : 'btn-primario'}`,
            type: 'button',
            disabled: c.estado === 'REPROGRAMADA',
            'aria-pressed': hecha ? 'true' : 'false',
            onclick: () => ctx.alternar(c.id),
          },
          c.estado === 'REPROGRAMADA' ? 'Reprogramada' : hecha ? '✓ Realizada · Desmarcar' : 'Marcar como realizada',
        ),
        h('button', { class: 'btn btn-icono', type: 'button', 'aria-label': `Editar ${nombre}`, title: 'Editar', onclick: () => ctx.editar(c) }, '✏️'),
      ),
    ),
  );
}

// ---- Diálogos y avisos --------------------------------------------------------

export function abrirModal(titulo, contenido) {
  const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-titulo' });
  dlg.append(
    h(
      'div',
      { class: 'modal-cab' },
      h('h2', { id: 'modal-titulo' }, titulo),
      h('button', { class: 'btn btn-icono', type: 'button', 'aria-label': 'Cerrar', onclick: () => dlg.close() }, '✕'),
    ),
    h('div', { class: 'modal-cuerpo' }, contenido),
  );
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { dialog: dlg, cerrar: () => dlg.close() };
}

export function confirmar(mensaje, { titulo = 'Confirmar', ok = 'Aceptar', peligro = false } = {}) {
  return new Promise((resolver) => {
    let resultado = false;
    const modal = abrirModal(
      titulo,
      h(
        'div',
        { class: 'form' },
        h('p', {}, mensaje),
        h(
          'div',
          { class: 'acciones-form' },
          h('button', { class: 'btn', type: 'button', onclick: () => modal.cerrar() }, 'Cancelar'),
          h('button', { class: `btn ${peligro ? 'btn-peligro' : 'btn-primario'}`, type: 'button', onclick: () => { resultado = true; modal.cerrar(); } }, ok),
        ),
      ),
    );
    modal.dialog.addEventListener('close', () => resolver(resultado));
  });
}

export function toast(mensaje) {
  const cont = document.getElementById('toasts');
  if (!cont) return;
  const t = h('div', { class: 'toast' }, mensaje);
  cont.append(t);
  setTimeout(() => t.remove(), 2800);
}
