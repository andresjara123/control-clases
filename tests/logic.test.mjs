import test from 'node:test';
import assert from 'node:assert/strict';

import { crearDatosIniciales, HORARIO_NOV_2026, FESTIVOS_NOV_2026 } from '../js/data/seed.js';
import { parseCodigo, parsearHorarioTexto } from '../js/importer.js';
import { diaSemana, esFechaISO, matrizMes, normalizarFecha, fechaLarga, ahoraLocal } from '../js/utils/dates.js';
import { hora12, etiquetaHorario, TOTAL_MODULOS } from '../js/config.js';
import {
  resumen, progresoCategoria, progresoGeneral, siguientePendiente, filtrarClases, validarClase, clasesDelDia,
} from '../js/logic.js';
import { Store } from '../js/store.js';
import { LocalRepository } from '../js/repo/localRepository.js';
import { HttpRepository } from '../js/repo/httpRepository.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}

const relojFijo = (iso) => () => new Date(iso);

// ---------------------------------------------------------------- datos iniciales

test('horario inicial: 84 clases y 2 festivos', () => {
  const d = crearDatosIniciales();
  assert.equal(d.clases.length, 84);
  assert.deepEqual(d.festivos.map((f) => f.fecha), ['2026-11-02', '2026-11-16']);
  assert.equal(new Set(d.clases.map((c) => c.id)).size, 84);
});

test('horario inicial: clases por semana según la imagen (18, 22, 18, 22, 4)', () => {
  const { clases } = crearDatosIniciales();
  const entre = (a, b) => clases.filter((c) => c.fecha >= a && c.fecha <= b).length;
  assert.equal(entre('2026-11-02', '2026-11-08'), 18);
  assert.equal(entre('2026-11-09', '2026-11-15'), 22);
  assert.equal(entre('2026-11-16', '2026-11-22'), 18);
  assert.equal(entre('2026-11-23', '2026-11-29'), 22);
  assert.equal(entre('2026-11-30', '2026-12-06'), 4);
});

test('horario inicial: solo lunes a sábado, sin clases en festivos, sábados con 2 clases', () => {
  const { clases } = crearDatosIniciales();
  for (const c of clases) {
    assert.notEqual(diaSemana(c.fecha), 'Domingo', c.fecha);
    assert.ok(!FESTIVOS_NOV_2026.includes(c.fecha), `clase en festivo ${c.fecha}`);
    if (diaSemana(c.fecha) === 'Sábado') assert.ok(['08:00', '10:00'].includes(c.inicio));
  }
  for (const f of FESTIVOS_NOV_2026) assert.equal(diaSemana(f), 'Lunes');
  for (const [fecha, cods] of Object.entries(HORARIO_NOV_2026)) {
    assert.equal(cods.length, diaSemana(fecha) === 'Sábado' ? 2 : 4, fecha);
  }
});

test('horario inicial: módulos dentro de rango salvo la clase marcada para revisar', () => {
  const { clases } = crearDatosIniciales();
  const invalidas = clases.filter((c) => validarClase(c, []).length > 0);
  assert.deepEqual(invalidas.map((c) => c.id), ['2026-11-27-4']);
  assert.equal(invalidas[0].revisar, true);
  assert.deepEqual(clases.filter((c) => c.revisar).map((c) => c.id), ['2026-11-27-4']);
});

test('horario inicial: todas empiezan pendientes, 31 con marca verde en la imagen', () => {
  const { clases } = crearDatosIniciales();
  assert.ok(clases.every((c) => c.estado === 'PENDIENTE' && c.fechaRealizada === null));
  assert.equal(clases.filter((c) => c.marcaVerde).length, 31);
});

test('horario inicial: las marcas verdes caen en M2, M3, M6, N3, S1, S4, V1', () => {
  const { clases } = crearDatosIniciales();
  const marcados = new Set(clases.filter((c) => c.marcaVerde).map((c) => `${c.categoria}-${c.modulo}`));
  assert.deepEqual([...marcados].sort(), [
    'MOVILIDAD-2', 'MOVILIDAD-3', 'MOVILIDAD-6', 'NORMAS-3', 'SENALIZACION-1', 'SENALIZACION-4', 'VEHICULO-1',
  ]);
  // Única repetición de esos módulos sin marca: Vehículo 1 del 18 de noviembre.
  const sinMarca = clases.filter((c) => !c.marcaVerde && marcados.has(`${c.categoria}-${c.modulo}`));
  assert.deepEqual(sinMarca.map((c) => c.id), ['2026-11-18-2']);
});

test('horario inicial: cada módulo del curso aparece al menos una vez', () => {
  const { clases } = crearDatosIniciales();
  const g = progresoGeneral(clases.map((c) => ({ ...c, estado: 'REALIZADA' })));
  assert.equal(g.vistos, TOTAL_MODULOS);
});

// ---------------------------------------------------------------- fechas

test('fechas: validación, día de la semana y formato', () => {
  assert.ok(esFechaISO('2026-11-10'));
  assert.ok(!esFechaISO('2026-02-30'));
  assert.ok(!esFechaISO('10/11/2026'));
  assert.equal(diaSemana('2026-11-10'), 'Martes');
  assert.equal(fechaLarga('2026-11-03'), 'Martes 3 de noviembre de 2026');
  assert.equal(normalizarFecha('3/11/2026'), '2026-11-03');
  assert.equal(normalizarFecha('2026-12-1'), '2026-12-01');
  assert.equal(normalizarFecha('31/02/2026'), null);
});

test('fechas: noviembre 2026 empieza en domingo y ocupa 6 filas (lunes a domingo)', () => {
  const sem = matrizMes(2026, 10);
  assert.equal(sem[0].filter(Boolean).length, 1);
  assert.equal(sem[0][6].getDate(), 1);
  assert.equal(sem.length, 6);
  assert.equal(sem[1][0].getDate(), 2);
  assert.equal(sem[5][0].getDate(), 30);
});

test('horas en formato 12 h', () => {
  assert.equal(hora12('08:00'), '8:00 a. m.');
  assert.equal(hora12('12:00'), '12:00 p. m.');
  assert.equal(etiquetaHorario('16:00', '18:00'), '4:00 p. m. – 6:00 p. m.');
  assert.equal(ahoraLocal(new Date(2026, 10, 10, 16, 5)), '2026-11-10T16:05');
});

// ---------------------------------------------------------------- importador

test('importador: códigos', () => {
  assert.deepEqual(parseCodigo('M6'), { categoria: 'MOVILIDAD', modulo: 6, marcaVerde: false, revisar: false, inicio: null, fin: null });
  assert.equal(parseCodigo('s4*').marcaVerde, true);
  assert.equal(parseCodigo('V6!').revisar, true);
  assert.equal(parseCodigo('N2@16:00-18:00').inicio, '16:00');
  assert.equal(parseCodigo('N2@18:00-16:00'), null);
  assert.equal(parseCodigo('X1'), null);
  assert.equal(parseCodigo('N0'), null);
});

test('importador: horario de diciembre con festivo, horario explícito y errores', () => {
  const r = parsearHorarioTexto(`
    # diciembre
    2026-12-01: N5, V2, M6, N2
    08/12/2026: FESTIVO
    2026-12-05: M1@14:00-16:00, N2
  `);
  assert.equal(r.errores.length, 0);
  assert.equal(r.clases.length, 6);
  assert.deepEqual(r.festivos, [{ fecha: '2026-12-08', nombre: 'Festivo' }]);
  assert.equal(r.clases[3].inicio, '18:00');
  assert.equal(r.clases[4].inicio, '14:00');
  assert.equal(r.clases[5].inicio, '10:00');

  const malo = parsearHorarioTexto('2026-12-01 N5\n2026-13-01: N5\n2026-12-02: V5\n2026-12-03: N1, N2, N3, N4, N5');
  assert.equal(malo.errores.length, 4);
  assert.equal(malo.clases.length, 0);
});

// ---------------------------------------------------------------- lógica

function datos() { return crearDatosIniciales().clases; }

test('resumen inicial y tras marcar', () => {
  const cl = datos();
  assert.deepEqual(resumen(cl), { total: 84, realizadas: 0, pendientes: 84, canceladas: 0, reprogramadas: 0, pctClases: 0 });
  cl[0].estado = 'REALIZADA';
  cl[1].estado = 'CANCELADA';
  cl[2].estado = 'REPROGRAMADA';
  const r = resumen(cl);
  assert.equal(r.total, 83);
  assert.equal(r.realizadas, 1);
  assert.equal(r.canceladas, 1);
  assert.equal(r.pendientes, 81);
  assert.equal(r.reprogramadas, 1);
  assert.equal(r.pctClases, Math.round((1 / 82) * 100));
});

test('progreso por categoría y general', () => {
  const cl = datos();
  const m2 = cl.find((c) => c.categoria === 'MOVILIDAD' && c.modulo === 2);
  m2.estado = 'REALIZADA'; m2.fechaRealizada = '2026-11-09T20:00:00.000Z';
  const otra = cl.filter((c) => c.categoria === 'MOVILIDAD' && c.modulo === 2)[1];
  otra.estado = 'REALIZADA'; otra.fechaRealizada = '2026-11-12T20:00:00.000Z';
  const p = progresoCategoria(cl, 'MOVILIDAD', '2026-11-10T00:00');
  assert.equal(p.total, 6);
  assert.equal(p.vistos, 1, 'dos clases del mismo módulo cuentan como un módulo');
  assert.equal(p.modulos[1].realizado, true);
  assert.equal(p.modulos[0].realizado, false);
  assert.equal(p.modulos[0].proxima.id, '2026-11-13-3'); // M1 más cercano desde el 10 nov
  assert.deepEqual(progresoGeneral(cl), { vistos: 1, total: 20, pct: 5 });
});

test('siguiente pendiente: ignora módulos ya vistos, el pasado y lo cancelado', () => {
  const cl = datos();
  const s0 = siguientePendiente(cl, '2026-11-10T16:35');
  // En curso (16:00-18:00 de hoy): Señalización 1 es la clase de las 16:00 del 10 nov.
  assert.equal(s0.clase.id, '2026-11-10-3');
  const s1 = siguientePendiente(cl, '2026-11-10T18:01');
  assert.equal(s1.clase.id, '2026-11-10-4'); // V4 de 18:00 a 20:00

  cl.find((c) => c.id === '2026-11-10-4').estado = 'CANCELADA';
  const s2 = siguientePendiente(cl, '2026-11-10T18:01');
  assert.equal(s2.clase.id, '2026-11-11-1'); // S2

  // Si ya se vio Señalización 2, esa clase se salta.
  cl.filter((c) => c.categoria === 'SENALIZACION' && c.modulo === 2).forEach((c) => { c.estado = 'REALIZADA'; });
  const s3 = siguientePendiente(cl, '2026-11-10T18:01');
  assert.equal(s3.clase.id, '2026-11-11-2'); // M5
});

test('siguiente pendiente: módulos sin clases futuras y curso completo', () => {
  const cl = datos();
  const s = siguientePendiente(cl, '2026-12-15T08:00');
  assert.equal(s.clase, null);
  assert.equal(s.sinProgramar.length, 20);
  assert.equal(s.completo, false);
  cl.forEach((c) => { c.estado = 'REALIZADA'; });
  const f = siguientePendiente(cl, '2026-11-10T08:00');
  assert.equal(f.completo, true);
  assert.equal(f.clase, null);
});

test('filtros por fecha, categoría, módulo, estado y orden', () => {
  const cl = datos();
  cl.find((c) => c.id === '2026-11-03-3').estado = 'REALIZADA';
  assert.equal(filtrarClases(cl, { categoria: 'NORMAS', modulo: '3' }).length, 6);
  assert.equal(filtrarClases(cl, { estado: 'REALIZADA' }).length, 1);
  assert.equal(filtrarClases(cl, { desde: '2026-11-09', hasta: '2026-11-09' }).length, 4);
  const desc = filtrarClases(cl, { orden: 'desc' });
  assert.equal(desc[0].id, '2026-11-30-4');
  assert.equal(filtrarClases(cl, { orden: 'asc' })[0].id, '2026-11-03-1');
  assert.equal(clasesDelDia(cl, '2026-11-07').length, 2);
});

test('validación de clases', () => {
  const base = { fecha: '2026-12-01', inicio: '08:00', fin: '10:00', categoria: 'VEHICULO', modulo: 4 };
  assert.deepEqual(validarClase(base, []), []);
  assert.ok(validarClase({ ...base, modulo: 5 }, []).length);
  assert.ok(validarClase({ ...base, fecha: '2026-02-31' }, []).length);
  assert.ok(validarClase({ ...base, fin: '07:00' }, []).length);
  assert.ok(validarClase({ ...base, categoria: 'X' }, []).length);
  assert.ok(validarClase(base, [{ ...base, estado: 'PENDIENTE' }]).length);
  assert.deepEqual(validarClase(base, [{ ...base, estado: 'REPROGRAMADA' }]), []);
});

// ---------------------------------------------------------------- store + persistencia

async function nuevoStore(storage = new FakeStorage(), ahora = '2026-11-10T21:35:00.000Z') {
  const s = new Store(new LocalRepository(storage), relojFijo(ahora));
  await s.iniciar();
  return { s, storage };
}

test('store: primera apertura carga el horario inicial y lo guarda', async () => {
  const { s, storage } = await nuevoStore();
  assert.equal(s.clases.length, 84);
  assert.ok(storage.getItem('control-clases:datos:v1'));
});

test('store: marcar guarda fecha, actualiza el avance y sobrevive a "cerrar y abrir"', async () => {
  const { s, storage } = await nuevoStore();
  let avisos = 0;
  s.subscribe(() => avisos++);
  const r = await s.marcarRealizada('2026-11-10-2');
  assert.ok(r.ok);
  assert.equal(avisos, 1);
  const c = s.obtener('2026-11-10-2');
  assert.equal(c.estado, 'REALIZADA');
  assert.equal(c.fechaRealizada, '2026-11-10T21:35:00.000Z');
  assert.equal(resumen(s.clases).realizadas, 1);
  assert.equal(progresoGeneral(s.clases).vistos, 1);

  const { s: reabierto } = await nuevoStore(storage);
  assert.equal(reabierto.obtener('2026-11-10-2').estado, 'REALIZADA');
  assert.equal(reabierto.clases.length, 84, 'no vuelve a cargar los datos iniciales encima');

  await reabierto.desmarcar('2026-11-10-2');
  assert.equal(reabierto.obtener('2026-11-10-2').estado, 'PENDIENTE');
  assert.equal(reabierto.obtener('2026-11-10-2').fechaRealizada, null);
  assert.equal(resumen(reabierto.clases).realizadas, 0);
});

test('store: alternar realizada', async () => {
  const { s } = await nuevoStore();
  await s.alternarRealizada('2026-11-04-1');
  assert.equal(s.obtener('2026-11-04-1').estado, 'REALIZADA');
  await s.alternarRealizada('2026-11-04-1');
  assert.equal(s.obtener('2026-11-04-1').estado, 'PENDIENTE');
});

test('store: agregar, editar (cambia fecha/horario/módulo/estado) y eliminar', async () => {
  const { s, storage } = await nuevoStore();
  const a = await s.agregarClase({ fecha: '2026-12-01', inicio: '08:00', fin: '10:00', categoria: 'NORMAS', modulo: 1 });
  assert.ok(a.ok);
  assert.equal(s.clases.length, 85);
  const dup = await s.agregarClase({ fecha: '2026-12-01', inicio: '08:00', fin: '10:00', categoria: 'NORMAS', modulo: 2 });
  assert.equal(dup.ok, false);
  const mala = await s.agregarClase({ fecha: '2026-12-01', inicio: '10:00', fin: '12:00', categoria: 'VEHICULO', modulo: 5 });
  assert.equal(mala.ok, false);

  const e = await s.editarClase(a.clase.id, { fecha: '2026-12-02', inicio: '16:00', fin: '18:00', modulo: 3, estado: 'CANCELADA' });
  assert.ok(e.ok);
  const c = s.obtener(a.clase.id);
  assert.deepEqual([c.fecha, c.inicio, c.modulo, c.estado], ['2026-12-02', '16:00', 3, 'CANCELADA']);
  assert.equal(resumen(s.clases).canceladas, 1);

  // Pasar a realizada desde el selector de estado registra la fecha.
  await s.editarClase(a.clase.id, { estado: 'REALIZADA' });
  assert.ok(s.obtener(a.clase.id).fechaRealizada);
  await s.editarClase(a.clase.id, { estado: 'PENDIENTE' });
  assert.equal(s.obtener(a.clase.id).fechaRealizada, null);

  await s.eliminarClase(a.clase.id);
  assert.equal(s.clases.length, 84);
  const { s: otro } = await nuevoStore(storage);
  assert.equal(otro.clases.length, 84);
});

test('store: corregir la clase dudosa quita la marca de revisión', async () => {
  const { s } = await nuevoStore();
  assert.equal(s.obtener('2026-11-27-4').revisar, true);
  const r = await s.editarClase('2026-11-27-4', { categoria: 'VEHICULO', modulo: 3 });
  assert.ok(r.ok);
  assert.equal(s.obtener('2026-11-27-4').revisar, false);
  // Sin corregir el módulo, no deja guardar.
  const { s: s2 } = await nuevoStore();
  const mal = await s2.editarClase('2026-11-27-4', { nota: 'x' });
  assert.equal(mal.ok, false);
});

test('store: reprogramar deja la original como REPROGRAMADA y crea copia pendiente', async () => {
  const { s, storage } = await nuevoStore();
  const r = await s.reprogramar('2026-11-11-1', { fecha: '2026-12-02', inicio: '16:00', fin: '18:00' });
  assert.ok(r.ok);
  const orig = s.obtener('2026-11-11-1');
  assert.equal(orig.estado, 'REPROGRAMADA');
  assert.equal(orig.reprogramadaA, r.clase.id);
  assert.equal(r.clase.estado, 'PENDIENTE');
  assert.equal(r.clase.reprogramadaDe, '2026-11-11-1');
  assert.deepEqual([r.clase.categoria, r.clase.modulo], [orig.categoria, orig.modulo]);
  const res = resumen(s.clases);
  assert.equal(res.total, 84);
  assert.equal(res.reprogramadas, 1);
  // No se puede reprogramar dos veces, ni una realizada, ni al mismo horario.
  assert.equal((await s.reprogramar('2026-11-11-1', { fecha: '2026-12-03', inicio: '16:00', fin: '18:00' })).ok, false);
  await s.marcarRealizada('2026-11-12-1');
  assert.equal((await s.reprogramar('2026-11-12-1', { fecha: '2026-12-03', inicio: '16:00', fin: '18:00' })).ok, false);
  assert.equal((await s.reprogramar('2026-11-13-1', { fecha: '2026-11-13', inicio: '08:00', fin: '10:00' })).ok, false);
  // Persiste.
  const { s: otro } = await nuevoStore(storage);
  assert.equal(otro.obtener('2026-11-11-1').estado, 'REPROGRAMADA');
});

test('store: importar un mes nuevo (diciembre) por texto', async () => {
  const { s } = await nuevoStore();
  const texto = '2026-12-01: N5, V2, M6, N2\n2026-12-08: FESTIVO\n2026-11-03: N5';
  const prev = s.previsualizarTexto(texto);
  assert.equal(prev.nuevas.length, 4);
  assert.equal(prev.omitidas, 1, 'la clase que ya existe se omite');
  assert.equal(s.clases.length, 84, 'la vista previa no guarda nada');
  const r = await s.importarTexto(texto);
  assert.ok(r.ok);
  assert.equal(s.clases.length, 88);
  assert.equal(s.festivos.length, 3);
  const malo = await s.importarTexto('2026-12-02: Z9');
  assert.equal(malo.ok, false);
  assert.equal(s.clases.length, 88);
});

test('store: festivos', async () => {
  const { s } = await nuevoStore();
  assert.ok((await s.agregarFestivo('2026-12-08', 'Inmaculada')).ok);
  assert.equal((await s.agregarFestivo('2026-12-08')).ok, false);
  assert.equal((await s.agregarFestivo('2026-99-99')).ok, false);
  await s.eliminarFestivo('2026-11-02');
  assert.deepEqual(s.festivos.map((f) => f.fecha), ['2026-12-08', '2026-11-16'].sort());
});

test('store: copia de seguridad (exportar → importar) y restaurar', async () => {
  const { s } = await nuevoStore();
  await s.marcarRealizada('2026-11-03-1');
  await s.agregarClase({ fecha: '2026-12-01', inicio: '08:00', fin: '10:00', categoria: 'NORMAS', modulo: 1 });
  const copia = JSON.parse(JSON.stringify(s.exportar()));

  const { s: nuevo } = await nuevoStore();
  const r = await nuevo.importarCopia(copia);
  assert.ok(r.ok);
  assert.equal(nuevo.clases.length, 85);
  assert.equal(nuevo.obtener('2026-11-03-1').estado, 'REALIZADA');
  assert.equal(nuevo.obtener('2026-11-27-4').revisar, true, 'la clase dudosa se conserva en la copia');

  assert.equal((await nuevo.importarCopia({ foo: 1 })).ok, false);
  assert.equal((await nuevo.importarCopia({ ...copia, clases: [{ ...copia.clases[0], fecha: 'mal' }] })).ok, false);

  await nuevo.restaurarInicial();
  assert.equal(nuevo.clases.length, 84);
  assert.equal(resumen(nuevo.clases).realizadas, 0);
});

test('repositorio local: datos corruptos se tratan como vacíos', async () => {
  const st = new FakeStorage();
  st.setItem('control-clases:datos:v1', '{no es json');
  const { s } = await nuevoStore(st);
  assert.equal(s.clases.length, 84);
});

// ---------------------------------------------------------------- repositorio HTTP

test('repositorio HTTP: construye las peticiones esperadas', async () => {
  const llamadas = [];
  const fakeFetch = async (url, init) => {
    llamadas.push([init.method, url, init.body ? JSON.parse(init.body) : undefined, init.headers.Authorization]);
    const vacio = init.method === 'DELETE';
    return { ok: true, status: vacio ? 204 : 200, json: async () => (url.endsWith('/clases') && init.method === 'GET' ? [{ id: 'a' }] : url.endsWith('/festivos') && init.method === 'GET' ? [] : {}) };
  };
  const repo = new HttpRepository('https://x.test/api/', () => ({ Authorization: 'Bearer t' }), fakeFetch);
  const datos = await repo.cargar();
  assert.equal(datos.clases.length, 1);
  await repo.crearClase({ id: 'b' });
  await repo.actualizarClase('b/1', { id: 'b/1' });
  await repo.eliminarClase('b');
  await repo.crearFestivo({ fecha: '2026-12-08', nombre: 'F' });
  await repo.eliminarFestivo('2026-12-08');
  await repo.reemplazarTodo({ clases: [], festivos: [] });
  assert.deepEqual(llamadas.map((l) => `${l[0]} ${l[1].replace('https://x.test/api', '')}`), [
    'GET /clases', 'GET /festivos', 'POST /clases', 'PUT /clases/b%2F1', 'DELETE /clases/b',
    'POST /festivos', 'DELETE /festivos/2026-12-08', 'PUT /importacion',
  ]);
  assert.ok(llamadas.every((l) => l[3] === 'Bearer t'));

  const malo = new HttpRepository('https://x.test', () => ({}), async () => ({ ok: false, status: 500 }));
  await assert.rejects(() => malo.crearClase({}), /HTTP 500/);
});

test('el store funciona igual con el repositorio HTTP (mismo contrato)', async () => {
  const bd = { clases: [], festivos: [] };
  const fakeFetch = async (url, init) => {
    const ruta = url.replace('https://x.test/api', '');
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });
    if (init.method === 'GET' && ruta === '/clases') return ok(bd.clases);
    if (init.method === 'GET' && ruta === '/festivos') return ok(bd.festivos);
    if (init.method === 'PUT' && ruta === '/importacion') { bd.clases = body.clases; bd.festivos = body.festivos; return ok(null, 204); }
    if (init.method === 'PUT') { const id = decodeURIComponent(ruta.split('/')[2]); bd.clases[bd.clases.findIndex((c) => c.id === id)] = body; return ok(body); }
    if (init.method === 'POST' && ruta === '/clases') { bd.clases.push(body); return ok(body); }
    throw new Error(`no soportado ${init.method} ${ruta}`);
  };
  const s = new Store(new HttpRepository('https://x.test/api', () => ({}), fakeFetch), relojFijo('2026-11-10T21:35:00.000Z'));
  await s.iniciar();
  assert.equal(bd.clases.length, 84, 'sembró el servidor vacío con el horario inicial');
  await s.marcarRealizada('2026-11-03-1');
  assert.equal(bd.clases.find((c) => c.id === '2026-11-03-1').estado, 'REALIZADA');
});
