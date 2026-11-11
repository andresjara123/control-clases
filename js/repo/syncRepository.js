// Repositorio con sincronización: guarda SIEMPRE primero en el dispositivo (rápido y funciona sin
// internet) y sube los cambios a la nube en segundo plano mediante una cola persistente.
//
//  · Sin sesión iniciada → solo local (modo «sin cuenta»).
//  · Con sesión → cada cambio entra en la cola y se envía; si no hay red, se envía después.
//  · Al abrir la app (cargar): se vacía la cola y se descarga lo de la nube. Si la nube está
//    vacía y este dispositivo tiene datos, se suben (primera sincronización).
//    Si ambos tienen datos, gana la nube y se guarda un respaldo de lo local.
import { ErrorAuth } from './supabaseAuth.js';

const CLAVE_COLA = 'control-clases:cola:v1';
const CLAVE_RESPALDO = 'control-clases:respaldo-local:v1';

const esRed = (e) => e instanceof TypeError || e?.name === 'TypeError';
const esSesion = (e) => e instanceof ErrorAuth && e.esSesion;
const reintentable = (e) => esRed(e) || e?.status >= 500 || e?.status === 429 || e?.status === 408;

function firma(d) {
  return JSON.stringify([
    [...d.clases].sort((a, b) => a.id.localeCompare(b.id)),
    [...d.festivos].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  ]);
}

export class SyncRepository {
  /**
   * @param local   LocalRepository
   * @param remoto  SupabaseRepository (o cualquier repositorio con el mismo contrato)
   * @param auth    SupabaseAuth
   * @param storage Storage para la cola y el respaldo
   */
  constructor(local, remoto, auth, storage, { ahora = () => Date.now() } = {}) {
    this.local = local;
    this.remoto = remoto;
    this.auth = auth;
    this.storage = storage;
    this.ahora = ahora;
    this.estado = { sincronizando: false, ultimaSync: null, error: null };
    this.oyentes = new Set();
    this._vaciando = null;
    this._seq = 0;
  }

  onCambio(fn) {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }
  _emitir() {
    for (const fn of this.oyentes) fn(this.resumen());
  }
  resumen() {
    return { ...this.estado, pendientes: this._cola().length, conSesion: this.auth.haySesion() };
  }

  _cola() {
    try {
      const c = JSON.parse(this.storage.getItem(CLAVE_COLA));
      return Array.isArray(c) ? c : [];
    } catch {
      return [];
    }
  }
  _guardarCola(c) {
    if (c.length) this.storage.setItem(CLAVE_COLA, JSON.stringify(c));
    else this.storage.removeItem?.(CLAVE_COLA);
  }

  /** Borra la cola y el respaldo (al cerrar sesión). */
  olvidar() {
    this.storage.removeItem?.(CLAVE_COLA);
    this.storage.removeItem?.(CLAVE_RESPALDO);
  }

  async _escribir(op, args) {
    await this.local[op](...args);
    if (!this.auth.haySesion()) return;
    const cola = op === 'reemplazarTodo' ? [] : this._cola(); // una importación completa sustituye lo pendiente
    cola.push({ n: `${this.ahora()}-${++this._seq}`, op, args });
    this._guardarCola(cola);
    this._emitir();
    this.vaciar().catch(() => {});
  }

  /** Envía a la nube los cambios pendientes, en orden. Nunca lanza: deja el motivo en estado.error. */
  vaciar() {
    if (this._vaciando) return this._vaciando;
    this._vaciando = (async () => {
      await null; // cede el turno: así `_vaciando` ya está asignado antes de que el bloque `finally` lo limpie
      this.estado.sincronizando = true;
      this._emitir();
      let rechazo = null;
      try {
        for (let cola = this._cola(); cola.length; cola = this._cola()) {
          const { n, op, args } = cola[0];
          try {
            await this.remoto[op](...args);
          } catch (e) {
            if (esSesion(e)) { this.estado.error = 'Tu sesión venció. Inicia sesión de nuevo.'; return; }
            if (reintentable(e)) { this.estado.error = 'Sin conexión: los cambios se enviarán cuando vuelva.'; return; }
            console.error('Cambio rechazado por la nube y descartado:', op, e);
            rechazo = `La nube rechazó un cambio (${e.message}).`;
          }
          // Se quita SOLO el elemento enviado: mientras tanto pudieron encolarse otros (o sustituirse la cola).
          this._guardarCola(this._cola().filter((x) => x.n !== n));
        }
        this.estado.error = rechazo;
        this.estado.ultimaSync = this.ahora();
      } finally {
        this.estado.sincronizando = false;
        this._vaciando = null;
        this._emitir();
      }
    })();
    return this._vaciando;
  }

  async cargar() {
    const local = await this.local.cargar();
    if (!this.auth.haySesion()) return local;
    try {
      await this.vaciar();
      if (this._cola().length) return local; // quedan cambios por subir: no se pisan con la nube
      const remoto = await this.remoto.cargar();
      if (remoto) {
        if (local && firma(local) !== firma(remoto)) this.storage.setItem(CLAVE_RESPALDO, JSON.stringify(local));
        await this.local.reemplazarTodo(remoto);
        this.estado.error = null;
        this.estado.ultimaSync = this.ahora();
        this._emitir();
        return remoto;
      }
      if (local) await this.remoto.reemplazarTodo(local); // primera sincronización
      this.estado.error = null;
      this.estado.ultimaSync = this.ahora();
      this._emitir();
      return local;
    } catch (e) {
      this.estado.error = esSesion(e) ? 'Tu sesión venció. Inicia sesión de nuevo.' : 'Sin conexión con la nube: se usan los datos de este dispositivo.';
      this._emitir();
      return local;
    }
  }

  reemplazarTodo(datos) { return this._escribir('reemplazarTodo', [datos]); }
  crearClase(c) { return this._escribir('crearClase', [c]); }
  actualizarClase(id, c) { return this._escribir('actualizarClase', [id, c]); }
  eliminarClase(id) { return this._escribir('eliminarClase', [id]); }
  crearFestivo(f) { return this._escribir('crearFestivo', [f]); }
  eliminarFestivo(fecha) { return this._escribir('eliminarFestivo', [fecha]); }
}
