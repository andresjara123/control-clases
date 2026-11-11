// Conexión con Supabase (base de datos en la nube).
//
// `url` es la dirección del proyecto. `anonKey` es la clave PÚBLICA («anon» o «publishable key»):
// está pensada para ir en el código del navegador y no da acceso por sí sola, porque las
// tablas están protegidas con Row Level Security (ver supabase/schema.sql).
// NUNCA pongas aquí la clave «service_role» / «secret».
//
// Mientras `anonKey` esté vacía, la app funciona solo con almacenamiento local.
export const SUPABASE = {
  url: 'https://xqexhexjhljyyrazijly.supabase.co',
  anonKey: '',
};

export function nubeConfigurada(cfg = SUPABASE) {
  return Boolean(cfg && cfg.url && cfg.anonKey);
}
