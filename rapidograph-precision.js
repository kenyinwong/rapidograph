/**
 * Herramientas de precisión de RapidoGraph (inspiradas en el flujo de
 * Concepts, implementadas desde cero):
 *
 *   · Imán (snap): mientras se dibuja, el cursor se ajusta a los nudos de la
 *     cuadrícula de guías y a los extremos de líneas ya dibujadas.
 *   · Medir: arrastra entre dos puntos y muestra distancia (en unidades y en
 *     la escala real configurada en el panel de guías) y ángulo.
 *   · Empujar (nudge): arrastra cerca de líneas y polilíneas y sus puntos se
 *     desplazan suavemente, con más fuerza cuanto más cerca del cursor.
 *   · Varita (reconocer formas): lo dibujado a mano alzada se convierte en
 *     línea, rectángulo, círculo o elipse limpios cuando la forma se parece.
 *
 * Las coordenadas van en unidades del documento, tomando como referencia el
 * rectángulo de la página (igual que reglas y guías).
 */

const CLAVE_SNAP = 'rg_snap'
const CLAVE_VARITA = 'rg_reconocer'

const sc = () => window.svgEditor && window.svgEditor.svgCanvas

function pagina (editor) {
  const fondo = editor.querySelector('#canvasBackground rect')
  if (!fondo || !sc()) return null
  const rect = fondo.getBoundingClientRect()
  const res = sc().getResolution()
  return { rect, zoom: rect.width / res.w || 1 }
}

const aDocumento = (p, x, y) => [(x - p.rect.left) / p.zoom, (y - p.rect.top) / p.zoom]
const aPantalla = (p, x, y) => [p.rect.left + x * p.zoom, p.rect.top + y * p.zoom]

function estiloDe (el) {
  const attrs = {}
  for (const a of ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity']) {
    const v = el.getAttribute(a)
    if (v !== null) attrs[a] = v
  }
  attrs.fill = 'none'
  return attrs
}

function botonHerramienta (contenedor, icono, rotulo) {
  const b = document.createElement('button')
  b.className = 'rg_herramienta'; b.type = 'button'; b.title = rotulo
  const img = document.createElement('img')
  img.src = './marca/acciones/' + icono + '.svg'; img.alt = rotulo
  img.width = 30; img.height = 30
  b.append(img)
  contenedor.append(b)
  return b
}

/* ------------------------------------------------------------------- imán */

/**
 * Nudos de la cuadrícula: intersecciones entre pares de familias de líneas.
 * Una familia con ángulo θ (0° = horizontal) contiene los puntos P tales que
 * −x·senθ + y·cosθ = i·paso, que es como las dibuja el lienzo de guías.
 */
function nudoCercano (px, py, config) {
  const familias = ({ ortogonal: [0, 90], isometrica: [90, 30, 150], triangular: [0, 60, 120] })[config.tipo] || [0, 90]
  const d = config.distancia
  let mejor = null
  for (let i = 0; i < familias.length; i++) {
    for (let j = i + 1; j < familias.length; j++) {
      const na = anguloANormal(familias[i]); const nb = anguloANormal(familias[j])
      const ka = Math.round((px * na[0] + py * na[1]) / d)
      const kb = Math.round((px * nb[0] + py * nb[1]) / d)
      const det = na[0] * nb[1] - na[1] * nb[0]
      if (Math.abs(det) < 1e-9) continue
      const x = (ka * d * nb[1] - kb * d * na[1]) / det
      const y = (kb * d * na[0] - ka * d * nb[0]) / det
      const dist = Math.hypot(x - px, y - py)
      if (!mejor || dist < mejor.dist) mejor = { x, y, dist }
    }
  }
  return mejor
}

const anguloANormal = (grados) => {
  const r = grados * Math.PI / 180
  return [-Math.sin(r), Math.cos(r)]
}

/** Proyección sobre la línea de cuadrícula más cercana, de cualquier familia. */
function lineaCercana (px, py, config) {
  const familias = ({ ortogonal: [0, 90], isometrica: [90, 30, 150], triangular: [0, 60, 120] })[config.tipo] || [0, 90]
  const d = config.distancia
  let mejor = null
  for (const angulo of familias) {
    const n = anguloANormal(angulo)
    const s = px * n[0] + py * n[1]
    const objetivo = Math.round(s / d) * d
    const dist = Math.abs(s - objetivo)
    if (!mejor || dist < mejor.dist) {
      mejor = { x: px + (objetivo - s) * n[0], y: py + (objetivo - s) * n[1], dist }
    }
  }
  return mejor
}

function extremoCercano (px, py) {
  let mejor = null
  const mirar = (x, y) => {
    const dist = Math.hypot(x - px, y - py)
    if (!mejor || dist < mejor.dist) mejor = { x, y, dist }
  }
  for (const l of document.querySelectorAll('#svgcontent line')) {
    mirar(+l.getAttribute('x1'), +l.getAttribute('y1'))
    mirar(+l.getAttribute('x2'), +l.getAttribute('y2'))
  }
  for (const pl of document.querySelectorAll('#svgcontent polyline')) {
    for (const q of pl.points) mirar(q.x, q.y)
  }
  return mejor
}

function montarIman (editor, herramientas, guias) {
  const zona = editor.querySelector('#workarea')
  let activo = false
  try { activo = localStorage.getItem(CLAVE_SNAP) === '1' } catch { /* sin memoria */ }

  const punto = document.createElement('div')
  punto.id = 'rg_punto_iman'
  punto.hidden = true
  editor.append(punto)

  // modos de dibujo en los que el cursor se imanta
  const MODOS = ['line', 'rect', 'square', 'ellipse', 'circle', 'path', 'polygon', 'star', 'text', 'image']

  /**
   * Punto imantado en unidades del documento, o null si no hay nada cerca.
   * Prioridad: extremos de líneas y nudos de la cuadrícula; si ninguno queda a
   * mano, el punto se apoya sobre la línea de cuadrícula más cercana.
   */
  function imantar (px, py, zoom) {
    const tolerancia = 14 / zoom
    const puntos = []
    const config = guias.obtenerConfig()
    const conCuadricula = config.activas && config.distancia > 0
    if (conCuadricula) {
      const n = nudoCercano(px, py, config)
      if (n) puntos.push(n)
    }
    const e = extremoCercano(px, py)
    if (e) puntos.push(e)
    puntos.sort((a, b) => a.dist - b.dist)
    if (puntos[0] && puntos[0].dist <= tolerancia) return puntos[0]
    if (conCuadricula) {
      const l = lineaCercana(px, py, config)
      if (l && l.dist <= tolerancia) return l
    }
    return null
  }

  // aviso breve al encender el imán sin cuadrícula
  const aviso = document.createElement('div')
  aviso.id = 'rg_aviso_iman'
  aviso.className = 'rg_aviso'
  aviso.hidden = true
  editor.append(aviso)
  let temporizador = null
  function avisar (texto) {
    aviso.textContent = texto
    aviso.hidden = false
    clearTimeout(temporizador)
    temporizador = setTimeout(() => { aviso.hidden = true }, 5000)
  }

  function ajustador (e) {
    if (!activo || e.rgAjustado) return
    const modo = sc() && sc().getMode()
    if (!MODOS.includes(modo)) { punto.hidden = true; return }
    const p = pagina(editor)
    if (!p) return
    const [dx, dy] = aDocumento(p, e.clientX, e.clientY)
    const n = imantar(dx, dy, p.zoom)
    if (!n) { punto.hidden = true; return }
    const [sx, sy] = aPantalla(p, n.x, n.y)
    const base = editor.getBoundingClientRect()
    punto.style.left = (sx - base.left) + 'px'
    punto.style.top = (sy - base.top) + 'px'
    punto.hidden = false
    if (Math.abs(sx - e.clientX) < 0.5 && Math.abs(sy - e.clientY) < 0.5) return
    // el evento original se sustituye por uno idéntico ya imantado
    e.stopImmediatePropagation()
    const clon = new MouseEvent(e.type, {
      bubbles: true,
      cancelable: true,
      clientX: sx,
      clientY: sy,
      button: e.button,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey
    })
    clon.rgAjustado = true
    e.target.dispatchEvent(clon)
  }

  for (const tipo of ['mousedown', 'mousemove', 'mouseup']) {
    zona.addEventListener(tipo, ajustador, true)
  }

  const boton = botonHerramienta(herramientas, 'iman-oscuro', 'Imán: el dibujo se ajusta a la cuadrícula de guías y a los extremos de otras líneas')
  const aplicar = (encendido, avisarlo) => {
    activo = encendido
    boton.classList.toggle('rg_activa', encendido)
    boton.setAttribute('aria-pressed', String(encendido))
    if (!encendido) punto.hidden = true
    try { localStorage.setItem(CLAVE_SNAP, encendido ? '1' : '0') } catch { /* sin memoria */ }
    if (encendido && avisarlo) {
      avisar(guias.obtenerConfig().activas
        ? 'Imán encendido: el trazo se pega a la cuadrícula y a los extremos de otras líneas.'
        : 'Imán encendido. Sin guías visibles solo se pega a extremos de líneas: enciéndelas con el botón de la regla para usar la cuadrícula.')
    }
  }
  boton.addEventListener('click', () => aplicar(!activo, true))
  aplicar(activo, false)

  return { imantar: (x, y, zoom) => (activo ? imantar(x, y, zoom) : null) }
}

/* ------------------------------------------------------------------ medir */

function montarMedir (editor, herramientas, guias, iman) {
  const zona = editor.querySelector('#workarea')
  const lienzo = editor.querySelector('#svgcanvas')
  const capa = document.createElement('canvas')
  capa.id = 'rg_medida'
  capa.className = 'rg_regla'
  lienzo.append(capa)
  const rotulo = document.createElement('div')
  rotulo.id = 'rg_medida_rotulo'
  rotulo.hidden = true
  editor.append(rotulo)

  let activo = false
  let desde = null

  function limpiar () {
    capa.style.display = 'none'
    rotulo.hidden = true
    desde = null
  }

  function dibujar (a, b, p) {
    const base = lienzo.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    capa.style.display = 'block'
    capa.style.left = (p.rect.left - base.left) + 'px'
    capa.style.top = (p.rect.top - base.top) + 'px'
    capa.style.width = p.rect.width + 'px'
    capa.style.height = p.rect.height + 'px'
    capa.width = Math.max(1, Math.round(p.rect.width * dpr))
    capa.height = Math.max(1, Math.round(p.rect.height * dpr))
    const ctx = capa.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, p.rect.width, p.rect.height)
    ctx.strokeStyle = '#dc3839'
    ctx.fillStyle = '#dc3839'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(a.x * p.zoom, a.y * p.zoom)
    ctx.lineTo(b.x * p.zoom, b.y * p.zoom)
    ctx.stroke()
    ctx.setLineDash([])
    for (const q of [a, b]) {
      ctx.beginPath()
      ctx.arc(q.x * p.zoom, q.y * p.zoom, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    const config = guias.obtenerConfig()
    const unidades = Math.hypot(b.x - a.x, b.y - a.y)
    const angulo = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI
    const real = unidades * config.escala
    const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('es-CL')
    rotulo.textContent = `${fmt(unidades)} u  ·  ${fmt(real)} ${config.unidad}  ·  ${fmt((angulo + 360) % 360)}°`
    const [sx, sy] = aPantalla(p, (a.x + b.x) / 2, (a.y + b.y) / 2)
    const rBase = editor.getBoundingClientRect()
    rotulo.style.left = (sx - rBase.left) + 'px'
    rotulo.style.top = (sy - rBase.top - 26) + 'px'
    rotulo.hidden = false
  }

  const puntoDoc = (e, p) => {
    let [x, y] = aDocumento(p, e.clientX, e.clientY)
    const n = iman.imantar(x, y, p.zoom)
    if (n) { x = n.x; y = n.y }
    return { x, y }
  }

  function manejar (e) {
    if (!activo) return
    e.preventDefault(); e.stopPropagation()
    const p = pagina(editor)
    if (!p) return
    if (e.type === 'mousedown') { desde = puntoDoc(e, p); return }
    if (!desde) return
    if (e.type === 'mousemove' && e.buttons) dibujar(desde, puntoDoc(e, p), p)
    if (e.type === 'mouseup') { dibujar(desde, puntoDoc(e, p), p); desde = null }
  }
  for (const tipo of ['mousedown', 'mousemove', 'mouseup', 'click', 'pointerdown', 'pointerup']) {
    zona.addEventListener(tipo, (e) => {
      if (!activo) return
      if (tipo === 'pointerdown' || tipo === 'pointerup') { e.stopPropagation(); return }
      if (tipo === 'click') { e.preventDefault(); e.stopPropagation(); return }
      manejar(e)
    }, true)
  }

  const boton = botonHerramienta(herramientas, 'regla-oscuro',
    'Medir: arrastra entre dos puntos; la escala se define en el panel de guías')
  function aplicar (encendido) {
    activo = encendido
    boton.classList.toggle('rg_activa', encendido)
    if (encendido) { sc().setMode('select'); sc().clearSelection() } else limpiar()
  }
  boton.addEventListener('click', () => aplicar(!activo))
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && activo) aplicar(false) }, true)
}

/* ---------------------------------------------------------------- empujar */

function montarEmpujar (editor, herramientas) {
  const zona = editor.querySelector('#workarea')
  const RADIO = 40                     // unidades del documento
  let activo = false
  let arrastre = null                  // { anterior: [x,y] }

  const halo = document.createElement('div')
  halo.id = 'rg_halo_empuje'
  halo.hidden = true
  editor.append(halo)

  function moverHalo (e, p) {
    const base = editor.getBoundingClientRect()
    const r = RADIO * p.zoom
    halo.style.left = (e.clientX - base.left) + 'px'
    halo.style.top = (e.clientY - base.top) + 'px'
    halo.style.width = (r * 2) + 'px'
    halo.style.height = (r * 2) + 'px'
    halo.hidden = false
  }

  function empujar (cursor, delta) {
    const factor = (dist) => Math.max(0, 1 - dist / RADIO)
    for (const l of document.querySelectorAll('#svgcontent line')) {
      for (const [ax, ay] of [['x1', 'y1'], ['x2', 'y2']]) {
        const x = +l.getAttribute(ax); const y = +l.getAttribute(ay)
        const f = factor(Math.hypot(x - cursor[0], y - cursor[1]))
        if (f > 0) {
          l.setAttribute(ax, Math.round((x + delta[0] * f) * 10) / 10)
          l.setAttribute(ay, Math.round((y + delta[1] * f) * 10) / 10)
        }
      }
    }
    for (const pl of document.querySelectorAll('#svgcontent polyline')) {
      for (const q of pl.points) {
        const f = factor(Math.hypot(q.x - cursor[0], q.y - cursor[1]))
        if (f > 0) { q.x += delta[0] * f; q.y += delta[1] * f }
      }
    }
  }

  function manejar (e) {
    if (!activo) return
    e.preventDefault(); e.stopPropagation()
    const p = pagina(editor)
    if (!p) return
    moverHalo(e, p)
    const ahora = aDocumento(p, e.clientX, e.clientY)
    if (e.type === 'mousedown') {
      const um = sc().undoMgr
      const lineas = [...document.querySelectorAll('#svgcontent line')]
      const polis = [...document.querySelectorAll('#svgcontent polyline')]
      const cambios = []
      for (const a of ['x1', 'y1', 'x2', 'y2']) if (lineas.length) { um.beginUndoableChange(a, lineas); cambios.push(1) }
      if (polis.length) { um.beginUndoableChange('points', polis); cambios.push(1) }
      arrastre = { anterior: ahora, cambios: cambios.length }
      return
    }
    if (!arrastre) return
    if (e.type === 'mousemove' && e.buttons) {
      // la fuerza se mide desde donde venía el cursor: así los puntos tomados
      // al inicio del gesto acompañan todo el arrastre
      empujar(arrastre.anterior, [ahora[0] - arrastre.anterior[0], ahora[1] - arrastre.anterior[1]])
      arrastre.anterior = ahora
    }
    if (e.type === 'mouseup') {
      const um = sc().undoMgr
      for (let i = 0; i < arrastre.cambios; i++) {
        const cmd = um.finishUndoableChange()
        if (!cmd.isEmpty()) sc().addCommandToHistory(cmd)
      }
      arrastre = null
    }
  }
  for (const tipo of ['mousedown', 'mousemove', 'mouseup', 'click', 'pointerdown', 'pointerup']) {
    zona.addEventListener(tipo, (e) => {
      if (!activo) return
      if (tipo === 'pointerdown' || tipo === 'pointerup') { e.stopPropagation(); return }
      if (tipo === 'click') { e.preventDefault(); e.stopPropagation(); return }
      manejar(e)
    }, true)
  }

  const boton = botonHerramienta(herramientas, 'empujar-oscuro',
    'Empujar: arrastra cerca de líneas y polilíneas para ajustarlas suavemente')
  function aplicar (encendido) {
    activo = encendido
    boton.classList.toggle('rg_activa', encendido)
    if (encendido) { sc().setMode('select'); sc().clearSelection() } else halo.hidden = true
  }
  boton.addEventListener('click', () => aplicar(!activo))
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && activo) aplicar(false) }, true)
}

/* ------------------------------------------------------- reconocer formas */

function montarVarita (editor, herramientas) {
  const zona = editor.querySelector('#workarea')
  let activo = false
  try { activo = localStorage.getItem(CLAVE_VARITA) === '1' } catch { /* sin memoria */ }

  // el último trazado que entró al lienzo (el lápiz crea un <path>)
  let ultimoTrazo = null
  const contenido = editor.querySelector('#svgcontent')
  new MutationObserver((cambios) => {
    for (const c of cambios) {
      for (const n of c.addedNodes) {
        if (n.nodeType === 1 && n.tagName.toLowerCase() === 'path') ultimoTrazo = n
      }
    }
  }).observe(contenido, { childList: true, subtree: true })

  function muestras (el, n = 48) {
    const total = el.getTotalLength()
    if (!total || total < 12) return null
    const puntos = []
    for (let i = 0; i <= n; i++) {
      const q = el.getPointAtLength((total * i) / n)
      puntos.push([q.x, q.y])
    }
    return { puntos, total }
  }

  /** Devuelve la figura reconocida o null. */
  function reconocer (el) {
    const m = muestras(el)
    if (!m) return null
    const { puntos, total } = m
    const primero = puntos[0]; const ultimo = puntos[puntos.length - 1]
    const cierre = Math.hypot(ultimo[0] - primero[0], ultimo[1] - primero[1])
    const cerrado = cierre < Math.max(14, total * 0.12)

    if (!cerrado) {
      // ¿línea recta? distancia máxima de los puntos a la cuerda
      const [ax, ay] = primero; const [bx, by] = ultimo
      const largo = Math.hypot(bx - ax, by - ay)
      if (largo < 8) return null
      let maxima = 0
      for (const [x, y] of puntos) {
        const d = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / largo
        maxima = Math.max(maxima, d)
      }
      if (maxima <= Math.max(6, largo * 0.07)) {
        return { element: 'line', attr: { x1: ax, y1: ay, x2: bx, y2: by } }
      }
      return null
    }

    // centro y radios
    const cx = puntos.reduce((s, q) => s + q[0], 0) / puntos.length
    const cy = puntos.reduce((s, q) => s + q[1], 0) / puntos.length
    const radios = puntos.map(([x, y]) => Math.hypot(x - cx, y - cy))
    const rMedio = radios.reduce((s, r) => s + r, 0) / radios.length
    const desvio = Math.sqrt(radios.reduce((s, r) => s + (r - rMedio) ** 2, 0) / radios.length)
    if (rMedio > 6 && desvio / rMedio < 0.17) {
      return { element: 'circle', attr: { cx, cy, r: rMedio } }
    }

    // caja envolvente para rectángulo y elipse
    const xs = puntos.map(q => q[0]); const ys = puntos.map(q => q[1])
    const x0 = Math.min(...xs); const x1 = Math.max(...xs)
    const y0 = Math.min(...ys); const y1 = Math.max(...ys)
    const w = x1 - x0; const h = y1 - y0
    if (w < 10 || h < 10) return null

    // ¿rectángulo? todos los puntos pegados al perímetro de la caja
    const tolRect = Math.max(6, Math.hypot(w, h) * 0.09)
    const pegados = puntos.filter(([x, y]) => Math.min(x - x0, x1 - x, y - y0, y1 - y) <= tolRect).length
    if (pegados >= puntos.length * 0.9) {
      return { element: 'rect', attr: { x: x0, y: y0, width: w, height: h } }
    }

    // ¿elipse? los puntos cumplen la ecuación de la elipse de la caja
    const rx = w / 2; const ry = h / 2
    const ecx = x0 + rx; const ecy = y0 + ry
    const error = puntos.reduce((s, [x, y]) =>
      s + Math.abs(((x - ecx) / rx) ** 2 + ((y - ecy) / ry) ** 2 - 1), 0) / puntos.length
    if (error < 0.22) {
      return { element: 'ellipse', attr: { cx: ecx, cy: ecy, rx, ry } }
    }
    return null
  }

  zona.addEventListener('mouseup', () => {
    if (!activo || !sc() || sc().getMode() !== 'fhpath') return
    setTimeout(() => {
      const el = ultimoTrazo
      if (!el || !el.isConnected) return
      let figura = null
      try { figura = reconocer(el) } catch { return }
      if (!figura) return
      figura.attr = Object.fromEntries(
        Object.entries(figura.attr).map(([k, v]) => [k, Math.round(v * 10) / 10]))
      figura.attr.id = sc().getNextId()
      Object.assign(figura.attr, estiloDe(el))
      const nuevo = sc().addSVGElementsFromJson(figura)
      sc().clearSelection()
      sc().addToSelection([el])
      sc().deleteSelectedElements()
      sc().clearSelection()
      sc().addToSelection([nuevo])
      ultimoTrazo = null
    }, 60)
  })

  const boton = botonHerramienta(herramientas, 'varita-oscuro',
    'Varita: lo que dibujes con el Lápiz se convierte en línea, rectángulo, círculo o elipse')
  const aviso = document.createElement('div')
  aviso.id = 'rg_aviso_varita'
  aviso.className = 'rg_aviso'
  aviso.hidden = true
  editor.append(aviso)
  let temporizador = null
  const aplicar = (encendido, avisarlo) => {
    activo = encendido
    boton.classList.toggle('rg_activa', encendido)
    boton.setAttribute('aria-pressed', String(encendido))
    try { localStorage.setItem(CLAVE_VARITA, encendido ? '1' : '0') } catch { /* sin memoria */ }
    if (avisarlo) {
      aviso.textContent = encendido
        ? 'Varita encendida: dibuja con el Lápiz y el trazo se convertirá en línea, círculo, rectángulo o elipse si se parece.'
        : 'Varita apagada.'
      aviso.hidden = false
      clearTimeout(temporizador)
      temporizador = setTimeout(() => { aviso.hidden = true }, 5000)
    }
    // la varita trabaja sobre el lápiz: al encenderla se deja elegido
    if (encendido && avisarlo) {
      const lapiz = editor.querySelector('#tool_fhpath')
      const div = lapiz && lapiz.shadowRoot && lapiz.shadowRoot.querySelector('div')
      if (div) div.click()
    }
  }
  boton.addEventListener('click', () => aplicar(!activo, true))
  aplicar(activo, false)
}

/* ---------------------------------------------------------------- montaje */

export function montarPrecision (editor, guias) {
  const herramientas = editor.querySelector('#tools_left')
  const iman = montarIman(editor, herramientas, guias)
  montarMedir(editor, herramientas, guias, iman)
  montarEmpujar(editor, herramientas)
  montarVarita(editor, herramientas)
  return { iman }
}
