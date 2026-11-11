// Datos iniciales: horario "Noviembre 2026 · Formación Teórica" transcrito de la imagen.
//
// Cada día se lee de arriba hacia abajo y corresponde, en orden, a los horarios
// 8–10 a. m., 10–12 m., 4–6 p. m. y 6–8 p. m. Los sábados solo hay dos clases
// (las dos primeras filas). Códigos: M = Movilidad, N = Normas, V = Vehículo,
// S = Señalización + número de módulo.
//
//   *  → en la imagen esa clase tiene una marca verde (significado aún sin confirmar)
//   !  → dato dudoso: queda marcado "revisar" para corregirlo a mano
//
// Los lunes 2 y 16 aparecen como FESTIVO (sin clases).

import { parseCodigo } from '../importer.js';
import { HORARIOS } from '../config.js';

export const SEED_VERSION = 1;

export const FESTIVOS_NOV_2026 = ['2026-11-02', '2026-11-16'];

export const HORARIO_NOV_2026 = {
  '2026-11-03': ['N5', 'V2', 'M6*', 'N2'],
  '2026-11-04': ['N1', 'M1', 'S4*', 'V1*'],
  '2026-11-05': ['N3*', 'M3*', 'V3', 'M6*'],
  '2026-11-06': ['V4', 'N2', 'N3*', 'S4*'],
  '2026-11-07': ['M5', 'N3*'],

  '2026-11-09': ['M2*', 'N4', 'M4', 'N6'],
  '2026-11-10': ['N6', 'V1*', 'S1*', 'V4'],
  '2026-11-11': ['S2', 'M5', 'S3', 'N1'],
  '2026-11-12': ['N1', 'M6*', 'V2', 'M2*'],
  '2026-11-13': ['M2*', 'V4', 'M1', 'N5'],
  '2026-11-14': ['V3', 'S2'],

  '2026-11-17': ['N5', 'M2*', 'N3*', 'M1'],
  '2026-11-18': ['M4', 'V1', 'S3', 'M3*'],
  '2026-11-19': ['S1*', 'S4*', 'V3', 'N3*'],
  '2026-11-20': ['M2*', 'M5', 'N4', 'S1*'],
  '2026-11-21': ['N5', 'N2'],

  '2026-11-23': ['V4', 'S3', 'S4*', 'V2'],
  '2026-11-24': ['N6', 'N1', 'V1*', 'S2'],
  '2026-11-25': ['M2*', 'V3', 'N3*', 'M5'],
  '2026-11-26': ['S2', 'N5', 'M5', 'S3'],
  // En la imagen la última clase del viernes dice "VEHÍCULO 6", pero Vehículo solo tiene módulos 1–4.
  '2026-11-27': ['M6*', 'M4', 'M1', 'V6!'],
  '2026-11-28': ['M3*', 'N4'],

  '2026-11-30': ['S1*', 'N2', 'M3*', 'N4'],
};

const NOTA_REVISAR = 'En el horario original dice "Vehículo 6", pero Vehículo solo tiene módulos 1 al 4. Verifica el dato y corrígelo.';

export function crearDatosIniciales() {
  const clases = [];
  for (const [fecha, codigos] of Object.entries(HORARIO_NOV_2026)) {
    codigos.forEach((txt, i) => {
      const c = parseCodigo(txt);
      if (!c) throw new Error(`Código inválido en el horario inicial: ${fecha} ${txt}`);
      clases.push({
        id: `${fecha}-${i + 1}`,
        fecha,
        inicio: HORARIOS[i].inicio,
        fin: HORARIOS[i].fin,
        categoria: c.categoria,
        modulo: c.modulo,
        estado: 'PENDIENTE',
        fechaRealizada: null,
        marcaVerde: c.marcaVerde,
        revisar: c.revisar,
        nota: c.revisar ? NOTA_REVISAR : '',
      });
    });
  }
  const festivos = FESTIVOS_NOV_2026.map((fecha) => ({ fecha, nombre: 'Festivo' }));
  return { version: SEED_VERSION, clases, festivos };
}
