// Inicio de sesión / registro y estado de la sincronización con la nube.
import { h } from '../utils/dom.js';

/** Pantalla de acceso. ctx.nube: { auth, alEntrar(), usarSinCuenta() } */
export function vistaLogin(ctx) {
  const { auth } = ctx.nube;
  let modo = 'entrar';
  const raiz = h('div', { class: 'login' });

  const pintar = (mensaje = '', tipo = 'aviso') => {
    const entrando = modo === 'entrar';
    const msg = h('p', { class: `nota ${tipo}`, role: 'alert', hidden: !mensaje }, mensaje);
    const email = h('input', { class: 'campo', type: 'email', id: 'login-email', required: true, autocomplete: 'username', placeholder: 'tucorreo@ejemplo.com', 'aria-label': 'Correo electrónico', inputmode: 'email' });
    const clave = h('input', { class: 'campo', type: 'password', id: 'login-clave', required: true, minlength: 6, autocomplete: entrando ? 'current-password' : 'new-password', placeholder: 'Contraseña (mínimo 6 caracteres)', 'aria-label': 'Contraseña' });
    const enviar = h('button', { class: 'btn btn-primario btn-grande', type: 'submit', id: 'login-enviar' }, entrando ? 'Iniciar sesión' : 'Crear cuenta');

    const form = h(
      'form',
      {
        class: 'card cfg',
        novalidate: false,
        onsubmit: async (e) => {
          e.preventDefault();
          enviar.disabled = true;
          enviar.textContent = 'Un momento…';
          try {
            if (entrando) {
              await auth.iniciarSesion(email.value, clave.value);
              await ctx.nube.alEntrar();
            } else {
              const r = await auth.registrar(email.value, clave.value);
              if (r.sesion) await ctx.nube.alEntrar();
              else { modo = 'entrar'; pintar('Cuenta creada. Te enviamos un correo para confirmarla; ábrelo y luego inicia sesión aquí.', 'ok'); }
            }
          } catch (err) {
            const sinRed = err instanceof TypeError;
            pintar(sinRed ? 'No hay conexión con el servidor. Revisa tu internet.' : err.message);
          }
        },
      },
      h('h2', {}, entrando ? '☁️ Entrar a tu cuenta' : '☁️ Crear tu cuenta'),
      h('p', { class: 'nota' }, 'Con tu cuenta tus clases se guardan en la nube y puedes verlas igual en el celular y en el computador.'),
      h('label', { class: 'etiqueta', for: 'login-email' }, 'Correo'),
      email,
      h('label', { class: 'etiqueta', for: 'login-clave' }, 'Contraseña'),
      clave,
      msg,
      enviar,
      h('button', { class: 'btn', type: 'button', onclick: () => { modo = entrando ? 'registro' : 'entrar'; pintar(); } }, entrando ? 'No tengo cuenta · Crear una' : 'Ya tengo cuenta · Iniciar sesión'),
    );
    raiz.replaceChildren(
      form,
      h('button', { class: 'btn btn-texto', type: 'button', id: 'login-local', onclick: () => ctx.nube.usarSinCuenta() }, 'Usar sin cuenta (solo en este dispositivo)'),
    );
    email.focus?.();
  };
  pintar();
  return raiz;
}

const hora = (ms) => new Date(ms).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Tarjeta de Configuración. Devuelve null si la nube no está configurada. */
export function seccionCuenta(ctx) {
  const nube = ctx.nube;
  if (!nube) return null;
  const { auth, sync } = nube;
  if (!auth.haySesion()) {
    return h(
      'section',
      { class: 'card cfg', id: 'seccion-cuenta' },
      h('h2', {}, '☁️ Guardar en la nube'),
      h('p', { class: 'nota' }, 'Ahora tus datos están solo en este dispositivo. Inicia sesión para guardarlos en la nube y verlos en tus otros dispositivos.'),
      h('button', { class: 'btn btn-primario', type: 'button', id: 'btn-entrar-nube', onclick: () => nube.mostrarLogin() }, 'Iniciar sesión o crear cuenta'),
    );
  }
  const r = sync.resumen();
  return h(
    'section',
    { class: 'card cfg', id: 'seccion-cuenta' },
    h('h2', {}, '☁️ Guardado en la nube'),
    h('p', {}, h('strong', {}, auth.email() || 'Cuenta')),
    h(
      'p',
      { class: r.error ? 'nota aviso' : 'nota', id: 'estado-nube' },
      r.error ||
        (r.pendientes ? `${r.pendientes} cambio(s) por enviar…` : `Todo sincronizado${r.ultimaSync ? ` · ${hora(r.ultimaSync)}` : ''}`),
    ),
    h(
      'div',
      { class: 'fila-botones' },
      h('button', { class: 'btn', type: 'button', id: 'btn-sincronizar', onclick: () => nube.sincronizar({ avisar: true }) }, '🔄 Sincronizar ahora'),
      h('button', { class: 'btn btn-texto-peligro', type: 'button', id: 'btn-salir', onclick: () => nube.cerrarSesion() }, 'Cerrar sesión'),
    ),
  );
}
