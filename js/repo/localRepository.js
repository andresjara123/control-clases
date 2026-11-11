// Repositorio local: guarda todo en localStorage del navegador.
//
// La API es asíncrona a propósito: es la misma que expone HttpRepository, de modo que
// el resto de la app no cambia cuando se pase a un backend con base de datos.
//
// Contrato de un repositorio:
//   cargar()                    → { version, clases, festivos } | null
//   reemplazarTodo(datos)       → void
//   crearClase(clase)           → clase
//   actualizarClase(id, clase)  → clase
//   eliminarClase(id)           → void
//   crearFestivo(festivo)       → festivo
//   eliminarFestivo(fecha)      → void

const CLAVE = 'control-clases:datos:v1';

export class LocalRepository {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  _leer() {
    const txt = this.storage.getItem(CLAVE);
    if (!txt) return null;
    try {
      const datos = JSON.parse(txt);
      if (!datos || !Array.isArray(datos.clases) || !Array.isArray(datos.festivos)) return null;
      return datos;
    } catch {
      return null;
    }
  }

  _escribir(datos) {
    this.storage.setItem(CLAVE, JSON.stringify(datos));
  }

  async cargar() {
    return this._leer();
  }

  async reemplazarTodo(datos) {
    this._escribir({ version: datos.version || 1, clases: datos.clases, festivos: datos.festivos });
  }

  async crearClase(clase) {
    const datos = this._leer();
    datos.clases.push(clase);
    this._escribir(datos);
    return clase;
  }

  async actualizarClase(id, clase) {
    const datos = this._leer();
    const i = datos.clases.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`No existe la clase ${id}`);
    datos.clases[i] = clase;
    this._escribir(datos);
    return clase;
  }

  async eliminarClase(id) {
    const datos = this._leer();
    datos.clases = datos.clases.filter((c) => c.id !== id);
    this._escribir(datos);
  }

  async crearFestivo(festivo) {
    const datos = this._leer();
    if (!datos.festivos.some((f) => f.fecha === festivo.fecha)) datos.festivos.push(festivo);
    this._escribir(datos);
    return festivo;
  }

  async eliminarFestivo(fecha) {
    const datos = this._leer();
    datos.festivos = datos.festivos.filter((f) => f.fecha !== fecha);
    this._escribir(datos);
  }
}
