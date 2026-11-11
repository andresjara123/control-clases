// Estado de la aplicación. Coordina el repositorio (local o HTTP) con la lógica de negocio.
import { ESTADOS, APP_VERSION } from './config.js';
import { crearDatosIniciales } from './data/seed.js';
import { compararClases, validarClase } from './logic.js';
import { parsearHorarioTexto } from './importer.js';
import { esFechaISO } from './utils/dates.js';

export function nuevoId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `c_${globalThis.crypto.randomUUID()}`;
  }
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Deja la clase con todos sus campos en el formato esperado. */
function normalizar(c, ahoraISO) {
  const estado = ESTADOS[c.estado] ? c.estado : 'PENDIENTE';
  const out = {
    id: c.id,
    fecha: c.fecha,
    inicio: c.inicio,
    fin: c.fin,
    categoria: c.categoria,
    modulo: Number(c.modulo),
    estado,
    fechaRealizada: estado === 'REALIZADA' ? c.fechaRealizada || ahoraISO : null,
    marcaVerde: Boolean(c.marcaVerde),
    revisar: Boolean(c.revisar),
    nota: String(c.nota || '').trim().slice(0, 500),
  };
  if (c.reprogramadaDe) out.reprogramadaDe = c.reprogramadaDe;
  if (c.reprogramadaA) out.reprogramadaA = c.reprogramadaA;
  // Clase marcada automáticamente porque otra oferta del mismo módulo ya se realizó.
  if (estado === 'REALIZADA' && c.cubiertaPor) out.cubiertaPor = c.cubiertaPor;
  return out;
}

export class Store {
  /**
   * @param repo    repositorio (LocalRepository o HttpRepository)
   * @param reloj   función que devuelve la fecha/hora actual (se inyecta en las pruebas)
   */
  constructor(repo, reloj = () => new Date()) {
    this.repo = repo;
    this.reloj = reloj;
    this.clases = [];
    this.festivos = [];
    this.listo = false;
    this._oyentes = new Set();
  }

  subscribe(fn) {
    this._oyentes.add(fn);
    return () => this._oyentes.delete(fn);
  }

  _emitir() {
    for (const fn of this._oyentes) fn();
  }

  _ahoraISO() {
    return this.reloj().toISOString();
  }

  async iniciar() {
    let datos = await this.repo.cargar();
    if (!datos) {
      datos = crearDatosIniciales();
      await this.repo.reemplazarTodo(datos);
    }
    this.clases = datos.clases.slice().sort(compararClases);
    this.festivos = datos.festivos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    await this._reconciliar();
    this.listo = true;
    this._emitir();
  }

  obtener(id) {
    return this.clases.find((c) => c.id === id) || null;
  }

  async _guardarClase(nueva) {
    await this.repo.actualizarClase(nueva.id, nueva);
    const i = this.clases.findIndex((c) => c.id === nueva.id);
    this.clases[i] = nueva;
    this.clases.sort(compararClases);
  }

  // ---- Marcar / desmarcar ----------------------------------------------------

  /**
   * Regla: cada módulo se ve una sola vez. Si un módulo tiene una clase REALIZADA, todas sus
   * demás clases PENDIENTES quedan realizadas (cubiertaPor = la clase que sí se tomó).
   * Se ejecuta al abrir la app (arregla datos guardados antes de esta regla) y tras agregar,
   * editar, eliminar, importar o desmarcar. Devuelve cuántas clases cambió.
   */
  async _reconciliar() {
    const ahora = this._ahoraISO();
    let cambios = 0;
    // 1) Las cubiertas cuyo origen ya no está realizado vuelven a pendiente.
    for (const c of this.clases.slice()) {
      if (!c.cubiertaPor) continue;
      const origen = this.obtener(c.cubiertaPor);
      if (!origen || origen.estado !== 'REALIZADA' || c.estado !== 'REALIZADA') {
        await this._guardarClase(normalizar({ ...c, estado: c.estado === 'REALIZADA' ? 'PENDIENTE' : c.estado, fechaRealizada: null, cubiertaPor: null }, ahora));
        cambios++;
      }
    }
    // 2) Por cada módulo ya visto, las pendientes se marcan como cubiertas.
    const origenes = new Map();
    for (const c of this.clases) {
      if (c.estado !== 'REALIZADA' || c.cubiertaPor) continue;
      const k = `${c.categoria}#${c.modulo}`;
      const previo = origenes.get(k);
      if (!previo || (c.fechaRealizada || '') < (previo.fechaRealizada || '')) origenes.set(k, c);
    }
    for (const c of this.clases.slice()) {
      const origen = origenes.get(`${c.categoria}#${c.modulo}`);
      if (!origen) continue;
      // Duplicados de datos antiguos: otra clase del mismo módulo marcada a mano → queda enlazada al origen.
      if (c.estado === 'REALIZADA' && !c.cubiertaPor && c.id !== origen.id) {
        await this._guardarClase(normalizar({ ...c, cubiertaPor: origen.id }, ahora));
        cambios++;
        continue;
      }
      if (c.estado !== 'PENDIENTE') continue;
      await this._guardarClase(normalizar({ ...c, estado: 'REALIZADA', fechaRealizada: origen.fechaRealizada || ahora, cubiertaPor: origen.id }, ahora));
      cambios++;
    }
    return cambios;
  }

  /**
   * Marca la clase como realizada. Como cada módulo se ve una sola vez, las demás clases
   * PENDIENTES del mismo módulo (otros días) se marcan también y quedan enlazadas a esta
   * (campo cubiertaPor) para poder revertirlas si se desmarca.
   */
  async marcarRealizada(id) {
    const c = this.obtener(id);
    if (!c) return { ok: false, errores: ['La clase ya no existe.'] };
    const ahora = this._ahoraISO();
    await this._guardarClase(normalizar({ ...c, estado: 'REALIZADA', fechaRealizada: ahora, cubiertaPor: null }, ahora));
    const otras = this.clases.filter(
      (o) => o.id !== id && o.categoria === c.categoria && o.modulo === c.modulo && o.estado === 'PENDIENTE',
    );
    for (const o of otras) {
      await this._guardarClase(normalizar({ ...o, estado: 'REALIZADA', fechaRealizada: ahora, cubiertaPor: id }, ahora));
    }
    this._emitir();
    return { ok: true, cubiertas: otras.length };
  }

  /** Desmarca la clase y revierte las que se habían marcado automáticamente por ella. */
  async desmarcar(id) {
    let c = this.obtener(id);
    if (!c) return { ok: false, errores: ['La clase ya no existe.'] };
    // Desmarcar una clase "cubierta" deshace el módulo completo: se desmarca la clase que sí se tomó.
    if (c.cubiertaPor && this.obtener(c.cubiertaPor)) { id = c.cubiertaPor; c = this.obtener(id); }
    const ahora = this._ahoraISO();
    await this._guardarClase(normalizar({ ...c, estado: 'PENDIENTE', fechaRealizada: null, cubiertaPor: null }, ahora));
    const revertir = this.clases.filter((o) => o.cubiertaPor === id && o.estado === 'REALIZADA');
    for (const o of revertir) {
      await this._guardarClase(normalizar({ ...o, estado: 'PENDIENTE', fechaRealizada: null, cubiertaPor: null }, ahora));
    }
    await this._reconciliar();
    this._emitir();
    return { ok: true, revertidas: revertir.length };
  }

  async alternarRealizada(id) {
    const c = this.obtener(id);
    if (!c) return { ok: false, errores: ['La clase ya no existe.'] };
    return c.estado === 'REALIZADA' ? this.desmarcar(id) : this.marcarRealizada(id);
  }

  // ---- Administración de clases ---------------------------------------------

  async agregarClase(datos) {
    const c = normalizar({ ...datos, id: nuevoId() }, this._ahoraISO());
    const errores = validarClase(c, this.clases);
    if (errores.length) return { ok: false, errores };
    await this.repo.crearClase(c);
    this.clases.push(c);
    this.clases.sort(compararClases);
    await this._reconciliar();
    this._emitir();
    return { ok: true, clase: this.obtener(c.id) };
  }

  async editarClase(id, cambios) {
    const actual = this.obtener(id);
    if (!actual) return { ok: false, errores: ['La clase ya no existe.'] };
    // Al guardar una edición manual se da por revisado el dato.
    const nueva = normalizar({ ...actual, ...cambios, id, revisar: false }, this._ahoraISO());
    const errores = validarClase(nueva, this.clases.filter((o) => o.id !== id));
    if (errores.length) return { ok: false, errores };
    await this._guardarClase(nueva);
    await this._reconciliar();
    this._emitir();
    return { ok: true, clase: this.obtener(id) };
  }

  async eliminarClase(id) {
    if (!this.obtener(id)) return { ok: false, errores: ['La clase ya no existe.'] };
    await this.repo.eliminarClase(id);
    this.clases = this.clases.filter((c) => c.id !== id);
    await this._reconciliar();
    this._emitir();
    return { ok: true };
  }

  /**
   * Reprograma: la clase original queda como REPROGRAMADA (historial) y se crea una
   * copia PENDIENTE en la nueva fecha y horario.
   */
  async reprogramar(id, { fecha, inicio, fin }) {
    const orig = this.obtener(id);
    if (!orig) return { ok: false, errores: ['La clase ya no existe.'] };
    if (orig.estado === 'REALIZADA') return { ok: false, errores: ['Una clase realizada no se puede reprogramar. Desmárcala primero.'] };
    if (orig.estado === 'REPROGRAMADA') return { ok: false, errores: ['Esta clase ya fue reprogramada.'] };
    if (orig.fecha === fecha && orig.inicio === inicio) {
      return { ok: false, errores: ['Elige una fecha u hora distinta a la actual.'] };
    }
    const copia = normalizar(
      { ...orig, id: nuevoId(), fecha, inicio, fin, estado: 'PENDIENTE', fechaRealizada: null, revisar: false, reprogramadaDe: id, reprogramadaA: undefined },
      this._ahoraISO(),
    );
    const errores = validarClase(copia, this.clases.filter((o) => o.id !== id));
    if (errores.length) return { ok: false, errores };
    await this.repo.crearClase(copia);
    this.clases.push(copia);
    await this._guardarClase(normalizar({ ...orig, estado: 'REPROGRAMADA', fechaRealizada: null, reprogramadaA: copia.id }, this._ahoraISO()));
    await this._reconciliar();
    this._emitir();
    return { ok: true, clase: copia };
  }

  // ---- Festivos --------------------------------------------------------------

  async agregarFestivo(fecha, nombre = 'Festivo') {
    if (!esFechaISO(fecha)) return { ok: false, errores: ['La fecha no es válida.'] };
    if (this.festivos.some((f) => f.fecha === fecha)) return { ok: false, errores: ['Ese festivo ya está registrado.'] };
    const f = { fecha, nombre: String(nombre || 'Festivo').trim().slice(0, 60) || 'Festivo' };
    await this.repo.crearFestivo(f);
    this.festivos.push(f);
    this.festivos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    this._emitir();
    return { ok: true };
  }

  async eliminarFestivo(fecha) {
    await this.repo.eliminarFestivo(fecha);
    this.festivos = this.festivos.filter((f) => f.fecha !== fecha);
    this._emitir();
    return { ok: true };
  }

  // ---- Meses nuevos (texto) ---------------------------------------------------

  /** Vista previa sin guardar nada. */
  previsualizarTexto(texto) {
    const { clases, festivos, errores } = parsearHorarioTexto(texto);
    const ocupadas = new Set(this.clases.filter((c) => c.estado !== 'REPROGRAMADA').map((c) => `${c.fecha}|${c.inicio}`));
    const nuevas = [];
    let omitidas = 0;
    for (const c of clases) {
      const k = `${c.fecha}|${c.inicio}`;
      if (ocupadas.has(k)) { omitidas++; continue; }
      ocupadas.add(k);
      nuevas.push(c);
    }
    const nuevosFestivos = festivos.filter((f) => !this.festivos.some((x) => x.fecha === f.fecha));
    return { nuevas, omitidas, festivos: nuevosFestivos, errores };
  }

  async importarTexto(texto) {
    const prev = this.previsualizarTexto(texto);
    if (prev.errores.length) return { ok: false, ...prev };
    for (const c of prev.nuevas) {
      const clase = normalizar({ ...c, id: nuevoId() }, this._ahoraISO());
      await this.repo.crearClase(clase);
      this.clases.push(clase);
    }
    for (const f of prev.festivos) {
      await this.repo.crearFestivo(f);
      this.festivos.push(f);
    }
    this.clases.sort(compararClases);
    this.festivos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    await this._reconciliar();
    this._emitir();
    return { ok: true, ...prev };
  }

  // ---- Copias de seguridad ---------------------------------------------------

  exportar() {
    return {
      app: 'control-clases',
      appVersion: APP_VERSION,
      version: 1,
      exportadoEn: this._ahoraISO(),
      clases: this.clases,
      festivos: this.festivos,
    };
  }

  async importarCopia(obj) {
    if (!obj || obj.app !== 'control-clases' || !Array.isArray(obj.clases) || !Array.isArray(obj.festivos)) {
      return { ok: false, errores: ['El archivo no es una copia de seguridad de esta aplicación.'] };
    }
    const clases = [];
    for (const [i, c] of obj.clases.entries()) {
      const n = normalizar({ ...c, id: c.id || nuevoId() }, this._ahoraISO());
      const errs = validarClase(n, []).filter((e) => !e.startsWith('Ya hay una clase'));
      const esFueraDeRango = n.revisar && errs.every((e) => e.includes('tiene módulos'));
      if (errs.length && !esFueraDeRango) {
        return { ok: false, errores: [`Clase ${i + 1} no válida: ${errs.join(' ')}`] };
      }
      clases.push(n);
    }
    const festivos = obj.festivos
      .filter((f) => f && esFechaISO(f.fecha))
      .map((f) => ({ fecha: f.fecha, nombre: String(f.nombre || 'Festivo').slice(0, 60) }));
    await this.repo.reemplazarTodo({ version: 1, clases, festivos });
    this.clases = clases.sort(compararClases);
    this.festivos = festivos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    await this._reconciliar();
    this._emitir();
    return { ok: true, clases: clases.length };
  }

  async restaurarInicial() {
    const datos = crearDatosIniciales();
    await this.repo.reemplazarTodo(datos);
    this.clases = datos.clases.slice().sort(compararClases);
    this.festivos = datos.festivos.slice();
    this._emitir();
    return { ok: true };
  }
}
