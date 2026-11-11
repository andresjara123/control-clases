// Inicio de sesión con correo y contraseña contra Supabase Auth (GoTrue) usando fetch directo,
// sin dependencias. La sesión se guarda en el almacenamiento local y se renueva sola.

const CLAVE_SESION = 'control-clases:sesion:v1';

export class ErrorAuth extends Error {
  constructor(mensaje, status = 0, esSesion = false) {
    super(mensaje);
    this.name = 'ErrorAuth';
    this.status = status;
    this.esSesion = esSesion; // true = la sesión ya no sirve y hay que volver a entrar
  }
}

function traducir(msg = '', status = 0) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('not confirmed')) return 'Falta confirmar tu correo: abre el mensaje que te enviamos y vuelve a intentar.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (m.includes('password') && (m.includes('6') || m.includes('characters') || m.includes('weak'))) return 'La contraseña es muy corta o débil (mínimo 6 caracteres).';
  if (m.includes('valid email') || m.includes('invalid email') || m.includes('email address') && m.includes('invalid')) return 'El correo no es válido.';
  if (m.includes('rate limit') || status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'El registro de cuentas nuevas está desactivado en este proyecto.';
  return msg || `Error ${status} al contactar el servidor.`;
}

export class SupabaseAuth {
  /**
   * @param {{url:string, anonKey:string}} cfg
   * @param {Storage} storage
   * @param {typeof fetch} [fetchImpl]
   * @param {() => number} [ahora]  milisegundos (inyectable para pruebas)
   */
  constructor(cfg, storage, fetchImpl = globalThis.fetch?.bind(globalThis), ahora = () => Date.now()) {
    this.url = cfg.url.replace(/\/$/, '');
    this.anonKey = cfg.anonKey;
    this.storage = storage;
    this.fetch = fetchImpl;
    this.ahora = ahora;
    this.oyentes = new Set();
    this.sesion = this._leer();
    this._renovando = null;
  }

  _leer() {
    try {
      const s = JSON.parse(this.storage.getItem(CLAVE_SESION));
      return s && s.refresh_token ? s : null;
    } catch {
      return null;
    }
  }

  _guardar(s) {
    this.sesion = s;
    if (s) this.storage.setItem(CLAVE_SESION, JSON.stringify(s));
    else this.storage.removeItem?.(CLAVE_SESION);
    for (const fn of this.oyentes) fn(this);
  }

  onCambio(fn) {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  haySesion() {
    return Boolean(this.sesion?.refresh_token);
  }
  usuarioId() {
    return this.sesion?.user?.id ?? null;
  }
  email() {
    return this.sesion?.user?.email ?? null;
  }

  async _post(ruta, cuerpo, token) {
    const resp = await this.fetch(`${this.url}/auth/v1${ruta}`, {
      method: 'POST',
      headers: { apikey: this.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo ?? {}),
    });
    let datos = null;
    try { datos = await resp.json(); } catch { /* sin cuerpo */ }
    if (!resp.ok) {
      const msg = datos?.msg || datos?.error_description || datos?.message || datos?.error || '';
      throw new ErrorAuth(traducir(msg, resp.status), resp.status);
    }
    return datos;
  }

  _aSesion(d) {
    const ahoraS = Math.floor(this.ahora() / 1000);
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at ?? ahoraS + (d.expires_in ?? 3600),
      user: d.user ? { id: d.user.id, email: d.user.email } : this.sesion?.user ?? null,
    };
  }

  async iniciarSesion(email, password) {
    const d = await this._post('/token?grant_type=password', { email: String(email).trim(), password });
    this._guardar(this._aSesion(d));
    return { ok: true };
  }

  /** @returns {{sesion:boolean}} sesion=false cuando el proyecto exige confirmar el correo primero. */
  async registrar(email, password) {
    const d = await this._post('/signup', { email: String(email).trim(), password });
    if (d?.access_token) {
      this._guardar(this._aSesion(d));
      return { sesion: true };
    }
    return { sesion: false };
  }

  async cerrarSesion() {
    const token = this.sesion?.access_token;
    this._guardar(null);
    if (token) {
      try { await this._post('/logout', {}, token); } catch { /* ya está cerrada localmente */ }
    }
  }

  /** Devuelve un access_token vigente (renovándolo si hace falta) o null si no hay sesión. */
  async tokenValido() {
    if (!this.sesion) return null;
    if (this.sesion.expires_at * 1000 - this.ahora() > 60_000) return this.sesion.access_token;
    if (!this._renovando) {
      this._renovando = (async () => {
        try {
          const d = await this._post('/token?grant_type=refresh_token', { refresh_token: this.sesion.refresh_token });
          this._guardar(this._aSesion(d));
        } catch (e) {
          if (e instanceof ErrorAuth && [400, 401, 403].includes(e.status)) {
            this._guardar(null);
            throw new ErrorAuth('Tu sesión venció. Inicia sesión de nuevo.', e.status, true);
          }
          throw e; // sin red: se conserva la sesión y se reintenta luego
        } finally {
          this._renovando = null;
        }
      })();
    }
    await this._renovando;
    return this.sesion?.access_token ?? null;
  }
}
