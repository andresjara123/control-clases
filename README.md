# Control de clases de conducción (PWA)

Aplicación web instalable para llevar el control de las clases teóricas del curso (horario de noviembre 2026 ya cargado: 84 clases, 2 festivos).
Sin dependencias ni paso de compilación: son archivos estáticos (HTML + CSS + JavaScript ES modules).

## Funciones
Inicio (avance, tarjetas, siguiente módulo) · Calendario mensual con colores por categoría · Mis clases (filtros por fecha, categoría, módulo, estado; orden por fecha) · Mi progreso por categoría · Configuración (agregar meses, copias de seguridad, festivos).
Marcar/desmarcar clases (guarda fecha y hora de realización), editar, eliminar, cambiar estado, reprogramar y agregar clases o meses nuevos.

**Clases únicas:** cada módulo se ve una sola vez. Al marcar una clase como realizada, las demás clases pendientes del mismo módulo (otros días) se marcan también y muestran "✓ Módulo visto el …". Si desmarcas la clase original, esas se revierten. Las canceladas y reprogramadas no se tocan.

**Cómo se calcula el avance:** el horario repite cada módulo varias veces, así que el % principal cuenta *módulos vistos* de 20 (6 Movilidad + 6 Normas + 4 Vehículo + 4 Señalización). Un módulo cuenta como visto al marcar realizada cualquiera de sus clases. También se muestra "clases realizadas: X de 84".

## Ejecutar localmente
```bash
cd control-clases
npm start            # o: python3 -m http.server 8080
# abrir http://localhost:8080
npm test             # pruebas de la lógica (Node 18+)
```
Hay que servirla por HTTP (no abrir index.html con doble clic): el modo offline/instalación solo funciona en `http://localhost` o `https://`.

## Publicar en Internet (gratis, HTTPS incluido)
- **Netlify Drop:** entra a app.netlify.com/drop y arrastra la carpeta `control-clases`. Obtienes una URL pública.
- **Cloudflare Pages / Vercel:** crea un proyecto "estático" desde la carpeta o un repositorio; sin comando de build y con directorio de salida `.`.
- **GitHub Pages:** sube el contenido a un repositorio → Settings → Pages → rama `main`, carpeta `/ (root)`.

Al publicar cambios, sube `VERSION` en `sw.js` para que los celulares descarguen la versión nueva.

## Instalar en el celular
- **Android (Chrome):** abre la URL → menú ⋮ → "Instalar aplicación" / "Añadir a pantalla de inicio" (o el botón en Configuración).
- **iPhone (Safari):** abre la URL → botón Compartir → "Añadir a pantalla de inicio" → Añadir.
- **Computador (Chrome/Edge):** icono de instalar en la barra de direcciones.

## Datos y persistencia
Se guardan en el `localStorage` del navegador de cada dispositivo (sobreviven a cerrar el navegador o apagar el celular). No se sincronizan entre dispositivos: usa **Configuración → Exportar copia / Importar copia** para respaldar o pasar los datos. Borrar los datos del sitio en el navegador borra el progreso.

## Estructura
```
index.html, manifest.webmanifest, sw.js, icons/, css/styles.css
js/app.js            arranque, rutas, service worker
js/store.js          estado + operaciones (marcar, editar, reprogramar, importar)
js/logic.js          cálculos puros (avance, filtros, siguiente módulo)
js/config.js         categorías, estados, horarios
js/data/seed.js      horario de noviembre 2026
js/repo/             localRepository (actual) · httpRepository (futuro backend)
js/views/            inicio, calendario, clases, progreso, config, claseForm
tests/               pruebas de lógica y repositorios
```

## Camino hacia backend (Angular / Spring Boot / PostgreSQL)
El `Store` solo habla con un *repositorio* con contrato fijo. `httpRepository.js` ya implementa ese contrato contra una API REST; para activarlo, en `js/app.js` cambia `LocalRepository` por `HttpRepository(urlApi, cabeceras)`.
Endpoints que espera (ver cabecera de `js/repo/httpRepository.js`): `GET/POST /clases`, `PUT/DELETE /clases/{id}`, `GET/POST /festivos`, `DELETE /festivos/{fecha}`, `PUT /importacion`.
Tabla `clase(id, fecha, inicio, fin, categoria, modulo, estado, fecha_realizada, nota, reprogramada_de)` y `festivo(fecha, nombre)`; añadir `usuario_id` para autenticación (JWT) y sincronización entre dispositivos.
Los modelos y la lógica están separados de la interfaz, por lo que migrar las vistas a Angular reutiliza `logic.js`, `config.js` y los modelos tal cual.

## Datos a revisar
- **27 nov, 6–8 p. m.:** la imagen dice "Vehículo 6", pero Vehículo solo tiene módulos 1–4. Está marcada "⚠ Revisar dato" para corregirla.
- Las marcas verdes de la imagen no se interpretaron como clases realizadas; se muestran solo como etiqueta informativa.
