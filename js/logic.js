// Lógica pura (sin DOM): cálculos de avance, filtros y validaciones.
import { CATEGORIAS, ORDEN_CATEGORIAS, TOTAL_MODULOS } from './config.js';
import { esFechaISO } from './utils/dates.js';

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Orden cronológico estable: fecha, luego hora de inicio. */
export function compararClases(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
  return 0;
}

/**
 * Resumen general.
 * - total: clases vigentes (no cuenta las reprogramadas, porque su copia ya está en la nueva fecha).
 * - pctClases: realizadas / (realizadas + pendientes); las canceladas no cuentan.
 */
export function resumen(clases) {
  const r = { total: 0, realizadas: 0, pendientes: 0, canceladas: 0, reprogramadas: 0, pctClases: 0 };
  for (const c of clases) {
    if (c.estado === 'REPROGRAMADA') { r.reprogramadas++; continue; }
    r.total++;
    if (c.estado === 'REALIZADA') r.realizadas++;
    else if (c.estado === 'PENDIENTE') r.pendientes++;
    else if (c.estado === 'CANCELADA') r.canceladas++;
  }
  const base = r.realizadas + r.pendientes;
  r.pctClases = base === 0 ? 0 : Math.round((r.realizadas / base) * 100);
  return r;
}

/** Progreso de una categoría, módulo por módulo. */
export function progresoCategoria(clases, categoria, ahora = '') {
  const total = CATEGORIAS[categoria].modulos;
  const modulos = [];
  for (let n = 1; n <= total; n++) {
    const delModulo = clases.filter((c) => c.categoria === categoria && c.modulo === n);
    const hechas = delModulo
      .filter((c) => c.estado === 'REALIZADA')
      .sort((a, b) => (a.fechaRealizada || '').localeCompare(b.fechaRealizada || ''));
    const pendientes = delModulo
      .filter((c) => c.estado === 'PENDIENTE' && `${c.fecha}T${c.fin}` >= ahora)
      .sort(compararClases);
    modulos.push({
      modulo: n,
      realizado: hechas.length > 0,
      fechaRealizada: hechas.length ? hechas[0].fechaRealizada : null,
      proxima: pendientes[0] || null,
      opciones: pendientes.length,
    });
  }
  const vistos = modulos.filter((m) => m.realizado).length;
  return { categoria, total, vistos, pct: Math.round((vistos / total) * 100), modulos };
}

/** Avance del curso: módulos distintos vistos sobre el total de módulos (16). */
export function progresoGeneral(clases) {
  let vistos = 0;
  for (const cat of ORDEN_CATEGORIAS) vistos += progresoCategoria(clases, cat).vistos;
  return { vistos, total: TOTAL_MODULOS, pct: Math.round((vistos / TOTAL_MODULOS) * 100) };
}

/**
 * Siguiente clase pendiente que aporta un módulo todavía no visto.
 * @param ahora 'AAAA-MM-DDTHH:MM' hora local
 * @returns {{clase: object|null, sinProgramar: {categoria:string, modulo:number}[], completo: boolean}}
 */
export function siguientePendiente(clases, ahora) {
  const sinProgramar = [];
  let completo = true;
  const vistos = new Set();
  for (const cat of ORDEN_CATEGORIAS) {
    const p = progresoCategoria(clases, cat, ahora);
    for (const m of p.modulos) {
      if (m.realizado) vistos.add(`${cat}-${m.modulo}`);
      else {
        completo = false;
        if (!m.proxima) sinProgramar.push({ categoria: cat, modulo: m.modulo });
      }
    }
  }
  const candidatas = clases
    .filter(
      (c) => c.estado === 'PENDIENTE' && `${c.fecha}T${c.fin}` >= ahora && !vistos.has(`${c.categoria}-${c.modulo}`),
    )
    .sort(compararClases);
  return { clase: candidatas[0] || null, sinProgramar, completo };
}

export function clasesDelDia(clases, iso) {
  return clases.filter((c) => c.fecha === iso).sort(compararClases);
}

export function festivoDe(festivos, iso) {
  return festivos.find((f) => f.fecha === iso) || null;
}

/** Filtros de "Mis clases". Todos los campos son opcionales; '' = sin filtro. */
export function filtrarClases(clases, f = {}) {
  const { desde = '', hasta = '', categoria = '', modulo = '', estado = '', orden = 'asc' } = f;
  const out = clases.filter((c) => {
    if (desde && c.fecha < desde) return false;
    if (hasta && c.fecha > hasta) return false;
    if (categoria && c.categoria !== categoria) return false;
    if (modulo && c.modulo !== Number(modulo)) return false;
    if (estado && c.estado !== estado) return false;
    return true;
  });
  out.sort(compararClases);
  if (orden === 'desc') out.reverse();
  return out;
}

/**
 * Valida una clase. `existentes` son las demás clases (sin la que se edita).
 * @returns {string[]} lista de errores (vacía si es válida)
 */
export function validarClase(c, existentes = []) {
  const errores = [];
  if (!esFechaISO(c.fecha)) errores.push('La fecha no es válida.');
  if (!RE_HORA.test(c.inicio || '') || !RE_HORA.test(c.fin || '')) {
    errores.push('El horario no es válido.');
  } else if (c.fin <= c.inicio) {
    errores.push('La hora de fin debe ser posterior a la de inicio.');
  }
  const cat = CATEGORIAS[c.categoria];
  if (!cat) {
    errores.push('Elige una categoría.');
  } else if (!Number.isInteger(c.modulo) || c.modulo < 1 || c.modulo > cat.modulos) {
    errores.push(`${cat.nombre} tiene módulos del 1 al ${cat.modulos}.`);
  }
  if (!errores.length && existentes.some((o) => o.fecha === c.fecha && o.inicio === c.inicio && o.estado !== 'REPROGRAMADA')) {
    errores.push('Ya hay una clase en esa fecha y hora de inicio.');
  }
  return errores;
}

/** Código corto: 'M6'. */
export function codigoClase(c) {
  const cat = CATEGORIAS[c.categoria];
  return `${cat ? cat.letra : '?'}${c.modulo}`;
}

export function nombreClase(c) {
  const cat = CATEGORIAS[c.categoria];
  return `${cat ? cat.nombre : c.categoria} ${c.modulo}`;
}
