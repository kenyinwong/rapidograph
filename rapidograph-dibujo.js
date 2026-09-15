/**
 * Herramientas de dibujo avanzado de RapidoGraph:
 *
 *   · Polilínea: clic a clic se agregan vértices (imantados si el imán está
 *     activo); doble clic o Enter termina, Esc cancela.
 *   · Paralela (offset): se elige una línea o polilínea, luego el lado, y se
 *     crea una copia paralela a la distancia configurada.
 *   · Bote de pintura: clic dentro de una figura cerrada y se rellena con el
 *     color de relleno vigente.
 *   · Arco por radio: dos clics fijan los extremos; el cursor curva el arco y
 *     muestra el radio; el tercer clic lo confirma.
 *   · Pinceles: preajustes de trazo (fino, medio, grueso, marcador,
 *     resaltador, punteado) que se aplican a todo lo que se dibuje después.
 */

const sc = () => window.svgEditor && window.svgEditor.svgCanvas

function pagina (editor) {
  const fondo = editor.querySelector('#canvasBackground rect')
  if (!fondo || !sc()) return null
  const rect = fondo.getBoundingClientRect()
  const res = sc().getResolution()
  return { rect, zoom: rect.width / res.w || 1 }
}

const aDocumento = (p, x, y) => [(x - p.rect.left) / p.zoom, (y - p.rect.top) / p.zoom]

/** Estilo de trazo vigente del editor, para que lo nuevo salga como lo demás. */
function estiloActual () {
  const estilo = (sc() && sc().getStyle && sc().getStyle()) || {}
  return {
    stroke: estilo.stroke || '#000000',
    'stroke-width': estilo.stroke_width || estilo['stroke-width'] || 2,
    'stroke-opacity': estilo.stroke_opacity ?? 1,
    'stroke-linecap': estilo.stroke_linecap || 'round',
    'stroke-linejoin': estilo.stroke_linejoin || 'round',
    fill: 'none'
  }
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

const redondear = (n) => Math.round(n * 100) / 100

/* --------------------------------------------------------- lienzo de previa */

function crearPrevia (editor) {
  const lienzo = editor.querySelector('#svgcanvas')
  const capa = document.createElement('canvas')
  capa.className = 'rg_regla'
  capa.style.zIndex = 4
  capa.style.background = 'transparent'
  lienzo.append(capa)

  function contexto (p) {
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
    ctx.setTransform(dpr * p.zoom, 0, 0, dpr * p.zoom, 0, 0)
    ctx.clearRect(0, 0, p.rect.width / p.zoom, p.rect.height / p.zoom)
    ctx.strokeStyle = '#dc3839'
    ctx.lineWidth = 1.5 / p.zoom
    return ctx
  }

  return { contexto, ocultar: () => { capa.style.display = 'none' } }
}

/* -------------------------------------------------- gestor de modos propios */

/**
 * Un solo modo propio a la vez: activar uno apaga el anterior. Mientras un
 * modo está activo, los clics del lienzo son suyos (captura y detiene).
 */
function crearGestor (editor) {
  const zona = editor.querySelector('#workarea')
  const aviso = document.createElement('div')
  aviso.id = 'rg_aviso_dibujo'
  aviso.className = 'rg_aviso'
  aviso.hidden = true
  editor.append(aviso)

  let actual = null   // { nombre, boton, alClic, alMover, alDoble, salir }

  const avisar = (texto) => { aviso.textContent = texto || ''; aviso.hidden = !texto }

  function salir () {
    if (!actual) return
    actual.boton.classList.remove('rg_activa')
    if (actual.salir) actual.salir()
    actual = null
    avisar('')
  }

  function activar (modo) {
    const mismo = actual && actual.nombre === modo.nombre
    salir()
    if (mismo) return
    actual = modo
    modo.boton.classList.add('rg_activa')
    sc().setMode('select'); sc().clearSelection()
    avisar(modo.inicio)
  }

  for (const tipo of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
    zona.addEventListener(tipo, (e) => { if (actual) { e.preventDefault(); e.stopPropagation() } }, true)
  }
  zona.addEventListener('click', (e) => {
    if (!actual) return
    e.preventDefault(); e.stopPropagation()
    if (actual.alClic) actual.alClic(e)
  }, true)
  zona.addEventListener('dblclick', (e) => {
    if (!actual) return
    e.preventDefault(); e.stopPropagation()
    if (actual.alDoble) actual.alDoble(e)
  }, true)
  zona.addEventListener('mousemove', (e) => {
    if (actual && actual.alMover) actual.alMover(e)
  }, true)
  document.addEventListener('keydown', (e) => {
    if (!actual) return
    if (e.key === 'Escape') { e.stopPropagation(); salir() }
    if (e.key === 'Enter' && actual.alEnter) { e.stopPropagation(); actual.alEnter() }
  }, true)

  return { activar, salir, avisar, activo: () => actual && actual.nombre }
}

/* ------------------------------------------------------------- polilínea */

function montarPolilinea (editor, herramientas, gestor, previa, iman) {
  let puntos = []

  const punto = (e) => {
    const p = pagina(editor)
    let [x, y] = aDocumento(p, e.clientX, e.clientY)
    const n = iman.imantar(x, y, p.zoom)
    if (n) { x = n.x; y = n.y }
    return [redondear(x), redondear(y)]
  }

  function pintar (cursor) {
    const p = pagina(editor)
    if (!p || !puntos.length) return
    const ctx = previa.contexto(p)
    ctx.beginPath()
    ctx.moveTo(puntos[0][0], puntos[0][1])
    for (const q of puntos.slice(1)) ctx.lineTo(q[0], q[1])
    if (cursor) ctx.lineTo(cursor[0], cursor[1])
    ctx.stroke()
    for (const q of puntos) {
      ctx.beginPath()
      ctx.arc(q[0], q[1], 3 / p.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#dc3839'
      ctx.fill()
    }
  }

  function terminar () {
    if (puntos.length >= 2) {
      const attr = { points: puntos.map(q => q.join(',')).join(' '), id: sc().getNextId(), ...estiloActual() }
      const nueva = sc().addSVGElementsFromJson({ element: 'polyline', attr })
      sc().clearSelection(); sc().addToSelection([nueva])
    }
    puntos = []
    previa.ocultar()
    gestor.avisar('Polilínea: clic para el siguiente vértice · doble clic o Enter termina · Esc cancela')
  }

  const boton = botonHerramienta(herramientas, 'polilinea-oscuro',
    'Polilínea: vértices clic a clic; doble clic o Enter termina')
  boton.addEventListener('click', () => gestor.activar({
    nombre: 'polilinea',
    boton,
    inicio: 'Polilínea: clic para cada vértice · doble clic o Enter termina · Esc cancela',
    alClic: (e) => { puntos.push(punto(e)); pintar() },
    alMover: (e) => { if (puntos.length) pintar(punto(e)) },
    alDoble: () => terminar(),
    alEnter: () => terminar(),
    salir: () => { puntos = []; previa.ocultar() }
  }))
}

/* -------------------------------------------------------------- paralela */

function montarParalela (editor, herramientas, gestor) {
  let objetivo = null
  let distancia = 20

  const puntosDe = (el) => {
    if (el.tagName.toLowerCase() === 'line') {
      return [['x1', 'y1'], ['x2', 'y2']].map(([a, b]) => [+el.getAttribute(a), +el.getAttribute(b)])
    }
    return [...el.points].map(q => [q.x, q.y])
  }

  /** Copia paralela de una cadena de puntos, al lado del punto `lado`. */
  function desplazar (puntos, lado, d) {
    // normal de cada segmento; el signo lo decide de qué lado cayó el clic
    const normales = []
    for (let i = 0; i < puntos.length - 1; i++) {
      const [ax, ay] = puntos[i]; const [bx, by] = puntos[i + 1]
      const largo = Math.hypot(bx - ax, by - ay) || 1
      normales.push([(by - ay) / largo, -(bx - ax) / largo])
    }
    // lado: proyección del clic sobre la normal del segmento más cercano
    let mejor = { dist: Infinity, signo: 1 }
    for (let i = 0; i < puntos.length - 1; i++) {
      const [ax, ay] = puntos[i]; const [bx, by] = puntos[i + 1]
      const t = Math.max(0, Math.min(1,
        ((lado[0] - ax) * (bx - ax) + (lado[1] - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)))
      const px = ax + t * (bx - ax); const py = ay + t * (by - ay)
      const dist = Math.hypot(lado[0] - px, lado[1] - py)
      if (dist < mejor.dist) {
        const signo = Math.sign((lado[0] - px) * normales[i][0] + (lado[1] - py) * normales[i][1]) || 1
        mejor = { dist, signo }
      }
    }
    const s = mejor.signo * d
    // cada vértice se desplaza por la intersección de sus segmentos desplazados
    const salida = []
    for (let i = 0; i < puntos.length; i++) {
      const nAntes = normales[Math.max(0, i - 1)]
      const nDespues = normales[Math.min(normales.length - 1, i)]
      let nx = (nAntes[0] + nDespues[0]) / 2
      let ny = (nAntes[1] + nDespues[1]) / 2
      const largo = Math.hypot(nx, ny)
      if (largo < 0.05) { nx = nDespues[0]; ny = nDespues[1] } else {
        // corrección de inglete: mantiene la distancia en los quiebres
        const coseno = nAntes[0] * nDespues[0] + nAntes[1] * nDespues[1]
        const factor = 1 / Math.max(0.25, Math.sqrt((1 + coseno) / 2))
        nx = nx / largo * factor; ny = ny / largo * factor
      }
      salida.push([redondear(puntos[i][0] + nx * s), redondear(puntos[i][1] + ny * s)])
    }
    return salida
  }

  const boton = botonHerramienta(herramientas, 'paralela-oscuro',
    'Paralela (offset): elige una línea o polilínea y luego el lado de la copia')

  // campo de distancia junto al aviso
  const campo = document.createElement('div')
  campo.id = 'rg_campo_paralela'
  campo.hidden = true
  campo.innerHTML = 'Distancia <input type="number" min="0.1" step="any" value="20"> u'
  editor.append(campo)
  campo.querySelector('input').addEventListener('input', (e) => {
    distancia = Math.max(0.1, Number(e.target.value) || 20)
  })

  boton.addEventListener('click', () => gestor.activar({
    nombre: 'paralela',
    boton,
    inicio: 'Paralela: elige la línea o polilínea (Esc para salir)',
    alClic: (e) => {
      const p = pagina(editor)
      const clic = aDocumento(p, e.clientX, e.clientY)
      if (!objetivo) {
        const el = e.target.closest && e.target.closest('#svgcontent line, #svgcontent polyline')
        if (!el) { gestor.avisar('Eso no es una línea ni una polilínea.'); return }
        objetivo = el
        gestor.avisar('Ahora haz clic al lado donde quieres la paralela.')
        return
      }
      const puntos = desplazar(puntosDe(objetivo), clic, distancia)
      const esLinea = objetivo.tagName.toLowerCase() === 'line'
      const estilo = {}
      for (const a of ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray']) {
        const v = objetivo.getAttribute(a); if (v !== null) estilo[a] = v
      }
      const attr = esLinea
        ? { x1: puntos[0][0], y1: puntos[0][1], x2: puntos[1][0], y2: puntos[1][1] }
        : { points: puntos.map(q => q.join(',')).join(' ') }
      const nueva = sc().addSVGElementsFromJson({
        element: esLinea ? 'line' : 'polyline',
        attr: { ...attr, id: sc().getNextId(), fill: 'none', ...estilo }
      })
      sc().clearSelection(); sc().addToSelection([nueva])
      objetivo = null
      gestor.avisar('Paralela creada. Elige otra línea, o Esc para salir.')
    },
    salir: () => { objetivo = null; campo.hidden = true }
  }))
  boton.addEventListener('click', () => {
    campo.hidden = gestor.activo() !== 'paralela'
    campo.querySelector('input').value = distancia
  })
}

/* ------------------------------------------------------- bote de pintura */

function montarBote (editor, herramientas, gestor) {
  const cerrados = ['rect', 'circle', 'ellipse', 'polygon', 'path', 'polyline']

  function figuraEn (x, y) {
    const candidatos = [...document.querySelectorAll('#svgcontent ' + cerrados.join(', #svgcontent '))]
    const punto = new DOMPoint(x, y)
    // del más reciente (encima) hacia atrás
    for (const el of candidatos.reverse()) {
      if (el.getAttribute('transform')) continue
      const tag = el.tagName.toLowerCase()
      if (tag === 'path' && !/[zZ]\s*$/.test(el.getAttribute('d') || '')) continue
      try { if (el.isPointInFill(punto)) return el } catch { /* sin soporte */ }
    }
    return null
  }

  const boton = botonHerramienta(herramientas, 'bote-oscuro',
    'Bote de pintura: clic dentro de una figura cerrada para rellenarla con el color de relleno actual')
  boton.addEventListener('click', () => gestor.activar({
    nombre: 'bote',
    boton,
    inicio: 'Bote de pintura: clic dentro de la figura a rellenar (Esc para salir)',
    alClic: (e) => {
      const p = pagina(editor)
      const [x, y] = aDocumento(p, e.clientX, e.clientY)
      const el = figuraEn(x, y)
      if (!el) { gestor.avisar('Ahí no hay ninguna figura cerrada. El bote no rellena zonas entre líneas sueltas.'); return }
      const color = (sc().getColor && sc().getColor('fill')) || '#dc3839'
      const um = sc().undoMgr
      um.beginUndoableChange('fill', [el]); um.beginUndoableChange('fill-opacity', [el])
      el.setAttribute('fill', color === 'none' ? '#dc3839' : color)
      el.setAttribute('fill-opacity', 1)
      for (let i = 0; i < 2; i++) { const c = um.finishUndoableChange(); if (!c.isEmpty()) sc().addCommandToHistory(c) }
      gestor.avisar('Relleno aplicado. Clic en otra figura, o Esc para salir.')
    }
  }))
}

/* --------------------------------------------------------- arco por radio */

function montarArco (editor, herramientas, gestor, previa, iman) {
  let a = null; let b = null

  const punto = (e) => {
    const p = pagina(editor)
    let [x, y] = aDocumento(p, e.clientX, e.clientY)
    const n = iman.imantar(x, y, p.zoom)
    if (n) { x = n.x; y = n.y }
    return [redondear(x), redondear(y)]
  }

  /** Radio y banderas del arco que pasa cerca del cursor. */
  function arcoPara (cursor) {
    const [ax, ay] = a; const [bx, by] = b
    const cuerda = Math.hypot(bx - ax, by - ay)
    if (cuerda < 1) return null
    // altura del cursor sobre la cuerda (con signo)
    const h = ((bx - ax) * (ay - cursor[1]) - (by - ay) * (ax - cursor[0])) / cuerda
    if (Math.abs(h) < 0.5) return null
    const r = (h * h + (cuerda / 2) ** 2) / (2 * Math.abs(h))
    return { r: redondear(r), grande: Math.abs(h) > cuerda / 2 ? 1 : 0, sentido: h > 0 ? 1 : 0 }
  }

  function pintar (cursor) {
    const p = pagina(editor)
    if (!p || !a) return
    const ctx = previa.contexto(p)
    ctx.beginPath()
    ctx.arc(a[0], a[1], 3 / p.zoom, 0, Math.PI * 2)
    ctx.fillStyle = '#dc3839'; ctx.fill()
    if (!b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(cursor[0], cursor[1]); ctx.setLineDash([4 / p.zoom, 3 / p.zoom]); ctx.stroke(); ctx.setLineDash([]); return }
    const arco = arcoPara(cursor)
    ctx.beginPath()
    if (arco) {
      const camino = new Path2D(`M ${a[0]} ${a[1]} A ${arco.r} ${arco.r} 0 ${arco.grande} ${arco.sentido} ${b[0]} ${b[1]}`)
      ctx.stroke(camino)
      gestor.avisar(`Arco: radio ${arco.r} u · clic para confirmar · Esc cancela`)
    } else {
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
    }
  }

  const boton = botonHerramienta(herramientas, 'arco-oscuro',
    'Arco por radio: dos clics fijan los extremos y el cursor curva el arco')
  boton.addEventListener('click', () => gestor.activar({
    nombre: 'arco',
    boton,
    inicio: 'Arco: clic en el punto inicial (Esc para salir)',
    alClic: (e) => {
      const q = punto(e)
      if (!a) { a = q; gestor.avisar('Arco: clic en el punto final.'); pintar(q); return }
      if (!b) { b = q; gestor.avisar('Mueve el cursor para curvar el arco y haz clic para confirmar.'); pintar(q); return }
      const arco = arcoPara(q)
      if (!arco) { gestor.avisar('Acerca o aleja el cursor de la recta para darle curvatura.'); return }
      const d = `M ${a[0]} ${a[1]} A ${arco.r} ${arco.r} 0 ${arco.grande} ${arco.sentido} ${b[0]} ${b[1]}`
      const nuevo = sc().addSVGElementsFromJson({ element: 'path', attr: { d, id: sc().getNextId(), ...estiloActual() } })
      sc().clearSelection(); sc().addToSelection([nuevo])
      a = b = null
      previa.ocultar()
      gestor.avisar('Arco creado. Clic para empezar otro, o Esc para salir.')
    },
    alMover: (e) => { if (a) pintar(punto(e)) },
    salir: () => { a = b = null; previa.ocultar() }
  }))
}

/* --------------------------------------------------------------- pinceles */

const PINCELES = [
  ['Fino', { ancho: 1, opacidad: 1, tapa: 'round', guiones: 'none' }],
  ['Medio', { ancho: 3, opacidad: 1, tapa: 'round', guiones: 'none' }],
  ['Grueso', { ancho: 7, opacidad: 1, tapa: 'round', guiones: 'none' }],
  ['Marcador', { ancho: 12, opacidad: 0.85, tapa: 'butt', guiones: 'none' }],
  ['Resaltador', { ancho: 18, opacidad: 0.35, tapa: 'butt', guiones: 'none' }],
  ['Punteado', { ancho: 2, opacidad: 1, tapa: 'round', guiones: '2,6' }],
  ['Trazos', { ancho: 2, opacidad: 1, tapa: 'butt', guiones: '8,5' }]
]

function montarPinceles (editor, herramientas) {
  const boton = botonHerramienta(herramientas, 'pincel-oscuro',
    'Pinceles: preajustes de trazo para lo que dibujes después')
  const panel = document.createElement('div')
  panel.id = 'rg_panel_pinceles'
  panel.hidden = true
  for (const [nombre, def] of PINCELES) {
    const fila = document.createElement('button')
    fila.type = 'button'
    fila.className = 'rg_pincel'
    fila.innerHTML = `<svg viewBox="0 0 120 24" width="120" height="24" aria-hidden="true">
        <line x1="6" y1="12" x2="114" y2="12" stroke="#3d3832"
          stroke-width="${Math.min(def.ancho, 16)}" stroke-opacity="${def.opacidad}"
          stroke-linecap="${def.tapa}" ${def.guiones !== 'none' ? `stroke-dasharray="${def.guiones}"` : ''} />
      </svg><span>${nombre}</span>`
    fila.addEventListener('click', () => {
      sc().setStrokeWidth(def.ancho)
      sc().setStrokeAttr('stroke-linecap', def.tapa)
      sc().setStrokeAttr('stroke-dasharray', def.guiones)
      sc().setStrokeAttr('stroke-opacity', def.opacidad)
      for (const f of panel.querySelectorAll('.rg_pincel')) f.classList.remove('rg_elegido')
      fila.classList.add('rg_elegido')
    })
    panel.append(fila)
  }
  editor.append(panel)

  boton.addEventListener('click', () => {
    if (!panel.hidden) { panel.hidden = true; return }
    const r = boton.getBoundingClientRect()
    const e = editor.getBoundingClientRect()
    panel.style.left = Math.min(r.right - e.left + 10, e.width - 200) + 'px'
    panel.style.top = Math.min(Math.max(r.top - e.top, 8), e.height - 300) + 'px'
    panel.hidden = false
  })
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !boton.contains(e.target)) panel.hidden = true
  })
}

/* ---------------------------------------------------------------- montaje */

export function montarDibujo (editor, iman) {
  const herramientas = editor.querySelector('#tools_left')
  const gestor = crearGestor(editor)
  const previa = crearPrevia(editor)
  montarPolilinea(editor, herramientas, gestor, previa, iman)
  montarParalela(editor, herramientas, gestor)
  montarArco(editor, herramientas, gestor, previa, iman)
  montarBote(editor, herramientas, gestor)
  montarPinceles(editor, herramientas)
}
