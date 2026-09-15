/**
 * RapidoGraph — capa de interfaz sobre SVG-Edit.
 *
 * No toca el motor del editor: reordena su interfaz una vez montada.
 *   · banda oscura de arriba a abajo con el logotipo centrado, los comandos de
 *     archivo como botones con icono y el panel de capas
 *   · herramientas de dibujo en un panel flotante sobre el lienzo
 *   · reglas dibujadas pegadas al borde exterior de la página
 *   · guías configurables (encender, distancia y colores)
 *   · exportación a DXF y sesión por correo en la barra superior
 */

import { descargarDXF } from './rapidograph-dxf.js'
import { montarVertices } from './rapidograph-vertices.js'
import { montarPrecision } from './rapidograph-precision.js'
import { montarDibujo } from './rapidograph-dibujo.js'

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

/* -------------------------------------------------------- barra superior */

function montarBarraSuperior (editor, sesion, guias) {
  const barra = editor.querySelector('#tools_top')

  // el menú "SVG-Edit" desaparece: sus comandos pasan a la banda como botones
  const menu = editor.querySelector('#main_button')
  if (menu) menu.style.display = 'none'

  const zona = crear('div', { id: 'rg_sesion' })

  // guías de dibujo: interruptor con icono de regla en la barra superior
  const botonGuias = crear('button', { className: 'rg_boton rg_boton_icono', type: 'button' }, zona)
  botonGuias.title = 'Guías de dibujo: encender, distancia y colores'
  botonGuias.setAttribute('aria-haspopup', 'true')
  const imgGuias = crear('img', { src: './marca/acciones/regla-oscuro.svg', alt: 'Guías' }, botonGuias)
  imgGuias.width = 20; imgGuias.height = 20
  botonGuias.addEventListener('click', () => guias.alternarPanel(botonGuias))

  if (sesion) {
    if (sesion.correo) crear('span', { className: 'rg_correo', textContent: sesion.correo, title: sesion.correo }, zona)
    const salir = crear('button', { className: 'rg_boton', textContent: 'Salir', type: 'button' }, zona)
    salir.addEventListener('click', cerrarSesion)
  }
  barra.append(zona)
}

/* ------------------------------------------------------------------ banda */

// Comandos del antiguo menú "SVG-Edit": id del elemento que ejecuta la acción,
// icono blanco en marca/acciones y rótulo del título.
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

function montarBanda (editor) {
  const banda = crear('div', { id: 'rg_banda' })

  // logotipo centrado, en blanco, arriba del todo
  const marca = crear('div', { id: 'rg_marca' }, banda)
  const logo = crear('img', { src: './marca/rapidograph-blanco.svg', alt: 'RapidoGraph' })
  logo.width = 206; logo.height = 50
  marca.append(logo)

  // Comandos de archivo como botones con icono. El editor crea varios de los
  // elementos del menú después de arrancar, así que el destino se busca al
  // hacer clic, no al montar la banda.
  const acciones = crear('div', { id: 'rg_acciones' }, banda)
  for (const [id, icono, rotulo] of ACCIONES) {
    const boton = crear('button', { className: 'rg_accion', type: 'button', title: rotulo }, acciones)
    const img = crear('img', { src: './marca/acciones/' + icono + '.svg', alt: '' }, boton)
    img.width = 30; img.height = 30
    boton.setAttribute('aria-label', rotulo)
    boton.addEventListener('click', () => {
      const destino = document.getElementById(id)
      if (destino) destino.click()
      else window.alert('Esa función todavía se está cargando; prueba de nuevo en un momento.')
    })
  }

  crear('p', { className: 'rg_titulo', textContent: 'Capas' }, banda)
  const paneles = editor.querySelector('#sidepanels')
  if (paneles) banda.append(paneles)

  // Las acciones que vivían en el menú contextual "más opciones" pasan a ser
  // botones visibles junto a los demás del panel de capas. Ese menú despacha
  // un CustomEvent "change" con el gesto pedido; aquí se emite lo mismo.
  const CAPA_ACCIONES = [
    ['dupe', 'capa-duplicar-oscuro', 'Duplicar capa'],
    ['merge_down', 'capa-fusionar-oscuro', 'Fusionar con la capa de abajo'],
    ['merge_all', 'capa-fusionar-todo-oscuro', 'Fusionar todas las capas']
  ]
  const filaCapas = banda.querySelector('#layerbuttons')
  if (filaCapas) {
    for (const [gesto, icono, rotulo] of CAPA_ACCIONES) {
      const boton = crear('button', { className: 'rg_capa_btn', type: 'button', title: rotulo }, filaCapas)
      const img = crear('img', { src: './marca/acciones/' + icono + '.svg', alt: '' }, boton)
      img.width = 18; img.height = 18
      boton.setAttribute('aria-label', rotulo)
      boton.addEventListener('click', () => {
        const menu = document.getElementById('se-cmenu-layers-more')
        if (menu) menu.dispatchEvent(new CustomEvent('change', { detail: { trigger: gesto, source: menu.value } }))
      })
    }
  }
  editor.append(banda)
  editor.classList.add('open')   // el panel de capas queda siempre desplegado
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
    const zona = editor.querySelector('#workarea')
    const disponible = (zona ? zona.getBoundingClientRect().height : window.innerHeight) - 56
    const total = herramientas.children.length
    const filas = Math.min(total, Math.max(1, Math.floor(disponible / alto)))
    herramientas.style.display = 'grid'
    herramientas.style.gridAutoFlow = 'column'
    herramientas.style.gridTemplateRows = `repeat(${filas}, auto)`
    herramientas.style.height = 'auto'
    herramientas.style.justifyItems = 'center'
  }

  ajustar()
  window.addEventListener('resize', ajustar)
  return ajustar
}

/* ------------------------------------------------------------------ guías */

function configuracionGuias () {
  const porDefecto = {
    activas: false,
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
 * Rejilla de guías sobre la página: líneas cada `distancia` unidades del
 * documento y, cada cinco, una línea principal con su propio color.
 */
function montarGuias (editor) {
  const lienzo = editor.querySelector('#svgcanvas')
  const capa = crear('canvas', { id: 'rg_guias', className: 'rg_regla' }, lienzo)
  let config = configuracionGuias()

  function guardar () {
    try { localStorage.setItem(CLAVE_GUIAS, JSON.stringify(config)) } catch { /* sin memoria */ }
  }

  function dibujar () {
    const fondo = editor.querySelector('#canvasBackground rect')
    const svgCanvas = window.svgEditor && window.svgEditor.svgCanvas
    if (!fondo || !svgCanvas) return
    if (!config.activas || config.distancia <= 0) { capa.style.display = 'none'; return }
    const base = lienzo.getBoundingClientRect()
    const pagina = fondo.getBoundingClientRect()
    if (pagina.width < 2) return
    const res = svgCanvas.getResolution()
    const zoom = pagina.width / res.w
    const dpr = window.devicePixelRatio || 1

    capa.style.display = 'block'
    capa.style.left = (pagina.left - base.left) + 'px'
    capa.style.top = (pagina.top - base.top) + 'px'
    capa.style.width = pagina.width + 'px'
    capa.style.height = pagina.height + 'px'
    capa.width = Math.max(1, Math.round(pagina.width * dpr))
    capa.height = Math.max(1, Math.round(pagina.height * dpr))
    const ctx = capa.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, pagina.width, pagina.height)

    // cada familia se dibuja como horizontales dentro de un lienzo girado
    const paso = config.distancia * zoom
    const diag = Math.hypot(pagina.width, pagina.height)
    for (const angulo of FAMILIAS_GUIA[config.tipo] || FAMILIAS_GUIA.ortogonal) {
      ctx.save()
      ctx.beginPath(); ctx.rect(0, 0, pagina.width, pagina.height); ctx.clip()
      ctx.translate(0, 0)
      ctx.rotate(-angulo * Math.PI / 180)
      ctx.lineWidth = 1
      const desde = Math.floor(-diag / paso); const hasta = Math.ceil(diag / paso)
      for (let i = desde; i <= hasta; i++) {
        if (i === 0 && angulo !== 0 && config.tipo !== 'ortogonal') { /* el eje también se dibuja */ }
        ctx.beginPath()
        ctx.strokeStyle = i % 5 === 0 ? config.colorPrincipal : config.color
        ctx.globalAlpha = i % 5 === 0 ? 0.8 : 0.5
        const y = i * paso + 0.5
        ctx.moveTo(-diag, y); ctx.lineTo(diag * 2, y)
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  /* --- panel de configuración --- */
  let panel = null

  function construirPanel () {
    panel = crear('div', { id: 'rg_panel_guias' }, editor)
    panel.innerHTML = `
      <label class="rg_fila"><input type="checkbox" id="rg_g_activas"> Mostrar guías</label>
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
    const distancia = panel.querySelector('#rg_g_distancia')
    const color = panel.querySelector('#rg_g_color')
    const principal = panel.querySelector('#rg_g_principal')
    const tipo = panel.querySelector('#rg_g_tipo')
    const escala = panel.querySelector('#rg_g_escala')
    const unidad = panel.querySelector('#rg_g_unidad')
    activas.checked = config.activas
    distancia.value = config.distancia
    color.value = config.color
    principal.value = config.colorPrincipal
    tipo.value = config.tipo
    escala.value = config.escala
    unidad.value = config.unidad
    const aplicar = () => {
      config = {
        activas: activas.checked,
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
    for (const campo of [activas, distancia, color, principal, tipo, escala, unidad]) {
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
    panel.style.left = Math.min(r.right - e.left + 10, e.width - 260) + 'px'
    panel.style.top = Math.min(Math.max(r.top - e.top, 8), e.height - 250) + 'px'
    panel.style.right = 'auto'
    panel.hidden = false
  }

  panel = null
  capa.style.display = 'none'
  return { dibujar, alternarPanel, obtenerConfig: () => config }
}

/* --------------------------------------------------------------- reglas */

/**
 * Dos reglas dibujadas en canvas y colocadas justo por fuera de la página:
 * miden exactamente lo que mide la página, así que crecen y se encogen con
 * ella y con el zoom.
 */
function montarReglas (editor, guias) {
  const lienzo = editor.querySelector('#svgcanvas')
  if (!lienzo) return () => {}
  const reglaX = crear('canvas', { id: 'rg_regla_x', className: 'rg_regla' }, lienzo)
  const reglaY = crear('canvas', { id: 'rg_regla_y', className: 'rg_regla' }, lienzo)
  const GRUESO = 20

  const pasos = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
  const elegir = (zoom, minimoPx) => pasos.find(p => p * zoom >= minimoPx) || pasos[pasos.length - 1]

  const preparar = (canvas, ancho, alto) => {
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = ancho + 'px'
    canvas.style.height = alto + 'px'
    canvas.width = Math.max(1, Math.round(ancho * dpr))
    canvas.height = Math.max(1, Math.round(alto * dpr))
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, ancho, alto)
    ctx.fillStyle = '#3d3832'
    ctx.strokeStyle = '#3d3832'
    ctx.lineWidth = 1
    ctx.font = '9px "Segoe UI", Inter, system-ui, sans-serif'
    // borde exterior dibujado dentro del canvas: así el ancho del elemento
    // coincide exactamente con el de la página y las marcas no se desplazan
    ctx.save()
    ctx.strokeStyle = '#dfdfe4'
    ctx.strokeRect(0.5, 0.5, ancho - 1, alto - 1)
    ctx.restore()
    return ctx
  }

  function dibujar () {
    const fondo = editor.querySelector('#canvasBackground rect')
    const svgCanvas = window.svgEditor && window.svgEditor.svgCanvas
    if (!fondo || !svgCanvas) return
    const base = lienzo.getBoundingClientRect()
    const pagina = fondo.getBoundingClientRect()
    if (pagina.width < 2 || pagina.height < 2) return
    const res = svgCanvas.getResolution()
    const zoom = pagina.width / res.w
    const izq = pagina.left - base.left
    const arr = pagina.top - base.top

    // regla horizontal
    reglaX.style.display = 'block'
    reglaX.style.left = izq + 'px'
    reglaX.style.top = (arr - GRUESO - 2) + 'px'
    const cx = preparar(reglaX, pagina.width, GRUESO)
    const pasoX = elegir(zoom, 7)
    const etiquetaX = elegir(zoom, 46)
    cx.beginPath()
    for (let u = 0; u <= res.w + 1e-6; u += pasoX) {
      const px = Math.round(u * zoom) + 0.5
      const conNumero = Math.abs(u % etiquetaX) < 1e-6
      cx.moveTo(px, GRUESO)
      cx.lineTo(px, conNumero ? GRUESO - 9 : GRUESO - 4)
      if (conNumero) cx.fillText(String(Math.round(u)), px + 2, 9)
    }
    cx.stroke()

    // regla vertical
    reglaY.style.display = 'block'
    reglaY.style.left = (izq - GRUESO - 2) + 'px'
    reglaY.style.top = arr + 'px'
    const cy = preparar(reglaY, GRUESO, pagina.height)
    const pasoY = elegir(zoom, 7)
    const etiquetaY = elegir(zoom, 46)
    cy.beginPath()
    for (let u = 0; u <= res.h + 1e-6; u += pasoY) {
      const py = Math.round(u * zoom) + 0.5
      const conNumero = Math.abs(u % etiquetaY) < 1e-6
      cy.moveTo(GRUESO, py)
      cy.lineTo(conNumero ? GRUESO - 9 : GRUESO - 4, py)
      if (conNumero) {
        cy.save()
        cy.translate(9, py + 2)
        cy.rotate(-Math.PI / 2)
        cy.fillText(String(Math.round(u)), 2, 0)
        cy.restore()
      }
    }
    cy.stroke()

    guias.dibujar()
  }

  // Sólo se redibuja cuando cambia algo: zoom, tamaño de página o de ventana.
  let pendiente = false
  const pedir = () => {
    if (pendiente) return
    pendiente = true
    setTimeout(() => { pendiente = false; dibujar() }, 16)
  }
  const observador = new MutationObserver(pedir)
  observador.observe(lienzo, { attributes: true, attributeFilter: ['style', 'width', 'height'] })
  const contenido = editor.querySelector('#svgcontent')
  if (contenido) observador.observe(contenido, { attributes: true, attributeFilter: ['width', 'height', 'viewBox', 'style'] })
  window.addEventListener('resize', pedir)
  if (window.ResizeObserver) new ResizeObserver(pedir).observe(lienzo)
  dibujar()
  return pedir
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
  // la paleta de colores va a la izquierda, junto al zoom y los controles
  const paleta = editor.querySelector('#palette')
  if (paleta) paleta.classList.add('rg_izquierda')
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
  montarBarraSuperior(editor, sesion, guias)
  montarBanda(editor)
  const ajustarPaleta = montarPaleta(editor, guias)
  montarRedondeo(editor, editor.querySelector('#tools_left'))
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
  const redibujar = montarReglas(editor, guias)
  acomodarBarraInferior(editor)
  window.rapidoGraph = { redibujarReglas: redibujar, ajustarPaleta, guias, sesion, cerrarSesion }
  return window.rapidoGraph
}

if (!new URLSearchParams(location.search).has('sin-shell')) {
  iniciarRapidoGraph().catch(e => console.error('RapidoGraph:', e))
}
