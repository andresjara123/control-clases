// Lectura de horarios en formato de texto compacto.
//
// Una línea por día:
//   2026-12-01: N5, V2, M6, N2          → se asignan en orden a los 4 horarios estándar
//   2026-12-05: M1@16:00-18:00, N2      → "@HH:MM-HH:MM" fija un horario concreto
//   2026-12-08: FESTIVO                 → día sin clases
// Letras: M = Movilidad, N = Normas, V = Vehículo, S = Señalización.
// También se aceptan fechas DD/MM/AAAA. Las líneas que empiezan con # se ignoran.

import { CATEGORIAS, HORARIOS } from './config.js';
import { normalizarFecha } from './utils/dates.js';

const LETRAS = Object.fromEntries(Object.entries(CATEGORIAS).map(([k, v]) => [v.letra, k]));
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 'M6*' → { categoria, modulo, marcaVerde, revisar }. Devuelve null si no es válido. */
export function parseCodigo(txt) {
  const m = /^([MNVS])(\d{1,2})([*!]*)(?:@(\d{2}:\d{2})-(\d{2}:\d{2}))?$/i.exec(String(txt).trim());
  if (!m) return null;
  const categoria = LETRAS[m[1].toUpperCase()];
  const modulo = Number(m[2]);
  if (modulo < 1) return null;
  const inicio = m[4] || null;
  const fin = m[5] || null;
  if ((inicio && !RE_HORA.test(inicio)) || (fin && !RE_HORA.test(fin)) || (inicio && fin && fin <= inicio)) {
    return null;
  }
  return {
    categoria,
    modulo,
    marcaVerde: m[3].includes('*'),
    revisar: m[3].includes('!'),
    inicio,
    fin,
  };
}

/**
 * Interpreta un bloque de texto con varios días.
 * @returns {{clases: object[], festivos: object[], errores: {linea:number, mensaje:string}[]}}
 */
export function parsearHorarioTexto(texto) {
  const clases = [];
  const festivos = [];
  const errores = [];
  const lineas = String(texto).split(/\r?\n/);

  lineas.forEach((crudo, i) => {
    const linea = crudo.trim();
    if (!linea || linea.startsWith('#')) return;
    const n = i + 1;
    const corte = linea.indexOf(':');
    // El primer ":" separa fecha y clases (las fechas ISO no contienen ":").
    if (corte < 0) {
      errores.push({ linea: n, mensaje: 'Falta ":" entre la fecha y las clases.' });
      return;
    }
    const fecha = normalizarFecha(linea.slice(0, corte));
    if (!fecha) {
      errores.push({ linea: n, mensaje: `Fecha no válida: "${linea.slice(0, corte).trim()}".` });
      return;
    }
    const resto = linea.slice(corte + 1).trim();
    if (/^festivo$/i.test(resto)) {
      festivos.push({ fecha, nombre: 'Festivo' });
      return;
    }
    const piezas = resto.split(/[,\s]+/).filter(Boolean);
    if (!piezas.length) {
      errores.push({ linea: n, mensaje: 'La línea no tiene clases.' });
      return;
    }
    if (piezas.length > HORARIOS.length && piezas.some((p) => !p.includes('@'))) {
      errores.push({
        linea: n,
        mensaje: `Hay más de ${HORARIOS.length} clases sin horario explícito (usa @HH:MM-HH:MM).`,
      });
      return;
    }
    let ok = true;
    const delDia = [];
    piezas.forEach((p, idx) => {
      const c = parseCodigo(p);
      if (!c) {
        errores.push({ linea: n, mensaje: `Clase no válida: "${p}".` });
        ok = false;
        return;
      }
      const max = CATEGORIAS[c.categoria].modulos;
      if (c.modulo > max) {
        errores.push({
          linea: n,
          mensaje: `${CATEGORIAS[c.categoria].nombre} solo tiene módulos 1 al ${max} (se recibió ${c.modulo}).`,
        });
        ok = false;
        return;
      }
      const slot = HORARIOS[idx];
      const inicio = c.inicio || (slot && slot.inicio);
      const fin = c.fin || (slot && slot.fin);
      if (!inicio || !fin) {
        errores.push({ linea: n, mensaje: `"${p}" no tiene horario.` });
        ok = false;
        return;
      }
      delDia.push({
        fecha,
        inicio,
        fin,
        categoria: c.categoria,
        modulo: c.modulo,
        estado: 'PENDIENTE',
        fechaRealizada: null,
        marcaVerde: false,
        revisar: false,
        nota: '',
      });
    });
    if (ok) clases.push(...delDia);
  });

  return { clases, festivos, errores };
}
