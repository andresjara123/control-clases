// Supabase simulado en memoria (Auth + PostgREST) para pruebas.
export const CFG = { url: 'https://demo.supabase.co', anonKey: 'anon-publica' };

/** Mini Supabase: Auth + PostgREST (clases, festivos) con aislamiento por usuario. */
export function crearServidor() {
  const s = {
    enLinea: true, confirmarCorreo: false, ahora: 1_700_000_000_000, vidaToken: 3600,
    usuarios: new Map(), tokens: new Map(), refrescos: new Map(), clases: new Map(), festivos: new Map(),
    llamadas: [], n: 0,
  };
  const json = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => (cuerpo === null ? '' : JSON.stringify(cuerpo)) });
  const emitir = (u) => {
    const access = `acc-${++s.n}`, refresh = `ref-${++s.n}`;
    s.tokens.set(access, { id: u.id, exp: s.ahora / 1000 + s.vidaToken });
    s.refrescos.set(refresh, u.id);
    return { access_token: access, refresh_token: refresh, expires_in: s.vidaToken, user: { id: u.id, email: u.email } };
  };
  s.fetch = async (url, init = {}) => {
    if (!s.enLinea) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const h = init.headers || {};
    const cuerpo = init.body ? JSON.parse(init.body) : undefined;
    s.llamadas.push(`${init.method} ${u.pathname}${u.search}`);
    if (h.apikey !== CFG.anonKey) return json(401, { message: 'Invalid API key' });
    if (u.pathname === '/auth/v1/signup') {
      if (s.usuarios.has(cuerpo.email)) return json(422, { msg: 'User already registered' });
      const us = { id: `u-${s.usuarios.size + 1}`, email: cuerpo.email, password: cuerpo.password };
      s.usuarios.set(us.email, us);
      return s.confirmarCorreo ? json(200, { id: us.id, email: us.email }) : json(200, emitir(us));
    }
    if (u.pathname === '/auth/v1/token') {
      const tipo = u.searchParams.get('grant_type');
      if (tipo === 'password') {
        const us = s.usuarios.get(cuerpo.email);
        if (!us || us.password !== cuerpo.password) return json(400, { error_description: 'Invalid login credentials' });
        return json(200, emitir(us));
      }
      const id = s.refrescos.get(cuerpo.refresh_token);
      if (!id) return json(400, { error_description: 'Invalid Refresh Token' });
      return json(200, emitir([...s.usuarios.values()].find((x) => x.id === id)));
    }
    if (u.pathname === '/auth/v1/logout') return json(204, null);
    // REST
    const tk = s.tokens.get((h.Authorization || '').replace('Bearer ', ''));
    if (!tk || tk.exp * 1000 < s.ahora) return json(401, { message: 'JWT expired' });
    const tabla = u.pathname.replace('/rest/v1/', '');
    const mapa = tabla === 'clases' ? s.clases : s.festivos;
    const clave = tabla === 'clases' ? 'id' : 'fecha';
    const propias = () => [...mapa.entries()].filter(([k]) => k.startsWith(`${tk.id}|`)).map(([, v]) => v);
    if (init.method === 'GET') {
      return json(200, propias().sort((a, b) => (a.fecha + (a.inicio || '')).localeCompare(b.fecha + (b.inicio || ''))));
    }
    if (init.method === 'POST') {
      for (const fila of [].concat(cuerpo)) {
        if (fila.user_id !== tk.id) return json(403, { message: 'new row violates row-level security policy' });
        if (tabla === 'clases' && !['PENDIENTE', 'REALIZADA', 'CANCELADA', 'REPROGRAMADA'].includes(fila.estado)) return json(400, { message: 'check constraint' });
        mapa.set(`${tk.id}|${fila[clave]}`, { ...fila });
      }
      return json(201, null);
    }
    if (init.method === 'DELETE') {
      const [campo, filtro] = [...u.searchParams.entries()][0];
      for (const [k, v] of [...mapa.entries()]) {
        if (!k.startsWith(`${tk.id}|`)) continue;
        if (filtro.startsWith('eq.') ? v[campo] === filtro.slice(3) : filtro.startsWith('gte.')) mapa.delete(k);
      }
      return json(204, null);
    }
    return json(405, {});
  };
  return s;
}

