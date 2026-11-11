// Creación de elementos del DOM sin innerHTML (el texto del usuario nunca se interpreta como HTML).

/**
 * h('button', { class: 'btn', onclick: fn }, 'Texto', otroNodo, [lista…])
 * Props especiales: class, dataset, value (se asigna al final), on* (eventos).
 * Los valores null/undefined/false se ignoran.
 */
export function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  let valor;
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') valor = v;
    else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const x of hijos.flat(Infinity)) {
    if (x === null || x === undefined || x === false) continue;
    el.append(x instanceof Node ? x : document.createTextNode(String(x)));
  }
  if (valor !== undefined) el.value = valor;
  return el;
}
