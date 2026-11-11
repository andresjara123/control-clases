// Repositorio HTTP para la futura versión con backend (Spring Boot + PostgreSQL).
// Cumple el mismo contrato que LocalRepository. NO está activo por defecto:
// para usarlo, cambia el repositorio en js/app.js (ver README, sección "Pasar a un backend").
//
// Endpoints esperados (JSON):
//   GET    {base}/clases              → [clase]
//   POST   {base}/clases              → clase creada
//   PUT    {base}/clases/{id}         → clase actualizada
//   DELETE {base}/clases/{id}
//   GET    {base}/festivos            → [{fecha, nombre}]
//   POST   {base}/festivos
//   DELETE {base}/festivos/{fecha}
//   PUT    {base}/importacion         → reemplaza todo { clases, festivos } (restaurar / importar copia)

export class HttpRepository {
  /**
   * @param {string} baseUrl  p. ej. 'https://mi-servidor.com/api'
   * @param {() => Record<string,string>} [cabeceras]  p. ej. () => ({ Authorization: 'Bearer …' })
   * @param {typeof fetch} [fetchImpl]
   */
  constructor(baseUrl, cabeceras = () => ({}), fetchImpl = globalThis.fetch?.bind(globalThis)) {
    this.base = baseUrl.replace(/\/$/, '');
    this.cabeceras = cabeceras;
    this.fetch = fetchImpl;
  }

  async _pedir(metodo, ruta, cuerpo) {
    const resp = await this.fetch(`${this.base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...this.cabeceras() },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (!resp.ok) throw new Error(`${metodo} ${ruta} → HTTP ${resp.status}`);
    return resp.status === 204 ? null : resp.json();
  }

  async cargar() {
    const [clases, festivos] = await Promise.all([this._pedir('GET', '/clases'), this._pedir('GET', '/festivos')]);
    if (!clases.length && !festivos.length) return null;
    return { version: 1, clases, festivos };
  }

  async reemplazarTodo(datos) {
    await this._pedir('PUT', '/importacion', { clases: datos.clases, festivos: datos.festivos });
  }

  crearClase(clase) {
    return this._pedir('POST', '/clases', clase);
  }

  actualizarClase(id, clase) {
    return this._pedir('PUT', `/clases/${encodeURIComponent(id)}`, clase);
  }

  async eliminarClase(id) {
    await this._pedir('DELETE', `/clases/${encodeURIComponent(id)}`);
  }

  crearFestivo(festivo) {
    return this._pedir('POST', '/festivos', festivo);
  }

  async eliminarFestivo(fecha) {
    await this._pedir('DELETE', `/festivos/${encodeURIComponent(fecha)}`);
  }
}
