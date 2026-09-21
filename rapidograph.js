/**
 * RapidoGraph — capa de interfaz sobre SVG-Edit.
 *
 * No toca el motor del editor: reordena su interfaz una vez montada.
 *   · lienzo a pantalla completa, sin borde de página ni barras de fondo
 *   · todo flota sobre el lienzo: logotipo, comandos de archivo, herramientas,
 *     propiedades, capas y sesión, con botones circulares en relieve
 *   · guías y reglas dibujadas sobre la vista (la cuadrícula es infinita)
 *   · gestos táctiles: un dedo dibuja, dos dedos amplían y desplazan
 *   · exportación a DXF desde el diálogo Exportar
 */

// Los módulos hijos heredan la marca de versión con que se cargó este archivo,
// para que tampoco los sirva la caché del navegador tras publicar un cambio.
const version = new URL(import.meta.url).search
const [{ descargarDXF }, { montarVertices }, { montarPrecision }, { montarDibujo }, lienzoVista, { montarTactil }, { montarSeleccion }] = await Promise.all([
  import('./rapidograph-dxf.js' + version),
  import('./rapidograph-vertices.js' + version),
  import('./rapidograph-precision.js' + version),
  import('./rapidograph-dibujo.js' + version),
  import('./rapidograph-lienzo.js' + version),
  import('./rapidograph-tactil.js' + version),
  import('./rapidograph-seleccion.js' + version)
])
const { crearCapaVista, alCambiarVista, elegirSeleccion } = lienzoVista

const CLAVE_SESION = 'rg_sesion'
const CLAVE_GUIAS = 'rg_guias'

/* ---------------------------------------------------------------- sesión */

export function sesionActual () {
  try {
    const bruto = localStorage.getItem(CLAVE_SESION)
    return bruto ? JSON.parse(bruto) : null
  } catch { return null }
}

function guardarSesion (correo) {
  try {
    localStorage.setItem(CLAVE_SESION, JSON.stringify({ correo, desde: new Date().toISOString() }))
  } catch { /* modo privado: se sigue sin recordar */ }
}

function cerrarSesion () {
  try {
    localStorage.removeItem(CLAVE_SESION)
    // al salir, la interfaz vuelve a cero: se descarta el dibujo y el estado
    // guardados por el editor, para que la próxima sesión parta limpia
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith('svgedit-')) localStorage.removeItem(clave)
    }
  } catch { /* nada que borrar */ }
  location.href = 'inicio.html'
}

/** Devuelve la sesión; si no hay, manda a la portada. */
function exigirSesion () {
  const parametro = new URLSearchParams(location.search).get('correo')
  if (parametro) guardarSesion(parametro)
  const sesion = sesionActual()
  if (!sesion) { location.replace('inicio.html'); return null }
  return sesion
}

/* ------------------------------------------------------------ utilidades */

function esperar (selector, limiteMs = 15000) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now()
    const mirar = () => {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      if (Date.now() - inicio > limiteMs) return reject(new Error('no apareció ' + selector))
      setTimeout(mirar, 60)
    }
    mirar()
  })
}

function crear (etiqueta, props = {}, padre = null) {
  const el = document.createElement(etiqueta)
  Object.assign(el, props)
  if (padre) padre.append(el)
  return el
}

/* ------------------------------------------------- accesos (arriba derecha) */

const CLAVE_CAPAS = 'rg_capas_abiertas'

/** Botón circular con icono, del mismo lenguaje que las herramientas. */
function botonCircular (padre, icono, rotulo) {
  const b = crear('button', { className: 'rg_circular', type: 'button', title: rotulo }, padre)
  b.setAttribute('aria-label', rotulo)
  const img = crear('img', { src: './marca/acciones/' + icono + '.svg', alt: '' }, b)
  img.width = 24; img.height = 24
  return b
}

function montarAccesos (editor, guias) {
  // el menú "SVG-Edit" desaparece: sus comandos son botones flotantes
  const menu = editor.querySelector('#main_button')
  if (menu) menu.style.display = 'none'

  const zona = crear('div', { id: 'rg_sesion' }, editor)
  const botonGuias = botonCircular(zona, 'guias-oscuro', 'Guías y reglas: cuadrícula, distancia, colores y escala')
  botonGuias.classList.add('rg_boton_icono')
  botonGuias.setAttribute('aria-haspopup', 'true')
  botonGuias.addEventListener('click', () => guias.alternarPanel(botonGuias))

  const botonCapas = botonCircular(zona, 'capas-oscuro', 'Mostrar u ocultar el panel de capas')
  const salir = botonCircular(zona, 'salir-oscuro', 'Salir: cierra la sesión y deja el lienzo en blanco')
  salir.addEventListener('click', cerrarSesion)
  return { botonCapas }
}

/* ------------------------------------------------------------------ banda */

// Comandos del antiguo menú "SVG-Edit": id del elemento que ejecuta la acción,
// icono en marca/acciones (versión -oscuro) y rótulo del título.
const ACCIONES = [
  ['tool_clear', 'nuevo', 'Nuevo dibujo'],
  ['tool_open', 'abrir', 'Abrir SVG'],
  ['tool_save', 'guardar', 'Guardar SVG'],
  ['tool_save_as', 'guardar-como', 'Guardar como…'],
  ['tool_import', 'importar', 'Importar imagen'],
  ['tool_export', 'exportar', 'Exportar PNG, JPG o PDF'],
  ['tool_docprops', 'propiedades', 'Propiedades del documento'],
  ['tool_editor_prefs', 'preferencias', 'Preferencias del editor']
]

function montarFlotantes (editor, accesos) {
  // logotipo, arriba a la izquierda
  const marca = crear('div', { id: 'rg_marca' }, editor)
  const logo = crear('img', { src: './marca/rapidograph-tinta.svg', alt: 'RapidoGraph' }, marca)
  logo.width = 156; logo.height = 33

  // Comandos de archivo como botones circulares, al inicio de la fila superior.
  // El editor crea varios de los elementos del menú después de arrancar, así
  // que el destino se busca al hacer clic, no al montar.
  const fila = editor.querySelector('#tools_top')
  const acciones = crear('div', { id: 'rg_acciones' })
  fila.prepend(acciones)
  for (const [id, icono, rotulo] of ACCIONES) {
    const boton = botonCircular(acciones, icono + '-oscuro', rotulo)
    boton.addEventListener('click', () => {
      const destino = document.getElementById(id)
      if (destino) destino.click()
      else window.alert('Esa función todavía se está cargando; prueba de nuevo en un momento.')
    })
  }
  // código, deshacer y rehacer viajan con las acciones: en teléfono todo eso es
  // una tira propia que se desliza, aparte de la tira de propiedades
  for (const id of ['#editor_panel', '#history_panel']) {
    const panel = fila.querySelector(id)
    if (panel) acciones.append(panel)
  }
  const estrecho = window.matchMedia('(max-width: 820px)')
  const ubicarAcciones = () => {
    if (estrecho.matches) { if (acciones.parentNode !== editor) editor.append(acciones) } else if (acciones.parentNode !== fila) fila.prepend(acciones)
  }
  ubicarAcciones()
  estrecho.addEventListener('change', ubicarAcciones)

  // capas: isla flotante a la derecha, plegable y recordada
  const capas = crear('div', { id: 'rg_capas' }, editor)
  crear('p', { className: 'rg_titulo', textContent: 'Capas' }, capas)
  const paneles = editor.querySelector('#sidepanels')
  if (paneles) capas.append(paneles)

  // Las acciones que vivían en el menú contextual "más opciones" son botones
  // visibles junto a los demás. Ese menú despacha un CustomEvent "change" con
  // el gesto pedido; aquí se emite lo mismo.
  const CAPA_ACCIONES = [
    ['dupe', 'capa-duplicar-oscuro', 'Duplicar capa'],
    ['merge_down', 'capa-fusionar-oscuro', 'Fusionar con la capa de abajo'],
    ['merge_all', 'capa-fusionar-todo-oscuro', 'Fusionar todas las capas']
  ]
  const filaCapas = capas.querySelector('#layerbuttons')
  if (filaCapas) {
    for (const [gesto, icono, rotulo] of CAPA_ACCIONES) {
      const boton = crear('button', { className: 'rg_capa_btn', type: 'button', title: rotulo }, filaCapas)
      const img = crear('img', { src: './marca/acciones/' + icono + '.svg', alt: '' }, boton)
      img.width = 18; img.height = 18
      boton.setAttribute('aria-label', rotulo)
      boton.addEventListener('click', () => {
        const menuCapas = document.getElementById('se-cmenu-layers-more')
        if (menuCapas) menuCapas.dispatchEvent(new CustomEvent('change', { detail: { trigger: gesto, source: menuCapas.value } }))
      })
    }
  }
  editor.classList.add('open')   // SVG-Edit solo llena el panel de capas si lo cree desplegado

  // en pantallas estrechas arranca plegada, salvo que el usuario la haya abierto
  let abiertas = window.innerWidth >= 1200
  try {
    const guardado = localStorage.getItem(CLAVE_CAPAS)
    if (guardado !== null) abiertas = guardado === '1'
  } catch { /* sin memoria */ }
  const mostrar = (si) => {
    abiertas = si
    capas.hidden = !si
    editor.classList.toggle('rg_con_capas', si)   // la fila superior le deja sitio
    accesos.botonCapas.classList.toggle('rg_activa', si)
    accesos.botonCapas.setAttribute('aria-pressed', String(si))
    try { localStorage.setItem(CLAVE_CAPAS, si ? '1' : '0') } catch { /* sin memoria */ }
  }
  accesos.botonCapas.addEventListener('click', () => mostrar(!abiertas))
  mostrar(abiertas)
}

/* ----------------------------------------------------- panel de herramientas */

function montarPaleta (editor, guias) {
  const paleta = crear('div', { id: 'rg_paleta' })
  const herramientas = editor.querySelector('#tools_left')
  if (herramientas) paleta.append(herramientas)
  editor.append(paleta)



  /**
   * Reparte los botones en una rejilla de tantas filas como quepan en el alto
   * disponible. Con rejilla el panel se ajusta solo al contenido; el flexbox en
   * columna con salto de línea no sabía calcular su ancho y desbordaba.
   */
  function ajustar () {
    if (!herramientas || !herramientas.children.length) return
    const boton = herramientas.children[0].getBoundingClientRect()
    const alto = boton.height || 54
    // entre la fila superior flotante y el grupo de propiedades de abajo
    const disponible = window.innerHeight - 96 - 118
    const total = [...herramientas.children].filter(h => getComputedStyle(h).display !== 'none').length
    const caben = Math.min(total, Math.max(1, Math.floor(disponible / alto)))
    // columnas parejas: mejor 14 + 13 que 23 + 4. En teléfono siempre son dos
    // columnas: la paleta se desliza en vez de ensancharse sobre el dibujo
    const estrecho = window.matchMedia('(max-width: 820px)').matches
    const filas = Math.ceil(total / (estrecho ? 2 : Math.ceil(total / caben)))
    herramientas.style.display = 'grid'
    herramientas.style.gridAutoFlow = 'column'
    herramientas.style.gridTemplateRows = `repeat(${filas}, auto)`
    herramientas.style.height = 'auto'
    herramientas.style.justifyItems = 'center'
    const derecha = paleta.getBoundingClientRect().right - editor.getBoundingClientRect().left
    editor.style.setProperty('--rg-paleta-der', Math.ceil(derecha + 10) + 'px')
  }

  ajustar()
  window.addEventListener('resize', ajustar)
  return ajustar
}

/* --------------------------------------------------------- guías y reglas */

function configuracionGuias () {
  const porDefecto = {
    activas: false,
    reglas: true,
    distancia: 50,
    color: '#8fa0d8',
    colorPrincipal: '#302a52',
    tipo: 'ortogonal',        // ortogonal | isometrica | triangular
    escala: 1,                // cuántas unidades reales vale 1 unidad del dibujo
    unidad: 'cm'
  }
  try {
    return { ...porDefecto, ...JSON.parse(localStorage.getItem(CLAVE_GUIAS) || '{}') }
  } catch { return porDefecto }
}

// Familias de líneas por tipo de cuadrícula, como ángulo de la línea en grados
// (0 = horizontal). La isométrica lleva verticales y diagonales a 30°; la
// triangular, tres familias a 60° que forman triángulos equiláteros.
const FAMILIAS_GUIA = {
  ortogonal: [0, 90],
  isometrica: [90, 30, 150],
  triangular: [0, 60, 120]
}

/**
 * Cuadrícula de guías y reglas. El lienzo no tiene borde, así que ambas cubren
 * la vista: la cuadrícula es infinita y las reglas son solo marcas y números
 * pegados al borde de la pantalla, sin ninguna barra de fondo.
 */
function montarGuias (editor) {
  const capa = crearCapaVista(editor, 'rg_guias', 2)
  let config = configuracionGuias()

  function guardar () {
    try { localStorage.setItem(CLAVE_GUIAS, JSON.stringify(config)) } catch { /* sin memoria */ }
  }

  const PASOS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
  const paso = (zoom, minimoPx) => PASOS.find(q => q * zoom >= minimoPx) || PASOS[PASOS.length - 1]

  function dibujar () {
    if (!config.activas && !config.reglas) { capa.ocultar(); return }
    const c = capa.contexto()
    if (!c) return
    const { ctx, p, v, dpr, visible, origen } = c

    if (config.activas && config.distancia > 0) {
      const d = config.distancia
      const centro = [(visible.x0 + visible.x1) / 2, (visible.y0 + visible.y1) / 2]
      const alcance = Math.hypot(visible.x1 - visible.x0, visible.y1 - visible.y0) / 2 + d
      // si las líneas quedarían a menos de 4 px se dibuja una de cada cinco
      const salto = d * p.zoom < 4 ? 5 : 1
      ctx.lineWidth = 1 / p.zoom
      for (const angulo of FAMILIAS_GUIA[config.tipo] || FAMILIAS_GUIA.ortogonal) {
        const r = angulo * Math.PI / 180
        const n = [-Math.sin(r), Math.cos(r)]      // normal: n·P = k·d define cada línea
        const u = [Math.cos(r), Math.sin(r)]
        const s0 = centro[0] * n[0] + centro[1] * n[1]
        const desde = Math.ceil((s0 - alcance) / d); const hasta = Math.floor((s0 + alcance) / d)
        const t0 = centro[0] * u[0] + centro[1] * u[1]
        for (let k = desde; k <= hasta; k++) {
          if (k % salto) continue
          const principal = k % 5 === 0
          ctx.beginPath()
          ctx.strokeStyle = principal ? config.colorPrincipal : config.color
          ctx.globalAlpha = principal ? 0.55 : 0.4
          const bx = n[0] * k * d + u[0] * t0; const by = n[1] * k * d + u[1] * t0
          ctx.moveTo(bx - u[0] * alcance, by - u[1] * alcance)
          ctx.lineTo(bx + u[0] * alcance, by + u[1] * alcance)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }

    if (config.reglas) {
      // en píxeles de pantalla, sobre el borde superior e izquierdo de la vista
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = 'rgba(44, 42, 69, .55)'
      ctx.fillStyle = 'rgba(44, 42, 69, .78)'
      ctx.lineWidth = 1
      ctx.font = '10px "Segoe UI", Inter, system-ui, sans-serif'
      const menor = paso(p.zoom, 7); const mayor = paso(p.zoom, 56)
      ctx.beginPath()
      for (let x = Math.ceil(visible.x0 / menor) * menor; x <= visible.x1; x += menor) {
        const px = Math.round(origen[0] + x * p.zoom) + 0.5
        const conNumero = Math.abs(x / mayor - Math.round(x / mayor)) < 1e-6
        ctx.moveTo(px, 0); ctx.lineTo(px, conNumero ? 11 : 5)
        if (conNumero) ctx.fillText(String(Math.round(x)), px + 3, 11)
      }
      for (let y = Math.ceil(visible.y0 / menor) * menor; y <= visible.y1; y += menor) {
        const py = Math.round(origen[1] + y * p.zoom) + 0.5
        const conNumero = Math.abs(y / mayor - Math.round(y / mayor)) < 1e-6
        ctx.moveTo(0, py); ctx.lineTo(conNumero ? 11 : 5, py)
        if (conNumero) {
          ctx.save(); ctx.translate(11, py - 3); ctx.rotate(-Math.PI / 2)
          ctx.fillText(String(Math.round(y)), 0, 0); ctx.restore()
        }
      }
      ctx.stroke()
      void v
    }
  }

  /* --- panel de configuración --- */
  let panel = null

  function construirPanel () {
    panel = crear('div', { id: 'rg_panel_guias' }, editor)
    panel.innerHTML = `
      <label class="rg_fila"><input type="checkbox" id="rg_g_activas"> Mostrar guías</label>
      <label class="rg_fila"><input type="checkbox" id="rg_g_reglas"> Mostrar reglas</label>
      <label class="rg_fila">Distancia
        <input type="number" id="rg_g_distancia" min="1" max="1000" step="1"> unidades
      </label>
      <label class="rg_fila">Líneas
        <input type="color" id="rg_g_color">
      </label>
      <label class="rg_fila">Cada 5 líneas
        <input type="color" id="rg_g_principal">
      </label>
      <label class="rg_fila">Cuadrícula
        <select id="rg_g_tipo">
          <option value="ortogonal">Ortogonal</option>
          <option value="isometrica">Isométrica</option>
          <option value="triangular">Triangular</option>
        </select>
      </label>
      <label class="rg_fila" title="Para la herramienta Medir">Escala: 1 unidad =
        <input type="number" id="rg_g_escala" min="0.001" step="any">
        <input type="text" id="rg_g_unidad" size="4" maxlength="6">
      </label>`
    const activas = panel.querySelector('#rg_g_activas')
    const reglas = panel.querySelector('#rg_g_reglas')
    const distancia = panel.querySelector('#rg_g_distancia')
    const color = panel.querySelector('#rg_g_color')
    const principal = panel.querySelector('#rg_g_principal')
    const tipo = panel.querySelector('#rg_g_tipo')
    const escala = panel.querySelector('#rg_g_escala')
    const unidad = panel.querySelector('#rg_g_unidad')
    activas.checked = config.activas
    reglas.checked = config.reglas
    distancia.value = config.distancia
    color.value = config.color
    principal.value = config.colorPrincipal
    tipo.value = config.tipo
    escala.value = config.escala
    unidad.value = config.unidad
    const aplicar = () => {
      config = {
        activas: activas.checked,
        reglas: reglas.checked,
        distancia: Math.max(1, Number(distancia.value) || 50),
        color: color.value,
        colorPrincipal: principal.value,
        tipo: tipo.value,
        escala: Math.max(0.000001, Number(escala.value) || 1),
        unidad: (unidad.value || 'u').trim()
      }
      guardar()
      dibujar()
    }
    for (const campo of [activas, reglas, distancia, color, principal, tipo, escala, unidad]) {
      campo.addEventListener('input', aplicar)
      campo.addEventListener('change', aplicar)
    }
    document.addEventListener('pointerdown', (e) => {
      if (panel.hidden) return
      if (!panel.contains(e.target) && !e.target.closest?.('.rg_boton_icono')) panel.hidden = true
    })
  }

  function alternarPanel (ancla) {
    if (!panel) { construirPanel(); panel.hidden = true }
    if (!panel.hidden) { panel.hidden = true; return }
    const r = ancla.getBoundingClientRect()
    const e = editor.getBoundingClientRect()
    panel.style.right = 'auto'
    panel.hidden = false
    // se mide ya visible: va bajo el botón y nunca se sale de la pantalla
    const ancho = panel.offsetWidth; const alto = panel.offsetHeight
    const izquierda = Math.min(Math.max(r.right - e.left - ancho, 12), e.width - ancho - 12)
    const arriba = Math.min(r.bottom - e.top + 14, e.height - alto - 12)
    panel.style.left = izquierda + 'px'
    panel.style.top = Math.max(arriba, 12) + 'px'
  }

  panel = null
  const repintar = alCambiarVista(editor, dibujar)
  dibujar()
  return { dibujar, repintar, alternarPanel, obtenerConfig: () => config }
}

/* ------------------------------------------------ terminaciones redondeadas */

const CLAVE_REDONDEO = 'rg_redondeo'

/**
 * Con el modo activo, todo trazo nuevo (líneas, trazados, polilíneas y formas
 * a mano alzada) nace con terminal y uniones redondeados. Lo ya dibujado no se
 * toca: para eso están los selectores de terminal de línea de la barra
 * inferior, que siguen mandando figura por figura.
 */
function montarRedondeo (editor, herramientas) {
  let activo = false
  try { activo = localStorage.getItem(CLAVE_REDONDEO) === '1' } catch { /* sin memoria */ }

  const AFECTADOS = ['line', 'polyline', 'path']
  const redondear = (el) => {
    if (!AFECTADOS.includes(el.tagName?.toLowerCase())) return
    if (!el.hasAttribute('stroke-linecap')) el.setAttribute('stroke-linecap', 'round')
    if (!el.hasAttribute('stroke-linejoin')) el.setAttribute('stroke-linejoin', 'round')
  }

  const observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      for (const n of c.addedNodes) {
        if (n.nodeType !== 1) continue
        redondear(n)
        if (n.querySelectorAll) n.querySelectorAll(AFECTADOS.join(',')).forEach(redondear)
      }
    }
  })

  const contenido = editor.querySelector('#svgcontent')

  const boton = crear('button', { className: 'rg_herramienta', type: 'button' }, herramientas)
  boton.title = 'Terminaciones redondeadas para los trazos nuevos'
  boton.setAttribute('aria-pressed', 'false')
  const img = crear('img', { src: './images/linecap_round.svg', alt: 'Terminaciones redondeadas' }, boton)
  img.width = 30; img.height = 30

  function aplicar (encendido) {
    activo = encendido
    boton.setAttribute('aria-pressed', String(encendido))
    boton.classList.toggle('rg_activa', encendido)
    if (encendido && contenido) observador.observe(contenido, { childList: true, subtree: true })
    else observador.disconnect()
    try { localStorage.setItem(CLAVE_REDONDEO, encendido ? '1' : '0') } catch { /* sin memoria */ }
  }

  boton.addEventListener('click', () => aplicar(!activo))
  aplicar(activo)
}

/* ------------------------------------------------------------ transformar */

/**
 * El recuadro azul con manijas de escala y giro ya no aparece al seleccionar:
 * se pide con este botón. Mientras está apagado el objeto se sigue pudiendo
 * mover y editar por sus extremos; la clase la lee rapidograph-relieve.css.
 */
function montarTransformacion (editor, herramientas) {
  let activo = false
  const boton = crear('button', { className: 'rg_herramienta', type: 'button' }, herramientas)
  boton.title = 'Transformación: muestra el recuadro para escalar y girar lo seleccionado'
  boton.setAttribute('aria-pressed', 'false')
  const img = crear('img', { src: './marca/acciones/transformar-oscuro.svg', alt: 'Transformación' }, boton)
  img.width = 30; img.height = 30

  function aplicar (encendido) {
    activo = encendido
    boton.setAttribute('aria-pressed', String(encendido))
    boton.classList.toggle('rg_activa', encendido)
    editor.classList.toggle('rg_transformar', encendido)
  }

  boton.addEventListener('click', () => {
    if (!activo) {
      document.dispatchEvent(new CustomEvent('rg:modo', { detail: { origen: 'transformar' } }))
      elegirSeleccion()
    }
    aplicar(!activo)
  })
  // elegir cualquier otra herramienta lo apaga
  document.addEventListener('rg:modo', (e) => { if (e.detail.origen !== 'transformar') aplicar(false) })
  document.addEventListener('click', () => {
    if (activo) setTimeout(() => { if (activo && window.svgEditor.svgCanvas.getMode() !== 'select') aplicar(false) }, 0)
  }, true)   // en captura: SVG-Edit detiene la propagación de sus botones
}

/* ----------------------------------------------- DXF en el diálogo exportar */

/**
 * El formato DXF aparece como opción más del diálogo "Exportar". Cuando el
 * usuario lo elige, este interceptor (en fase de captura, antes de que el
 * editor procese el evento) genera el DXF propio en lugar de un mapa de bits.
 */
function montarExportacionDXF () {
  document.addEventListener('change', (e) => {
    const objetivo = e.target
    if (!objetivo || objetivo.tagName !== 'SE-EXPORT-DIALOG') return
    if (!e.detail || e.detail.trigger !== 'ok' || e.detail.imgType !== 'DXF') return
    e.stopImmediatePropagation()
    objetivo.setAttribute('dialog', 'close')
    try {
      const nombre = (document.querySelector('#title_panel p') || {}).textContent || 'dibujo'
      descargarDXF(window.svgEditor.svgCanvas, nombre.trim())
    } catch (err) {
      window.alert('No se pudo exportar a DXF: ' + err.message)
    }
  }, true)
}

/* --------------------------------------------------- barra de propiedades */

function acomodarBarraInferior (editor) {
  // zoom, relleno, trazo y estilo de línea viajan juntos en una isla; la tira
  // de colores queda aparte, a su derecha
  const barra = editor.querySelector('#tools_bottom')
  const paleta = editor.querySelector('#palette')
  if (!barra) return
  const grupo = crear('div', { id: 'rg_propiedades' })
  for (const hijo of [...barra.children]) if (hijo !== paleta) grupo.append(hijo)
  barra.prepend(grupo)
  if (paleta) paleta.classList.add('rg_izquierda')
  // al mover los selectores de color SVG-Edit les dibuja un segundo cuadro de
  // muestra, que cae fuera de la isla: el vigente es el último, sobra el resto
  const unSoloCuadro = () => {
    for (const id of ['#fill_color', '#stroke_color']) {
      const selector = editor.querySelector(id)
      const cuadros = selector && selector.shadowRoot ? [...selector.shadowRoot.querySelectorAll('#block > svg')] : []
      cuadros.slice(0, -1).forEach(c => c.remove())
    }
  }
  unSoloCuadro()
  for (const espera of [500, 1500, 4000]) setTimeout(unSoloCuadro, espera)
}

/* ---------------------------------------------------------- vista inicial */

/**
 * El lienzo no tiene borde, así que no puede arrancar arrimado a una esquina:
 * la vista se centra en el dibujo existente o, si está vacío, en medio.
 */
function centrarVista (editor) {
  const zona = editor.querySelector('#workarea')
  const fondo = editor.querySelector('#canvasBackground rect')
  const contenido = editor.querySelector('#svgcontent')
  if (!zona || !fondo) return
  let objetivo = fondo.getBoundingClientRect()
  const dibujo = contenido && [...contenido.querySelectorAll('g.layer > *:not(title)')]
  if (dibujo && dibujo.length) {
    const cajas = dibujo.map(el => el.getBoundingClientRect()).filter(r => r.width || r.height)
    if (cajas.length) {
      const izq = Math.min(...cajas.map(r => r.left)); const der = Math.max(...cajas.map(r => r.right))
      const arr = Math.min(...cajas.map(r => r.top)); const aba = Math.max(...cajas.map(r => r.bottom))
      objetivo = { left: izq, top: arr, width: der - izq, height: aba - arr }
    }
  }
  const v = zona.getBoundingClientRect()
  zona.scrollLeft += objetivo.left + objetivo.width / 2 - (v.left + zona.clientWidth / 2)
  zona.scrollTop += objetivo.top + objetivo.height / 2 - (v.top + zona.clientHeight / 2)
}

/* -------------------------------------------------------------- arranque */

export async function iniciarRapidoGraph () {
  // El módulo se arranca solo al importarse; esta guarda evita montar dos veces
  // la interfaz si además alguien llama a la función a mano.
  if (window.rapidoGraph) return window.rapidoGraph
  window.rapidoGraph = { montando: true }
  const sesion = exigirSesion()
  if (!sesion) return
  document.title = 'RapidoGraph'
  const editor = await esperar('.svg_editor')
  await esperar('#tools_left')
  const guias = montarGuias(editor)
  const accesos = montarAccesos(editor, guias)
  montarFlotantes(editor, accesos)
  const ajustarPaleta = montarPaleta(editor, guias)
  montarRedondeo(editor, editor.querySelector('#tools_left'))
  montarTransformacion(editor, editor.querySelector('#tools_left'))
  montarSeleccion(editor)
  montarVertices(editor)
  const precision = montarPrecision(editor, guias)
  montarDibujo(editor, precision.iman)
  ajustarPaleta()
  montarExportacionDXF()
  // El rótulo del conector llega sin traducir desde la extensión, que además
  // carga tarde y pisa el título: se corrige durante los primeros segundos.
  let intentos = 0
  const rotularConector = setInterval(() => {
    const conector = editor.querySelector('#tool_connect')
    if (conector && (intentos === 0 || /connector:/.test(conector.title))) {
      conector.title = "Conectar dos objetos: arrastra desde una figura hasta otra"
    }
    if (++intentos > 8) clearInterval(rotularConector)
  }, 1000)
  montarTactil(editor)
  acomodarBarraInferior(editor)
  centrarVista(editor)
  guias.repintar()
  window.rapidoGraph = { redibujarReglas: guias.repintar, ajustarPaleta, guias, sesion, cerrarSesion }
  return window.rapidoGraph
}

if (!new URLSearchParams(location.search).has('sin-shell')) {
  iniciarRapidoGraph().catch(e => console.error('RapidoGraph:', e))
}
