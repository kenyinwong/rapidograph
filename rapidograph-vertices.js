/**
 * Herramientas de vértices de RapidoGraph.
 *
 *   · Extremos arrastrables: al seleccionar una línea o polilínea aparecen
 *     manijas cuadradas en su inicio y su fin, y se pueden arrastrar. El
 *     movimiento queda en el historial de deshacer del editor.
 *   · Recortar: se eligen dos líneas y se unen en su punto de encuentro,
 *     quedando una sola polilínea con el estilo de la primera.
 *   · Extender: se elige el extremo de una línea y luego otra línea; el
 *     extremo se alarga (o recorta) hasta el encuentro con la segunda.
 *
 * Geometría en unidades del documento, con la misma referencia que las
 * reglas: el rectángulo de la página y la resolución.
 */

/* ------------------------------------------------------------- geometría */

function pagina (editor) {
  const fondo = editor.querySelector('#canvasBackground rect')
  const svgCanvas = window.svgEditor && window.svgEditor.svgCanvas
  if (!fondo || !svgCanvas) return null
  const rect = fondo.getBoundingClientRect()
  const res = svgCanvas.getResolution()
  return { rect, zoom: rect.width / res.w || 1 }
}

const aDocumento = (p, x, y) => [(x - p.rect.left) / p.zoom, (y - p.rect.top) / p.zoom]
const aPantalla = (p, x, y) => [p.rect.left + x * p.zoom, p.rect.top + y * p.zoom]

/** Intersección de las rectas (infinitas) que contienen a dos segmentos. */
function interseccion (a, b) {
  const [x1, y1, x2, y2] = a
  const [x3, y3, x4, y4] = b
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(d) < 1e-9) return null   // paralelas
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

const segmentoDe = (linea) => ['x1', 'y1', 'x2', 'y2'].map(a => parseFloat(linea.getAttribute(a) || 0))

/** Copia los atributos de estilo de trazo de un elemento a otro. */
function copiarEstilo (desde, hacia) {
  for (const a of ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
    'stroke-linejoin', 'stroke-linecap', 'fill', 'fill-opacity', 'opacity']) {
    const v = desde.getAttribute(a)
    if (v !== null) hacia.setAttribute(a, v)
  }
  hacia.setAttribute('fill', 'none')
}

/* --------------------------------------------------- extremos arrastrables */

function montarExtremos (editor) {
  const lienzo = editor.querySelector('#svgcanvas')
  const capa = document.createElement('div')
  capa.id = 'rg_extremos'
  lienzo.append(capa)

  const svgCanvas = () => window.svgEditor && window.svgEditor.svgCanvas
  let manijas = []
  let arrastre = null

  const puntosDe = (el) => {
    const t = el.tagName.toLowerCase()
    if (t === 'line') {
      const [x1, y1, x2, y2] = segmentoDe(el)
      return [{ x: x1, y: y1, attrs: ['x1', 'y1'] }, { x: x2, y: y2, attrs: ['x2', 'y2'] }]
    }
    if (t === 'polyline' && el.points.length > 1) {
      const a = el.points[0]; const b = el.points[el.points.length - 1]
      return [{ x: a.x, y: a.y, indice: 0 }, { x: b.x, y: b.y, indice: el.points.length - 1 }]
    }
    return null
  }

  function limpiar () {
    if (arrastre) return
    capa.textContent = ''
    manijas = []
  }

  function sincronizar () {
    if (arrastre) return
    const sc = svgCanvas()
    const p = pagina(editor)
    if (!sc || !p) return limpiar()
    const seleccion = sc.getSelectedElements().filter(Boolean)
    const el = seleccion.length === 1 ? seleccion[0] : null
    const puntos = el && sc.getMode() === 'select' ? puntosDe(el) : null
    if (!puntos) return limpiar()
    // sin giros ni sesgos la manija coincide con el punto; con transformación se omite
    if (el.getAttribute('transform')) return limpiar()
    if (manijas.length !== puntos.length) {
      capa.textContent = ''
      manijas = puntos.map(() => {
        const m = document.createElement('div')
        m.className = 'rg_manija'
        m.title = 'Arrastra para mover este extremo'
        capa.append(m)
        return m
      })
    }
    const base = lienzo.getBoundingClientRect()
    puntos.forEach((punto, i) => {
      const [sx, sy] = aPantalla(p, punto.x, punto.y)
      const m = manijas[i]
      m.style.left = (sx - base.left) + 'px'
      m.style.top = (sy - base.top) + 'px'
      m.dato = { el, punto }
    })
  }

  capa.addEventListener('pointerdown', (e) => {
    const m = e.target.closest('.rg_manija')
    if (!m || !m.dato) return
    e.preventDefault(); e.stopPropagation()
    const { el } = m.dato
    const um = svgCanvas().undoMgr
    const atributos = el.tagName.toLowerCase() === 'line' ? m.dato.punto.attrs : ['points']
    for (const a of atributos) um.beginUndoableChange(a, [el])
    arrastre = { manija: m, atributos }
    m.setPointerCapture(e.pointerId)
  })

  capa.addEventListener('pointermove', (e) => {
    if (!arrastre) return
    const p = pagina(editor)
    if (!p) return
    const { el, punto } = arrastre.manija.dato
    let [dx, dy] = aDocumento(p, e.clientX, e.clientY)
    dx = Math.round(dx * 10) / 10; dy = Math.round(dy * 10) / 10
    if (el.tagName.toLowerCase() === 'line') {
      el.setAttribute(punto.attrs[0], dx)
      el.setAttribute(punto.attrs[1], dy)
    } else {
      const q = el.points.getItem(punto.indice)
      q.x = dx; q.y = dy
    }
    const base = lienzo.getBoundingClientRect()
    const [sx, sy] = aPantalla(p, dx, dy)
    arrastre.manija.style.left = (sx - base.left) + 'px'
    arrastre.manija.style.top = (sy - base.top) + 'px'
  })

  const soltar = () => {
    if (!arrastre) return
    const sc = svgCanvas()
    const um = sc.undoMgr
    for (let i = arrastre.atributos.length; i > 0; i--) {
      const cmd = um.finishUndoableChange()
      if (!cmd.isEmpty()) sc.addCommandToHistory(cmd)
    }
    const el = arrastre.manija.dato.el
    arrastre = null
    sc.selectorManager && sc.selectorManager.requestSelector(el).resize()
    sincronizar()
  }
  capa.addEventListener('pointerup', soltar)
  capa.addEventListener('pointercancel', soltar)

  setInterval(sincronizar, 200)
  return { sincronizar }
}

/* --------------------------------------------- recortar (unir) y extender */

function montarUnirExtender (editor, herramientas) {
  const sc = () => window.svgEditor.svgCanvas
  let modo = null            // 'recortar' | 'extender' | null
  let primera = null         // primera línea elegida (y punto del clic)
  const botones = {}

  const aviso = document.createElement('div')
  aviso.id = 'rg_aviso_modo'
  aviso.hidden = true
  editor.append(aviso)

  function avisar (texto) {
    aviso.textContent = texto || ''
    aviso.hidden = !texto
  }

  function marcar (el, encendido) {
    if (!el) return
    if (encendido) {
      el.dataset.rgTrazoOriginal = el.getAttribute('stroke') || ''
      el.setAttribute('stroke', '#dc3839')
    } else {
      el.setAttribute('stroke', el.dataset.rgTrazoOriginal || '#000000')
      delete el.dataset.rgTrazoOriginal
    }
  }

  function salir () {
    marcar(primera && primera.el, false)
    primera = null
    modo = null
    avisar('')
    for (const b of Object.values(botones)) b.classList.remove('rg_activa')
  }

  function activar (cual) {
    if (modo === cual) return salir()
    salir()
    modo = cual
    botones[cual].classList.add('rg_activa')
    sc().setMode('select'); sc().clearSelection()
    avisar(cual === 'recortar'
      ? 'Juntar líneas: elige la primera línea (Esc para salir)'
      : 'Extender: haz clic en la línea cerca del extremo que quieres alargar (Esc para salir)')
  }

  /** Une dos líneas en el vértice donde se encuentran y deja una polilínea. */
  function recortar (a, b) {
    const sa = segmentoDe(a); const sb = segmentoDe(b)
    const v = interseccion(sa, sb)
    if (!v) { window.alert('Esas líneas son paralelas: no tienen punto de encuentro.'); return salir() }
    const lejano = (s) => {
      const d1 = (s[0] - v[0]) ** 2 + (s[1] - v[1]) ** 2
      const d2 = (s[2] - v[0]) ** 2 + (s[3] - v[1]) ** 2
      return d1 >= d2 ? [s[0], s[1]] : [s[2], s[3]]
    }
    const [ax, ay] = lejano(sa); const [bx, by] = lejano(sb)
    const r = (n) => Math.round(n * 100) / 100
    const puntos = `${r(ax)},${r(ay)} ${r(v[0])},${r(v[1])} ${r(bx)},${r(by)}`
    marcar(a, false)   // antes de copiar el estilo: el resaltado rojo no es suyo
    const nueva = sc().addSVGElementsFromJson({
      element: 'polyline',
      attr: { points: puntos, id: sc().getNextId(), fill: 'none' }
    })
    copiarEstilo(a, nueva)
    sc().clearSelection()
    sc().addToSelection([a, b])
    sc().deleteSelectedElements()
    sc().clearSelection()
    sc().addToSelection([nueva])
    salir()
  }

  /** Alarga (o recorta) el extremo elegido de la línea hasta la otra. */
  function extender (a, clic, b) {
    const sa = segmentoDe(a)
    const v = interseccion(sa, segmentoDe(b))
    if (!v) { window.alert('Esas líneas son paralelas: no hay encuentro posible.'); return salir() }
    const dInicio = (sa[0] - clic[0]) ** 2 + (sa[1] - clic[1]) ** 2
    const dFin = (sa[2] - clic[0]) ** 2 + (sa[3] - clic[1]) ** 2
    const attrs = dInicio <= dFin ? ['x1', 'y1'] : ['x2', 'y2']
    const um = sc().undoMgr
    um.beginUndoableChange(attrs[0], [a]); um.beginUndoableChange(attrs[1], [a])
    a.setAttribute(attrs[0], Math.round(v[0] * 100) / 100)
    a.setAttribute(attrs[1], Math.round(v[1] * 100) / 100)
    for (let i = 0; i < 2; i++) { const c = um.finishUndoableChange(); if (!c.isEmpty()) sc().addCommandToHistory(c) }
    marcar(primera.el, false)
    salir()
  }

  // en modo activo, el clic elige líneas y no llega a la aplicación
  const zona = editor.querySelector('#workarea')
  for (const tipo of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
    zona.addEventListener(tipo, (e) => { if (modo) { e.preventDefault(); e.stopPropagation() } }, true)
  }
  zona.addEventListener('click', (e) => {
    if (!modo) return
    e.preventDefault(); e.stopPropagation()
    const el = e.target.closest && e.target.closest('#svgcontent line')
    const p = pagina(editor)
    if (!el) { avisar('Eso no es una línea: elige una línea simple.'); return }
    if (!primera) {
      primera = { el, clic: p ? aDocumento(p, e.clientX, e.clientY) : [0, 0] }
      marcar(el, true)
      avisar(modo === 'recortar' ? 'Ahora elige la segunda línea.' : 'Ahora elige la línea hasta la que se extiende.')
      return
    }
    if (el === primera.el) { avisar('Esa es la misma línea: elige otra.'); return }
    modo === 'recortar' ? recortar(primera.el, el) : extender(primera.el, primera.clic, el)
  }, true)

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modo) salir() }, true)

  const crearBoton = (cual, icono, rotulo) => {
    const b = document.createElement('button')
    b.className = 'rg_herramienta'; b.type = 'button'; b.title = rotulo
    const img = document.createElement('img')
    img.src = './marca/acciones/' + icono + '.svg'; img.alt = rotulo
    img.width = 30; img.height = 30
    b.append(img)
    b.addEventListener('click', () => activar(cual))
    herramientas.append(b)
    botones[cual] = b
    return b
  }

  crearBoton('recortar', 'juntar-oscuro', 'Juntar líneas: unir dos líneas en un vértice (queda una polilínea)')
  crearBoton('extender', 'extender-oscuro', 'Extender: alargar una línea hasta encontrarse con otra')
}

/* ---------------------------------------------------------------- montaje */

export function montarVertices (editor) {
  const herramientas = editor.querySelector('#tools_left')
  const extremos = montarExtremos(editor)
  montarUnirExtender(editor, herramientas)
  return extremos
}
