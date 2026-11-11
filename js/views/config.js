// Configuración: instalación, copias de seguridad, meses nuevos, festivos y almacenamiento.
import { h } from '../utils/dom.js';
import { APP_VERSION } from '../config.js';
import { fechaLarga, hoyISO } from '../utils/dates.js';
import { confirmar } from '../ui.js';

const EJEMPLO = `# Una línea por día. M=Movilidad N=Normas V=Vehículo S=Señalización
2026-12-01: N5, V2, M6, N2
2026-12-02: S1, M3, N4, V3
2026-12-05: M1, N2
2026-12-08: FESTIVO`;

function descargar(nombre, texto) {
  const blob = new Blob([texto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportar(ctx) {
  const nombre = `copia-clases-${hoyISO(ctx.store.reloj())}.json`;
  const texto = JSON.stringify(ctx.store.exportar(), null, 2);
  // En el celular se abre la hoja de compartir (permite «Guardar en Archivos»); en el computador se descarga.
  try {
    const archivo = new File([texto], nombre, { type: 'application/json' });
    const tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (tactil && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Copia de seguridad de clases' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  descargar(nombre, texto);
  ctx.toast('Copia de seguridad descargada');
}

function seccionInstalar(ctx) {
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  const cuerpo = [h('h2', {}, '📲 Instalar en el celular')];
  if (standalone) {
    cuerpo.push(h('p', {}, '✅ Ya estás usando la app instalada.'));
  } else {
    if (ctx.instalarEvento) {
      cuerpo.push(
        h('button', { class: 'btn btn-primario btn-grande', type: 'button', onclick: async () => {
          const ev = ctx.instalarEvento;
          ctx.instalarEvento = null;
          ev.prompt();
          await ev.userChoice;
          ctx.render();
        } }, 'Instalar en este dispositivo'),
      );
    }
    cuerpo.push(
      h('p', { class: 'ayuda' }, h('strong', {}, 'Android (Chrome): '), 'menú ⋮ → «Instalar app» o «Añadir a pantalla de inicio».'),
      h('p', { class: 'ayuda' }, h('strong', {}, 'iPhone (Safari): '), 'toca Compartir ⬆️ → «Añadir a pantalla de inicio».'),
    );
  }
  return h('section', { class: 'card cfg' }, cuerpo);
}

function seccionCopias(ctx) {
  const entrada = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true, id: 'archivo-copia',
    onchange: async (e) => {
      const archivo = e.target.files[0];
      e.target.value = '';
      if (!archivo) return;
      let obj;
      try { obj = JSON.parse(await archivo.text()); } catch { ctx.toast('No se pudo leer el archivo.'); return; }
      if (!obj || obj.app !== 'control-clases') { ctx.toast('Ese archivo no es una copia de esta aplicación.'); return; }
      const ok = await confirmar(`Se reemplazarán todos tus datos actuales por los de la copia (${obj.clases?.length ?? 0} clases). ¿Continuar?`, { titulo: 'Importar copia', ok: 'Reemplazar', peligro: true });
      if (!ok) return;
      const r = await ctx.run(() => ctx.store.importarCopia(obj));
      ctx.toast(r.ok ? `Copia importada: ${r.clases} clases` : r.errores[0]);
    },
  });
  return h(
    'section',
    { class: 'card cfg' },
    h('h2', {}, '💾 Copias de seguridad'),
    h('p', { class: 'nota' }, 'Tus datos se guardan en este dispositivo. Descarga una copia de vez en cuando; sirve también para pasar tus clases a otro celular.'),
    h(
      'div',
      { class: 'fila-botones' },
      h('button', { class: 'btn', type: 'button', id: 'btn-exportar', onclick: () => exportar(ctx) }, '⬇️ Exportar copia'),
      h('button', { class: 'btn', type: 'button', onclick: () => entrada.click() }, '⬆️ Importar copia'),
      h('button', { class: 'btn btn-texto-peligro', type: 'button', onclick: async () => {
        const ok = await confirmar('Se borrarán tus cambios y volverá el horario original de noviembre de 2026 (todas las clases como pendientes). ¿Continuar?', { titulo: 'Restaurar horario inicial', ok: 'Restaurar', peligro: true });
        if (!ok) return;
        await ctx.run(() => ctx.store.restaurarInicial());
        ctx.toast('Horario inicial restaurado');
      } }, '↺ Restaurar horario inicial'),
    ),
    entrada,
  );
}

function seccionMeses(ctx) {
  const area = h('textarea', { class: 'campo', id: 'texto-horario', placeholder: EJEMPLO, spellcheck: 'false', 'aria-label': 'Horario en texto' });
  const vista = h('div', { class: 'preview', id: 'vista-previa', hidden: true, role: 'status' });
  const botonImportar = h('button', { class: 'btn btn-primario', type: 'button', id: 'btn-importar', disabled: true }, 'Agregar al calendario');

  let listo = false;
  const actualizar = () => {
    const texto = area.value;
    if (!texto.trim()) { vista.hidden = true; botonImportar.disabled = true; listo = false; return; }
    const p = ctx.store.previsualizarTexto(texto);
    vista.hidden = false;
    vista.className = `preview ${p.errores.length ? 'err' : 'ok'}`;
    const lineas = [];
    if (p.errores.length) {
      lineas.push(h('strong', {}, `Hay ${p.errores.length} ${p.errores.length === 1 ? 'problema' : 'problemas'}:`));
      lineas.push(h('ul', {}, p.errores.slice(0, 8).map((e) => h('li', {}, `Línea ${e.linea}: ${e.mensaje}`))));
    } else {
      lineas.push(h('strong', {}, `Se agregarán ${p.nuevas.length} clases y ${p.festivos.length} festivos.`));
      if (p.omitidas) lineas.push(h('div', {}, `${p.omitidas} ya existían (misma fecha y hora) y se omitirán.`));
    }
    vista.replaceChildren(...lineas);
    listo = !p.errores.length && (p.nuevas.length > 0 || p.festivos.length > 0);
    botonImportar.disabled = !listo;
  };
  area.addEventListener('input', actualizar);
  botonImportar.addEventListener('click', async () => {
    if (!listo) return;
    const r = await ctx.run(() => ctx.store.importarTexto(area.value));
    if (r.ok) { ctx.toast(`✓ ${r.nuevas.length} clases agregadas`); area.value = ''; actualizar(); }
  });

  return h(
    'section',
    { class: 'card cfg' },
    h('h2', {}, '🗓 Agregar un mes u horarios nuevos'),
    h('p', { class: 'nota' }, 'Pega el horario de diciembre (o de cualquier mes) con el formato de abajo. Puedes ver cómo quedará antes de guardarlo. También puedes agregar clases sueltas desde «Mis clases» o el calendario.'),
    h(
      'details',
      { class: 'ayuda' },
      h('summary', {}, 'Ver formato y ejemplo'),
      h('pre', {}, EJEMPLO),
      h('p', { class: 'nota' }, 'Las clases de cada día se asignan en orden a los horarios 8–10, 10–12, 4–6 y 6–8. Para un horario distinto escribe, por ejemplo, M1@14:00-16:00. Las fechas también pueden escribirse como 01/12/2026.'),
    ),
    area,
    vista,
    h('div', { class: 'fila-botones' }, botonImportar, h('button', { class: 'btn', type: 'button', onclick: () => { area.value = EJEMPLO; actualizar(); } }, 'Usar el ejemplo')),
  );
}

function seccionFestivos(ctx) {
  const fecha = h('input', { class: 'campo', type: 'date', id: 'fest-fecha', 'aria-label': 'Fecha del festivo' });
  const nombre = h('input', { class: 'campo', type: 'text', id: 'fest-nombre', placeholder: 'Nombre (opcional)', maxlength: '60', 'aria-label': 'Nombre del festivo' });
  const lista = ctx.store.festivos.length
    ? ctx.store.festivos.map((f) =>
        h(
          'div',
          { class: 'fest-item' },
          h('span', {}, h('strong', {}, fechaLarga(f.fecha)), f.nombre && f.nombre !== 'Festivo' ? ` · ${f.nombre}` : ''),
          h('button', { class: 'btn btn-chico btn-texto-peligro', type: 'button', 'aria-label': `Quitar festivo ${f.fecha}`, onclick: async () => { await ctx.run(() => ctx.store.eliminarFestivo(f.fecha)); } }, 'Quitar'),
        ),
      )
    : h('p', { class: 'nota' }, 'No hay festivos registrados.');
  return h(
    'section',
    { class: 'card cfg' },
    h('h2', {}, '🎉 Festivos (días sin clases)'),
    h('div', {}, lista),
    h('div', { class: 'fila-2' }, fecha, nombre),
    h('button', { class: 'btn', type: 'button', onclick: async () => {
      const r = await ctx.run(() => ctx.store.agregarFestivo(fecha.value, nombre.value));
      ctx.toast(r.ok ? 'Festivo agregado' : r.errores[0]);
    } }, '＋ Agregar festivo'),
  );
}

function seccionAlmacenamiento(ctx) {
  const estado = h('p', { class: 'nota', id: 'estado-almacenamiento' }, 'Comprobando…');
  const boton = h('button', { class: 'btn', type: 'button', hidden: true, onclick: async () => {
    const ok = await navigator.storage.persist();
    ctx.toast(ok ? 'Almacenamiento protegido' : 'El navegador no lo permitió. Instala la app para mayor seguridad.');
    revisar();
  } }, 'Proteger mis datos');
  const revisar = async () => {
    if (!navigator.storage || !navigator.storage.persisted) { estado.textContent = 'Tu navegador guarda los datos en este dispositivo.'; return; }
    const p = await navigator.storage.persisted();
    estado.textContent = p ? '✅ El navegador protegió tus datos: no los borrará por falta de espacio.' : 'ℹ️ Los datos se guardan en este dispositivo. Instala la app y haz copias de seguridad de vez en cuando.';
    boton.hidden = p || !navigator.storage.persist;
  };
  revisar();
  return h(
    'section',
    { class: 'card cfg' },
    h('h2', {}, '🔒 Almacenamiento'),
    estado,
    boton,
    h('p', { class: 'nota' }, `Versión ${APP_VERSION} · ${ctx.store.clases.length} clases registradas`),
  );
}

export function vistaConfig(ctx) {
  return h(
    'div',
    {},
    h('h2', { class: 'titulo-vista' }, 'Configuración'),
    seccionInstalar(ctx),
    seccionMeses(ctx),
    seccionFestivos(ctx),
    seccionCopias(ctx),
    seccionAlmacenamiento(ctx),
  );
}
