// Pruebas de la sincronización con Supabase usando un servidor simulado en memoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.js';
import { LocalRepository } from '../js/repo/localRepository.js';
import { SupabaseAuth, ErrorAuth } from '../js/repo/supabaseAuth.js';
import { SupabaseRepository, aFila, deFila } from '../js/repo/supabaseRepository.js';
import { SyncRepository } from '../js/repo/syncRepository.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

import { CFG, crearServidor } from './helpers/fakeSupabase.mjs';

async function dispositivo(srv, { ahora } = {}) {
  const storage = new FakeStorage();
  const local = new LocalRepository(storage);
  const auth = new SupabaseAuth(CFG, storage, srv.fetch, ahora || (() => srv.ahora));
  const sync = new SyncRepository(local, new SupabaseRepository(CFG, auth, srv.fetch), auth, storage);
  const store = new Store(sync);
  return { storage, local, auth, sync, store };
}

const filasDe = (srv, uid, t = 'clases') => [...srv[t].entries()].filter(([k]) => k.startsWith(`${uid}|`)).map(([, v]) => v);

test('auth: errores traducidos y registro con confirmación de correo', async () => {
  const srv = crearServidor();
  const { auth } = await dispositivo(srv);
  const r = await auth.registrar('a@x.co', 'secreto1');
  assert.equal(r.sesion, true);
  await auth.cerrarSesion();
  assert.equal(auth.haySesion(), false);
  await assert.rejects(() => auth.iniciarSesion('a@x.co', 'mala'), /Correo o contraseña incorrectos/);
  await assert.rejects(() => auth.registrar('a@x.co', 'secreto1'), /ya tiene cuenta/);
  srv.confirmarCorreo = true;
  const r2 = await auth.registrar('b@x.co', 'secreto1');
  assert.equal(r2.sesion, false);
  assert.equal(auth.haySesion(), false);
});

test('mapeo fila ↔ clase es reversible', () => {
  const c = { id: 'x', fecha: '2026-11-03', inicio: '08:00', fin: '10:00', categoria: 'NORMAS', modulo: 5, estado: 'REALIZADA', fechaRealizada: '2026-11-10T20:00:00.000Z', marcaVerde: true, revisar: false, nota: 'ok', cubiertaPor: 'y' };
  const fila = aFila(c, 'u-1');
  assert.equal(fila.fecha_realizada, c.fechaRealizada);
  assert.deepEqual(deFila({ ...fila, fecha_realizada: '2026-11-10T20:00:00+00:00' }), c);
});

test('primera sincronización sube lo local; marcar sincroniza; otro dispositivo lo recibe', async () => {
  const srv = crearServidor();
  const A = await dispositivo(srv);
  await A.store.iniciar(); // sin sesión: solo local (semilla)
  assert.equal(A.store.clases.length, 84);
  assert.equal(A.sync._cola().length, 0, 'sin sesión no se encola nada');
  await A.store.marcarRealizada('2026-11-04-4'); // ya hay un avance local antes de crear la cuenta
  await A.auth.registrar('a@x.co', 'secreto1');
  await A.store.iniciar();
  const uid = A.auth.usuarioId();
  assert.equal(filasDe(srv, uid).length, 84);
  assert.equal(filasDe(srv, uid).filter((f) => f.estado === 'REALIZADA').length, 4, 'V1 y sus 3 copias ya vistas');
  // marcar una clase más → llega a la nube
  const r = await A.store.marcarRealizada('2026-11-03-3');
  assert.equal(r.ok, true);
  await A.sync.vaciar();
  assert.equal(srv.clases.get(`${uid}|2026-11-03-3`).estado, 'REALIZADA');
  assert.equal(A.sync.resumen().pendientes, 0);
  // otro dispositivo
  const B = await dispositivo(srv);
  await B.auth.iniciarSesion('a@x.co', 'secreto1');
  await B.store.iniciar();
  assert.equal(B.store.obtener('2026-11-03-3').estado, 'REALIZADA');
  assert.equal(B.store.clases.filter((c) => c.estado === 'REALIZADA').length, filasDe(srv, uid).filter((f) => f.estado === 'REALIZADA').length);
  // B desmarca; A lo ve al recargar
  await B.store.desmarcar('2026-11-03-3');
  await B.sync.vaciar();
  assert.equal(await A.store.recargar(), true);
  assert.equal(A.store.obtener('2026-11-03-3').estado, 'PENDIENTE');
  assert.equal(await A.store.recargar(), false, 'sin cambios no repinta');
});

test('sin conexión: se guarda local, queda en cola y se envía al volver; cargar no pisa lo pendiente', async () => {
  const srv = crearServidor();
  const A = await dispositivo(srv);
  await A.auth.registrar('a@x.co', 'secreto1');
  await A.store.iniciar();
  const uid = A.auth.usuarioId();
  srv.enLinea = false;
  await A.store.marcarRealizada('2026-11-12-3'); // Vehículo 2 (12 nov, 4 pm)
  const hechasLocal = A.store.clases.filter((c) => c.estado === 'REALIZADA').length;
  assert.ok(hechasLocal >= 1);
  await A.sync.vaciar();
  assert.ok(A.sync.resumen().pendientes >= 1);
  assert.match(A.sync.resumen().error, /Sin conexión/);
  // recargar sin red conserva lo local
  assert.equal(await A.store.recargar(), false);
  assert.equal(A.store.clases.filter((c) => c.estado === 'REALIZADA').length, hechasLocal);
  // vuelve la red con una cola pendiente: cargar() primero sube y luego descarga
  srv.enLinea = true;
  await A.store.recargar();
  assert.equal(A.sync.resumen().pendientes, 0);
  assert.equal(filasDe(srv, uid).filter((f) => f.estado === 'REALIZADA').length, hechasLocal);
  // la cola sobrevive a cerrar la app: nuevo Store con el mismo almacenamiento
  srv.enLinea = false;
  await A.store.marcarRealizada('2026-11-11-1');
  const pend = A.sync.resumen().pendientes;
  assert.ok(pend > 0);
  const auth2 = new SupabaseAuth(CFG, A.storage, srv.fetch, () => srv.ahora);
  const sync2 = new SyncRepository(A.local, new SupabaseRepository(CFG, auth2, srv.fetch), auth2, A.storage);
  assert.equal(sync2.resumen().pendientes, pend);
  srv.enLinea = true;
  await sync2.vaciar();
  assert.equal(sync2.resumen().pendientes, 0);
});

test('aislamiento: otra cuenta no ve los datos', async () => {
  const srv = crearServidor();
  const A = await dispositivo(srv);
  await A.auth.registrar('a@x.co', 'secreto1');
  await A.store.iniciar();
  await A.sync.vaciar();
  const B = await dispositivo(srv);
  await B.auth.registrar('b@x.co', 'secreto2');
  const repoB = new SupabaseRepository(CFG, B.auth, srv.fetch);
  assert.equal(await repoB.cargar(), null);
  await assert.rejects(() => repoB.crearClase({ ...A.store.clases[0] }).then(() => repoB.cargar()).then((d) => { assert.equal(d.clases.length, 1); throw new Error('ok-aislado'); }), /ok-aislado/);
  assert.equal(filasDe(srv, A.auth.usuarioId()).length, 84, 'las filas de A siguen intactas');
});

test('sesión: el token se renueva solo y, si la renovación es rechazada, se cierra la sesión', async () => {
  const srv = crearServidor();
  const A = await dispositivo(srv);
  await A.auth.registrar('a@x.co', 'secreto1');
  const t1 = await A.auth.tokenValido();
  srv.ahora += 3600 * 1000; // vence
  const t2 = await A.auth.tokenValido();
  assert.notEqual(t1, t2);
  assert.ok(srv.llamadas.some((l) => l.includes('refresh_token')));
  srv.ahora += 3600 * 1000;
  srv.refrescos.clear(); // el servidor ya no reconoce el refresh token
  await assert.rejects(() => A.auth.tokenValido(), (e) => e instanceof ErrorAuth && e.esSesion);
  assert.equal(A.auth.haySesion(), false);
});

test('si la nube rechaza un cambio (4xx) no bloquea la cola', async () => {
  const srv = crearServidor();
  const A = await dispositivo(srv);
  await A.auth.registrar('a@x.co', 'secreto1');
  await A.store.iniciar();
  const malo = { ...A.store.clases[0], id: 'malo', estado: 'RARO' };
  await A.sync.crearClase(malo);
  await A.sync.vaciar();
  assert.equal(A.sync.resumen().pendientes, 0);
  assert.match(A.sync.resumen().error, /rechaz/);
});

test('el correo se normaliza a minúsculas al registrar y al entrar', async () => {
  const srv = crearServidor();
  const { auth } = await dispositivo(srv);
  await auth.registrar('  Jara@Ejemplo.CO ', 'secreto1');
  assert.ok(srv.usuarios.has('jara@ejemplo.co'));
  await auth.cerrarSesion();
  await auth.iniciarSesion('JARA@EJEMPLO.co', 'secreto1');
  assert.equal(auth.haySesion(), true);
});
