// Repositorio remoto: PostgreSQL de Supabase a través de su API REST (PostgREST).
// Cumple el mismo contrato que LocalRepository / HttpRepository.
// Las tablas están protegidas con RLS: solo se ven las filas del usuario con sesión iniciada.
import { ErrorAuth } from './supabaseAuth.js';

export class ErrorHttp extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.status = status;
  }
}

const aISO = (v) => (v ? new Date(v).toISOString() : null);

export function aFila(c, uid) {
  return {
    user_id: uid,
    id: c.id,
    fecha: c.fecha,
    inicio: c.inicio,
    fin: c.fin,
    categoria: c.categoria,
    modulo: c.modulo,
    estado: c.estado,
    fecha_realizada: c.fechaRealizada ?? null,
    marca_verde: Boolean(c.marcaVerde),
    revisar: Boolean(c.revisar),
    nota: c.nota ?? '',
    reprogramada_de: c.reprogramadaDe ?? null,
    reprogramada_a: c.reprogramadaA ?? null,
    cubierta_por: c.cubiertaPor ?? null,
  };
}

export function deFila(r) {
  const c = {
    id: r.id,
    fecha: r.fecha,
    inicio: r.inicio,
    fin: r.fin,
    categoria: r.categoria,
    modulo: r.modulo,
    estado: r.estado,
    fechaRealizada: aISO(r.fecha_realizada),
    marcaVerde: Boolean(r.marca_verde),
    revisar: Boolean(r.revisar),
    nota: r.nota ?? '',
  };
  if (r.reprogramada_de) c.reprogramadaDe = r.reprogramada_de;
  if (r.reprogramada_a) c.reprogramadaA = r.reprogramada_a;
  if (r.cubierta_por) c.cubiertaPor = r.cubierta_por;
  return c;
}

const TODO = 'fecha=gte.0001-01-01'; // PostgREST exige un filtro para borrar; con RLS solo afecta tus filas

export class SupabaseRepository {
  constructor(cfg, auth, fetchImpl = globalThis.fetch?.bind(globalThis)) {
    this.url = cfg.url.replace(/\/$/, '');
    this.anonKey = cfg.anonKey;
    this.auth = auth;
    this.fetch = fetchImpl;
  }

  async _pedir(metodo, ruta, cuerpo, prefer) {
    const token = await this.auth.tokenValido();
    if (!token) throw new ErrorAuth('No has iniciado sesión.', 401, true);
    const resp = await this.fetch(`${this.url}/rest/v1${ruta}`, {
      method: metodo,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (resp.status === 401) throw new ErrorAuth('Tu sesión venció. Inicia sesión de nuevo.', 401, true);
    if (!resp.ok) {
      let detalle = '';
      try { detalle = (await resp.json())?.message || ''; } catch { /* sin cuerpo */ }
      throw new ErrorHttp(`${metodo} ${ruta.split('?')[0]} → HTTP ${resp.status} ${detalle}`.trim(), resp.status);
    }
    if (resp.status === 204) return null;
    const txt = await resp.text();
    return txt ? JSON.parse(txt) : null;
  }

  _uid() {
    const id = this.auth.usuarioId();
    if (!id) throw new ErrorAuth('No has iniciado sesión.', 401, true);
    return id;
  }

  async cargar() {
    const [clases, festivos] = await Promise.all([
      this._pedir('GET', '/clases?select=*&order=fecha.asc,inicio.asc&limit=1000'),
      this._pedir('GET', '/festivos?select=fecha,nombre&order=fecha.asc&limit=1000'),
    ]);
    if (!clases.length && !festivos.length) return null;
    return { version: 1, clases: clases.map(deFila), festivos: festivos.map((f) => ({ fecha: f.fecha, nombre: f.nombre })) };
  }

  async reemplazarTodo(datos) {
    const uid = this._uid();
    await this._pedir('DELETE', `/clases?${TODO}`);
    await this._pedir('DELETE', `/festivos?${TODO}`);
    const filas = datos.clases.map((c) => aFila(c, uid));
    for (let i = 0; i < filas.length; i += 400) {
      await this._pedir('POST', '/clases?on_conflict=user_id,id', filas.slice(i, i + 400), 'resolution=merge-duplicates,return=minimal');
    }
    if (datos.festivos.length) {
      await this._pedir('POST', '/festivos?on_conflict=user_id,fecha', datos.festivos.map((f) => ({ user_id: uid, fecha: f.fecha, nombre: f.nombre })), 'resolution=merge-duplicates,return=minimal');
    }
  }

  // Crear y actualizar son «upsert»: repetir la operación (p. ej. al reintentar la cola) es inofensivo.
  async crearClase(clase) {
    await this._pedir('POST', '/clases?on_conflict=user_id,id', aFila(clase, this._uid()), 'resolution=merge-duplicates,return=minimal');
    return clase;
  }
  actualizarClase(id, clase) {
    return this.crearClase({ ...clase, id });
  }
  async eliminarClase(id) {
    await this._pedir('DELETE', `/clases?id=eq.${encodeURIComponent(id)}`);
  }
  async crearFestivo(festivo) {
    await this._pedir('POST', '/festivos?on_conflict=user_id,fecha', { user_id: this._uid(), fecha: festivo.fecha, nombre: festivo.nombre }, 'resolution=merge-duplicates,return=minimal');
    return festivo;
  }
  async eliminarFestivo(fecha) {
    await this._pedir('DELETE', `/festivos?fecha=eq.${encodeURIComponent(fecha)}`);
  }
}
