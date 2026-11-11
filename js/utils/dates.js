// Utilidades de fecha. Las fechas de las clases son cadenas 'AAAA-MM-DD' (sin zona horaria)
// para evitar desfases entre dispositivos.
import { DIAS, MESES } from '../config.js';

export function esFechaISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return toISO(d) === s;
}

/** 'AAAA-MM-DD' → Date a las 12:00 locales (evita saltos por horario de verano). */
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hoyISO(now = new Date()) {
  return toISO(now);
}

/** 'AAAA-MM-DDTHH:MM' en hora local, para comparar con inicio/fin de las clases. */
export function ahoraLocal(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${toISO(now)}T${hh}:${mm}`;
}

export function diaSemana(iso) {
  return DIAS[parseISO(iso).getDay()];
}

export function nombreMes(mes0) {
  return MESES[mes0];
}

/** 'Martes 3 de noviembre de 2026' */
export function fechaLarga(iso) {
  const d = parseISO(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** 'Mar 3 nov' */
export function fechaCorta(iso) {
  const d = parseISO(iso);
  return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** Fecha y hora legibles a partir de un ISO completo (para "completada el…"). */
export function fechaHoraLegible(isoCompleto) {
  const d = new Date(isoCompleto);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const suf = hh >= 12 ? 'p. m.' : 'a. m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${h12}:${mm} ${suf}`;
}

/** Semanas (lunes a domingo) de un mes: matriz de Date|null. */
export function matrizMes(anio, mes0) {
  const primero = new Date(anio, mes0, 1, 12);
  const offset = (primero.getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(anio, mes0 + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(new Date(anio, mes0, d, 12));
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

export function sumarMeses(anio, mes0, delta) {
  const d = new Date(anio, mes0 + delta, 1, 12);
  return { anio: d.getFullYear(), mes0: d.getMonth() };
}

/** Convierte 'DD/MM/AAAA' o 'AAAA-MM-DD' a ISO; devuelve null si es inválida. */
export function normalizarFecha(txt) {
  const t = String(txt).trim();
  let iso = null;
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) {
    iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) {
    iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return iso && esFechaISO(iso) ? iso : null;
}
