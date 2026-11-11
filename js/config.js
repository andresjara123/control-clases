// Configuración general: categorías, estados y horarios estándar.

export const APP_VERSION = '2.0.0';

export const CATEGORIAS = {
  MOVILIDAD: { nombre: 'Movilidad', letra: 'M', modulos: 6, icono: '🚦', clase: 'cat-movilidad' },
  NORMAS: { nombre: 'Normas', letra: 'N', modulos: 6, icono: '📘', clase: 'cat-normas' },
  VEHICULO: { nombre: 'Vehículo', letra: 'V', modulos: 4, icono: '🚗', clase: 'cat-vehiculo' },
  SENALIZACION: { nombre: 'Señalización', letra: 'S', modulos: 4, icono: '🛑', clase: 'cat-senalizacion' },
};

export const ORDEN_CATEGORIAS = ['MOVILIDAD', 'NORMAS', 'VEHICULO', 'SENALIZACION'];

export const ESTADOS = {
  PENDIENTE: { nombre: 'Pendiente', clase: 'est-pendiente' },
  REALIZADA: { nombre: 'Realizada', clase: 'est-realizada' },
  CANCELADA: { nombre: 'Cancelada', clase: 'est-cancelada' },
  REPROGRAMADA: { nombre: 'Reprogramada', clase: 'est-reprogramada' },
};

export const ORDEN_ESTADOS = ['PENDIENTE', 'REALIZADA', 'CANCELADA', 'REPROGRAMADA'];

// Los cuatro horarios del curso, en el orden en que aparecen en el cuadro.
export const HORARIOS = [
  { inicio: '08:00', fin: '10:00' },
  { inicio: '10:00', fin: '12:00' },
  { inicio: '16:00', fin: '18:00' },
  { inicio: '18:00', fin: '20:00' },
];

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const TOTAL_MODULOS = ORDEN_CATEGORIAS.reduce((s, c) => s + CATEGORIAS[c].modulos, 0);

/** '08:00' → '8:00 a. m.' */
export function hora12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suf = h >= 12 ? 'p. m.' : 'a. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`;
}

export function etiquetaHorario(inicio, fin) {
  return `${hora12(inicio)} – ${hora12(fin)}`;
}
