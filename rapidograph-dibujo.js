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

// La geometría del lienzo es compartida; se importa con la misma marca de
// versión con que se cargó este archivo para no quedar en la caché del navegador.
const version = new URL(import.meta.url).search
const { sc, pagina, aDocumento, crearCapaVista, vista } = await import('./rapidograph-lienzo.js' + version)

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
  const capa = crearCapaVista(editor, 'rg_previa', 4)
  return {
    /** Contexto en unidades del documento, ya limpio y con el trazo de previa. */
    contexto () {
      const c = capa.contexto()
      if (!c) return null
      c.ctx.strokeStyle = '#dc3839'
      c.ctx.lineWidth = 1.5 / c.p.zoom
      return c.ctx
    },
    ocultar: capa.ocultar
  }
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

  let actual = null   // { nombre, boton, alClic, alMover, alDoble, alPresionar, alSoltar, salir }

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
    // apaga los modos propios de otros módulos (juntar, extender, redondear…)
    document.dispatchEvent(new CustomEvent('rg:modo', { detail: { origen: 'dibujo' } }))
    actual = modo
    modo.boton.classList.add('rg_activa')
    sc().setMode('select'); sc().clearSelection()
    avisar(modo.inicio)
  }
  document.addEventListener('rg:modo', (e) => { if (e.detail.origen !== 'dibujo' && actual) salir() })

  // Los eventos pointer solo se detienen: cancelarlos (preventDefault) haría
  // que el navegador no emita los mousedown/mousemove/mouseup de ese mismo
  // puntero, y los modos que dibujan arrastrando no verían nada.
  for (const tipo of ['pointerdown', 'pointerup']) {
    zona.addEventListener(tipo, (e) => { if (actual) e.stopPropagation() }, true)
  }
  zona.addEventListener('mousedown', (e) => {
    if (!actual) return
    e.preventDefault(); e.stopPropagation()
    if (actual.alPresionar) actual.alPresionar(e)
  }, true)
  zona.addEventListener('mouseup', (e) => {
    if (!actual) return
    e.preventDefault(); e.stopPropagation()
    if (actual.alSoltar) actual.alSoltar(e)
  }, true)
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

  /**
   * Relleno por perímetros: los trazos del dibujo se pintan en un mapa de
   * bits, se inunda desde el clic hasta chocar con ellos (o con el borde de
   * la página) y el contorno de la mancha vuelve al dibujo como un trazado
   * relleno, colocado detrás de las líneas que lo delimitan.
   */
  function zonaDelimitada (x, y) {
    const contenido = document.getElementById('svgcontent')
    const res = sc().getResolution()
    // región visible del documento: el lienzo no tiene borde, así que el mapa
    // de bits cubre lo que se ve en pantalla y no la página entera
    const pg = pagina(editor); const v = vista(editor)
    const ox = Math.max(0, (v.left - pg.rect.left) / pg.zoom)
    const oy = Math.max(0, (v.top - pg.rect.top) / pg.zoom)
    const ancho = Math.min(res.w, (v.left + v.width - pg.rect.left) / pg.zoom) - ox
    const alto = Math.min(res.h, (v.top + v.height - pg.rect.top) / pg.zoom) - oy
    if (ancho <= 0 || alto <= 0) return null
    const esc = Math.min(Math.max(pg.zoom * 1.5, 0.5), 4, 2400 / Math.max(ancho, alto))   // píxeles por unidad
    const W = Math.ceil(ancho * esc); const H = Math.ceil(alto * esc)
    const lienzo = document.createElement('canvas')
    lienzo.width = W; lienzo.height = H
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'
    const aRaiz = contenido.getScreenCTM().inverse()

    for (const el of contenido.querySelectorAll('line, polyline, polygon, rect, circle, ellipse, path')) {
      const m = aRaiz.multiply(el.getScreenCTM())     // del elemento a unidades del documento
      ctx.setTransform(esc * m.a, esc * m.b, esc * m.c, esc * m.d, esc * (m.e - ox), esc * (m.f - oy))
      const g = (a) => parseFloat(el.getAttribute(a)) || 0
      let camino
      switch (el.tagName.toLowerCase()) {
        case 'line': camino = new Path2D(`M ${g('x1')} ${g('y1')} L ${g('x2')} ${g('y2')}`); break
        case 'polyline':
        case 'polygon': {
          const pts = [...el.points].map(q => `${q.x} ${q.y}`)
          if (!pts.length) continue
          camino = new Path2D('M ' + pts.join(' L ') + (el.tagName.toLowerCase() === 'polygon' ? ' Z' : ''))
          break
        }
        case 'rect': camino = new Path2D(); camino.rect(g('x'), g('y'), g('width'), g('height')); break
        case 'circle': camino = new Path2D(); camino.arc(g('cx'), g('cy'), g('r'), 0, Math.PI * 2); break
        case 'ellipse': camino = new Path2D(); camino.ellipse(g('cx'), g('cy'), g('rx'), g('ry'), 0, 0, Math.PI * 2); break
        default: camino = new Path2D(el.getAttribute('d') || '')
      }
      const traza = el.getAttribute('stroke'); const relleno = el.getAttribute('fill')
      if (traza && traza !== 'none') {
        ctx.lineWidth = Math.max(1.5 / esc, parseFloat(el.getAttribute('stroke-width')) || 1)
        ctx.stroke(camino)
      }
      if (relleno && relleno !== 'none' && !el.classList.contains('rg_relleno')) ctx.fill(camino)
    }

    const datos = ctx.getImageData(0, 0, W, H).data
    const pared = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) pared[i] = datos[i * 4 + 3] > 60 ? 1 : 0
    const x0 = Math.round((x - ox) * esc); const y0 = Math.round((y - oy) * esc)
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H || pared[y0 * W + x0]) return null

    // inundación por líneas de barrido
    const lleno = new Uint8Array(W * H)
    const pila = [[x0, y0]]
    let area = 0
    while (pila.length) {
      const [sx, sy] = pila.pop()
      let xi = sx
      while (xi >= 0 && !pared[sy * W + xi] && !lleno[sy * W + xi]) xi--
      xi++
      let arriba = false; let abajo = false
      while (xi < W && !pared[sy * W + xi] && !lleno[sy * W + xi]) {
        lleno[sy * W + xi] = 1; area++
        if (sy > 0) {
          const libre = !pared[(sy - 1) * W + xi] && !lleno[(sy - 1) * W + xi]
          if (libre && !arriba) { pila.push([xi, sy - 1]); arriba = true } else if (!libre) arriba = false
        }
        if (sy < H - 1) {
          const libre = !pared[(sy + 1) * W + xi] && !lleno[(sy + 1) * W + xi]
          if (libre && !abajo) { pila.push([xi, sy + 1]); abajo = true } else if (!libre) abajo = false
        }
        xi++
      }
    }
    // si la mancha llega al borde de lo visible, la zona no está cerrada (o no
    // cabe completa en pantalla)
    for (let i = 0; i < W; i++) if (lleno[i] || lleno[(H - 1) * W + i]) return { abierta: true }
    for (let j = 0; j < H; j++) if (lleno[j * W] || lleno[j * W + W - 1]) return { abierta: true }

    // contorno: aristas entre píxel lleno y vacío, encadenadas en lazos
    const esta = (px, py) => px >= 0 && py >= 0 && px < W && py < H && lleno[py * W + px] === 1
    const salidas = new Map()     // vértice de partida -> vértice de llegada
    const clave = (px, py) => py * (W + 1) + px
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        if (!lleno[py * W + px]) continue
        if (!esta(px, py - 1)) salidas.set(clave(px, py), clave(px + 1, py))
        if (!esta(px + 1, py)) salidas.set(clave(px + 1, py), clave(px + 1, py + 1))
        if (!esta(px, py + 1)) salidas.set(clave(px + 1, py + 1), clave(px, py + 1))
        if (!esta(px - 1, py)) salidas.set(clave(px, py + 1), clave(px, py))
      }
    }
    const lazos = []
    while (salidas.size) {
      const inicio = salidas.keys().next().value
      const lazo = []
      let actual = inicio
      while (salidas.has(actual)) {
        const siguiente = salidas.get(actual)
        salidas.delete(actual)
        lazo.push([actual % (W + 1), Math.floor(actual / (W + 1))])
        actual = siguiente
        if (actual === inicio) break
      }
      if (lazo.length >= 4) lazos.push(lazo)
    }

    // simplificación (Douglas-Peucker) para quitar la escalera del mapa de bits
    const simplificar = (pts, eps) => {
      if (pts.length < 3) return pts
      const [a, b] = [pts[0], pts[pts.length - 1]]
      let maxD = 0; let idx = 0
      const largo = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      for (let i = 1; i < pts.length - 1; i++) {
        const d = Math.abs((b[1] - a[1]) * pts[i][0] - (b[0] - a[0]) * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / largo
        if (d > maxD) { maxD = d; idx = i }
      }
      if (maxD <= eps) return [a, b]
      return [...simplificar(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplificar(pts.slice(idx), eps)]
    }
    const eps = 1.6
    const partes = lazos.map(lazo => {
      // se abre el lazo en el punto más lejano del primero para no aplanar el cierre
      let lejos = 0; let dLejos = 0
      for (let i = 1; i < lazo.length; i++) {
        const d = Math.hypot(lazo[i][0] - lazo[0][0], lazo[i][1] - lazo[0][1])
        if (d > dLejos) { dLejos = d; lejos = i }
      }
      const mitad1 = simplificar(lazo.slice(0, lejos + 1), eps)
      const mitad2 = simplificar([...lazo.slice(lejos), lazo[0]], eps)
      const pts = [...mitad1.slice(0, -1), ...mitad2.slice(0, -1)]
      return 'M ' + pts.map(q => `${redondear(q[0] / esc + ox)} ${redondear(q[1] / esc + oy)}`).join(' L ') + ' Z'
    })
    return { d: partes.join(' '), area: area / (esc * esc) }
  }

  const boton = botonHerramienta(herramientas, 'bote-oscuro',
    'Bote de pintura: clic en una zona delimitada por líneas o dentro de una figura para rellenarla con el color de relleno actual')
  boton.addEventListener('click', () => gestor.activar({
    nombre: 'bote',
    boton,
    inicio: 'Bote de pintura: clic en la zona a rellenar (Esc para salir)',
    alClic: (e) => {
      const p = pagina(editor)
      const [x, y] = aDocumento(p, e.clientX, e.clientY)
      const color = (sc().getColor && sc().getColor('fill')) || '#dc3839'
      const tinta = color === 'none' ? '#dc3839' : color
      const el = figuraEn(x, y)
      if (el) {
        const um = sc().undoMgr
        um.beginUndoableChange('fill', [el]); um.beginUndoableChange('fill-opacity', [el])
        el.setAttribute('fill', tinta)
        el.setAttribute('fill-opacity', 1)
        for (let i = 0; i < 2; i++) { const c = um.finishUndoableChange(); if (!c.isEmpty()) sc().addCommandToHistory(c) }
        gestor.avisar('Figura rellenada. Clic en otra zona, o Esc para salir.')
        return
      }
      let zona = null
      try { zona = zonaDelimitada(x, y) } catch (err) { console.error('Bote de pintura:', err) }
      if (!zona) { gestor.avisar('Ahí hay un trazo o no se pudo calcular la zona. Haz clic dentro del área a rellenar.'); return }
      if (zona.abierta) { gestor.avisar('Esa zona no está cerrada por líneas, o no cabe completa en pantalla: aleja el zoom e inténtalo de nuevo.'); return }
      const relleno = sc().addSVGElementsFromJson({
        element: 'path',
        attr: { d: zona.d, id: sc().getNextId(), class: 'rg_relleno', fill: tinta, 'fill-rule': 'evenodd', stroke: 'none' }
      })
      // detrás de las líneas que delimitan la zona, dentro de su capa
      const capa = relleno.parentNode
      const titulo = capa.querySelector(':scope > title')
      capa.insertBefore(relleno, titulo ? titulo.nextSibling : capa.firstChild)
      sc().clearSelection(); sc().addToSelection([relleno])
      gestor.avisar(`Zona rellenada (${Math.round(zona.area)} u²). Clic en otra zona, o Esc para salir.`)
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

/* ------------------------------------------------------- arco por centro */

/**
 * Arco radial: clic en el centro, clic en el punto inicial (fija el radio) y
 * el cursor barre el ángulo hasta el punto final; el tercer clic confirma.
 */
function montarArcoCentro (editor, herramientas, gestor, previa, iman) {
  let centro = null; let inicio = null
  let barrido = 0            // ángulo acumulado desde el inicio, con signo
  let anguloPrevio = null

  const punto = (e) => {
    const p = pagina(editor)
    let [x, y] = aDocumento(p, e.clientX, e.clientY)
    const n = iman.imantar(x, y, p.zoom)
    if (n) { x = n.x; y = n.y }
    return [redondear(x), redondear(y)]
  }
  const anguloDe = (q) => Math.atan2(q[1] - centro[1], q[0] - centro[0])
  const radio = () => Math.hypot(inicio[0] - centro[0], inicio[1] - centro[1])

  /** Acumula el giro del cursor para permitir arcos de más de 180°. */
  function seguir (cursor) {
    const a = anguloDe(cursor)
    if (anguloPrevio === null) { anguloPrevio = a; barrido = 0; return }
    let delta = a - anguloPrevio
    if (delta > Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    barrido += delta
    anguloPrevio = a
    // el arco no da más de una vuelta
    barrido = Math.max(-2 * Math.PI + 0.01, Math.min(2 * Math.PI - 0.01, barrido))
  }

  function finDelArco () {
    const r = radio()
    const a = anguloDe(inicio) + barrido
    return [redondear(centro[0] + r * Math.cos(a)), redondear(centro[1] + r * Math.sin(a))]
  }

  const trazadoArco = () => {
    const r = redondear(radio())
    const fin = finDelArco()
    const grande = Math.abs(barrido) > Math.PI ? 1 : 0
    const sentido = barrido > 0 ? 1 : 0
    return `M ${inicio[0]} ${inicio[1]} A ${r} ${r} 0 ${grande} ${sentido} ${fin[0]} ${fin[1]}`
  }

  function pintar (cursor) {
    const p = pagina(editor)
    if (!p || !centro) return
    const ctx = previa.contexto(p)
    ctx.fillStyle = '#dc3839'
    ctx.beginPath(); ctx.arc(centro[0], centro[1], 3 / p.zoom, 0, Math.PI * 2); ctx.fill()
    ctx.setLineDash([4 / p.zoom, 3 / p.zoom])
    if (!inicio) {
      ctx.beginPath(); ctx.moveTo(centro[0], centro[1]); ctx.lineTo(cursor[0], cursor[1]); ctx.stroke()
      gestor.avisar(`Arco por centro: radio ${redondear(Math.hypot(cursor[0] - centro[0], cursor[1] - centro[1]))} u · clic para fijar el inicio`)
      ctx.setLineDash([])
      return
    }
    const fin = finDelArco()
    ctx.beginPath(); ctx.moveTo(centro[0], centro[1]); ctx.lineTo(inicio[0], inicio[1]); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(centro[0], centro[1]); ctx.lineTo(fin[0], fin[1]); ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = 2 / p.zoom
    ctx.stroke(new Path2D(trazadoArco()))
    gestor.avisar(`Arco por centro: radio ${redondear(radio())} u · ${Math.round(Math.abs(barrido) * 180 / Math.PI)}° · clic para confirmar · Esc cancela`)
  }

  const boton = botonHerramienta(herramientas, 'arco-centro-oscuro',
    'Arco por centro: clic en el centro, clic en el inicio y el cursor barre el ángulo')
  boton.addEventListener('click', () => gestor.activar({
    nombre: 'arco_centro',
    boton,
    inicio: 'Arco por centro: clic en el centro del arco (Esc para salir)',
    alClic: (e) => {
      const q = punto(e)
      if (!centro) { centro = q; pintar(q); return }
      if (!inicio) {
        if (Math.hypot(q[0] - centro[0], q[1] - centro[1]) < 1) { gestor.avisar('El inicio debe estar separado del centro.'); return }
        inicio = q; anguloPrevio = null; barrido = 0; pintar(q); return
      }
      if (Math.abs(barrido) < 0.01) { gestor.avisar('Mueve el cursor para abrir el arco antes de confirmar.'); return }
      const nuevo = sc().addSVGElementsFromJson({ element: 'path', attr: { d: trazadoArco(), id: sc().getNextId(), ...estiloActual() } })
      sc().clearSelection(); sc().addToSelection([nuevo])
      centro = inicio = null; barrido = 0; anguloPrevio = null
      previa.ocultar()
      gestor.avisar('Arco creado. Clic para empezar otro, o Esc para salir.')
    },
    alMover: (e) => {
      if (!centro) return
      const q = punto(e)
      if (inicio) seguir(q)
      pintar(q)
    },
    salir: () => { centro = inicio = null; barrido = 0; anguloPrevio = null; previa.ocultar() }
  }))
}

/* ------------------------------------------------------ pincel de boceto */

/**
 * Pincel de boceto: trazo a mano alzada que se dibuja con varias pasadas
 * ligeramente desviadas y translúcidas, como un lápiz de bosquejo. Cada trazo
 * queda como un grupo de trazados, para moverlo o borrarlo entero.
 */
function montarBoceto (editor, herramientas, gestor, previa) {
  let puntos = []
  let presionado = false

  const punto = (e) => { const p = pagina(editor); const [x, y] = aDocumento(p, e.clientX, e.clientY); return [x, y] }

  function pintar () {
    const p = pagina(editor)
    if (!p || puntos.length < 2) return
    const ctx = previa.contexto(p)
    const estilo = estiloActual()
    ctx.strokeStyle = estilo.stroke
    ctx.lineWidth = Number(estilo['stroke-width']) || 2
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(puntos[0][0], puntos[0][1])
    for (const q of puntos.slice(1)) ctx.lineTo(q[0], q[1])
    ctx.stroke()
  }

  /** Suaviza con media móvil y devuelve un trazado con curvas cuadráticas. */
  function trazado (pts, desvio) {
    const s = pts.map((q, i) => {
      const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)]
      return [(a[0] + q[0] + b[0]) / 3 + (Math.random() - 0.5) * desvio, (a[1] + q[1] + b[1]) / 3 + (Math.random() - 0.5) * desvio]
    })
    let d = `M ${redondear(s[0][0])} ${redondear(s[0][1])}`
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i][0] + s[i + 1][0]) / 2; const my = (s[i][1] + s[i + 1][1]) / 2
      d += ` Q ${redondear(s[i][0])} ${redondear(s[i][1])} ${redondear(mx)} ${redondear(my)}`
    }
    const u = s[s.length - 1]
    d += ` L ${redondear(u[0])} ${redondear(u[1])}`
    return d
  }

  function terminar () {
    presionado = false
    previa.ocultar()
    if (puntos.length < 3) { puntos = []; return }
    const estilo = estiloActual()
    const ancho = Number(estilo['stroke-width']) || 2
    const pasadas = [
      { desvio: 0, ancho, opacidad: 0.9 },
      { desvio: ancho * 0.9 + 1.5, ancho: ancho * 0.8, opacidad: 0.5 },
      { desvio: ancho * 1.4 + 2, ancho: ancho * 0.6, opacidad: 0.35 }
    ]
    const grupo = sc().addSVGElementsFromJson({
      element: 'g',
      attr: { id: sc().getNextId(), class: 'rg_boceto' },
      children: pasadas.map(pa => ({
        element: 'path',
        attr: {
          d: trazado(puntos, pa.desvio),
          id: sc().getNextId(),
          ...estilo,
          'stroke-width': redondear(pa.ancho),
          'stroke-opacity': pa.opacidad * (Number(estilo['stroke-opacity']) || 1),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        }
      }))
    })
    sc().clearSelection(); sc().addToSelection([grupo])
    puntos = []
  }

  const boton = botonHerramienta(herramientas, 'boceto-oscuro',
    'Pincel de boceto: trazo a mano alzada con aspecto de bosquejo a lápiz')
  boton.addEventListener('click', () => gestor.activar({
    nombre: 'boceto',
    boton,
    inicio: 'Pincel de boceto: dibuja a mano alzada (Esc para salir)',
    alPresionar: (e) => { presionado = true; puntos = [punto(e)] },
    alMover: (e) => {
      if (!presionado) return
      const q = punto(e); const u = puntos[puntos.length - 1]
      if (Math.hypot(q[0] - u[0], q[1] - u[1]) >= 1.5) { puntos.push(q); pintar() }
    },
    alSoltar: () => { if (presionado) terminar() },
    salir: () => { presionado = false; puntos = []; previa.ocultar() }
  }))
}

/* --------------------------------------------------- biblioteca de formas */

/**
 * Selector de formas propio. El de SVG-Edit abre su galería en una capa fija
 * que en esta interfaz queda debajo de la banda y del panel flotante; aquí se
 * lee la misma biblioteca (extensions/ext-shapes/shapelib) y se muestra en un
 * panel visible. Elegir una forma deja el editor en modo "shapelib": luego se
 * arrastra en el lienzo para dibujarla, igual que siempre.
 */
function montarFormas (editor) {
  const explorador = editor.querySelector('#tool_shapelib')
  if (!explorador) return
  const RUTA = './extensions/ext-shapes/shapelib/'
  const cache = new Map()
  let panel = null
  let categoria = 'basic'

  async function categorias () {
    if (!cache.has('__indice')) {
      const r = await fetch(RUTA + 'index.json')
      cache.set('__indice', (await r.json()).lib)
    }
    return cache.get('__indice')
  }

  async function formas (nombre) {
    if (!cache.has(nombre)) {
      const r = await fetch(RUTA + nombre + '.json')
      cache.set(nombre, await r.json())
    }
    return cache.get(nombre)
  }

  const miniatura = (biblioteca, d) => {
    const tam = biblioteca.size ?? 300
    const margen = tam * 0.05
    const relleno = biblioteca.fill ? '#3d3832' : 'none'
    const grosor = biblioteca.fill ? 0 : tam / 30
    return `<svg viewBox="${-margen} ${-margen} ${tam + margen * 2} ${tam + margen * 2}" width="34" height="34" aria-hidden="true">
      <path fill="${relleno}" stroke="#3d3832" stroke-width="${grosor}" d="${d}"></path></svg>`
  }

  async function llenar () {
    const lista = await categorias()
    const selector = panel.querySelector('select')
    selector.innerHTML = lista.map(n => `<option value="${n}">${n.replace(/_/g, ' ')}</option>`).join('')
    selector.value = categoria
    const biblioteca = await formas(categoria)
    const rejilla = panel.querySelector('.rg_formas_rejilla')
    rejilla.innerHTML = ''
    for (const [nombre, d] of Object.entries(biblioteca.data)) {
      const b = document.createElement('button')
      b.type = 'button'; b.className = 'rg_forma'; b.title = nombre.replace(/_/g, ' ')
      b.innerHTML = miniatura(biblioteca, d)
      b.addEventListener('click', () => elegir(d, biblioteca))
      rejilla.append(b)
    }
  }

  function elegir (d, biblioteca) {
    // la extensión lee el trazado elegido de este atributo al arrastrar
    explorador.dataset.draw = d
    explorador.setAttribute('pressed', 'pressed')
    const icono = explorador.shadowRoot && explorador.shadowRoot.querySelector('.button-icon')
    if (icono) {
      const tam = biblioteca.size ?? 300; const m = tam * 0.05
      icono.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${tam + m * 2} ${tam + m * 2}"><path fill="${biblioteca.fill ? '#3d3832' : 'none'}" stroke="#3d3832" stroke-width="${biblioteca.fill ? 0 : tam / 30}" d="${d}"/></svg>`)
    }
    sc().setMode('shapelib')
    cerrar()
  }

  function cerrar () { if (panel) panel.hidden = true }

  async function abrir () {
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'rg_panel_formas'
      panel.innerHTML = `
        <div class="rg_formas_cabecera">
          <strong>Formas</strong>
          <select aria-label="Categoría"></select>
        </div>
        <div class="rg_formas_rejilla" role="list"></div>
        <p class="rg_formas_pie">Elige una forma y luego arrastra en el lienzo para dibujarla.</p>`
      editor.append(panel)
      panel.querySelector('select').addEventListener('change', async (e) => { categoria = e.target.value; await llenar() })
      document.addEventListener('pointerdown', (e) => {
        if (!panel.hidden && !panel.contains(e.target) && !explorador.contains(e.target)) cerrar()
      })
    }
    // al costado del panel flotante completo (el botón está en una de sus columnas)
    const paleta = editor.querySelector('#rg_paleta') || explorador
    const r = paleta.getBoundingClientRect(); const rb = explorador.getBoundingClientRect(); const e = editor.getBoundingClientRect()
    panel.style.left = Math.min(r.right - e.left + 14, e.width - 300) + 'px'
    panel.style.top = Math.min(Math.max(rb.top - e.top - 40, 8), e.height - 380) + 'px'
    panel.hidden = false
    try { await llenar() } catch (err) {
      panel.querySelector('.rg_formas_rejilla').textContent = 'No se pudo leer la biblioteca de formas.'
      console.error('Biblioteca de formas:', err)
    }
  }

  // la galería original queda escondida del todo: se abría en una capa fija
  // bajo la banda y, si asomaba, cortaba el listado sin barra de desplazamiento
  const sombra = explorador.shadowRoot
  if (sombra) {
    for (const viejo of sombra.querySelectorAll('.menu, .image-lib')) viejo.style.display = 'none'
  }

  // el clic se atiende aquí y no llega al desplegable oculto de SVG-Edit
  explorador.addEventListener('click', (e) => {
    e.stopImmediatePropagation(); e.preventDefault()
    if (panel && !panel.hidden) cerrar(); else abrir()
  }, true)
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

// Modos en los que se dibuja un trazo: los del editor y los propios.
const MODOS_DE_TRAZO = [
  'fhpath', 'line', 'path', 'rect', 'square', 'fhrect', 'ellipse', 'circle',
  'fhellipse', 'star', 'polygon'
]
const MODOS_PROPIOS_DE_TRAZO = ['polilinea', 'arco', 'arco_centro', 'boceto']

/**
 * Franja de pinceles en la barra superior. Solo aparece mientras hay una
 * herramienta de dibujo elegida, para no tapar el lienzo ni el panel.
 */
function montarPinceles (editor, gestor) {
  const franja = document.createElement('div')
  franja.id = 'rg_pinceles'
  franja.setAttribute('role', 'group')
  franja.setAttribute('aria-label', 'Pinceles')
  franja.hidden = true

  const titulo = document.createElement('span')
  titulo.className = 'rg_pinceles_titulo'
  titulo.textContent = 'Pincel'
  franja.append(titulo)

  for (const [nombre, def] of PINCELES) {
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'rg_pincel'
    boton.title = `${nombre}: grosor ${def.ancho}` +
      (def.opacidad < 1 ? `, opacidad ${Math.round(def.opacidad * 100)} %` : '') +
      (def.guiones !== 'none' ? ', discontinuo' : '')
    boton.innerHTML = `<svg viewBox="0 0 56 18" width="56" height="18" aria-hidden="true">
        <line x1="5" y1="9" x2="51" y2="9" stroke="#3d3832"
          stroke-width="${Math.min(def.ancho, 12)}" stroke-opacity="${def.opacidad}"
          stroke-linecap="${def.tapa}" ${def.guiones !== 'none' ? `stroke-dasharray="${def.guiones}"` : ''} />
      </svg><span>${nombre}</span>`
    boton.addEventListener('click', () => {
      sc().setStrokeWidth(def.ancho)
      sc().setStrokeAttr('stroke-linecap', def.tapa)
      sc().setStrokeAttr('stroke-dasharray', def.guiones)
      sc().setStrokeAttr('stroke-opacity', def.opacidad)
      for (const b of franja.querySelectorAll('.rg_pincel')) b.setAttribute('aria-pressed', 'false')
      boton.setAttribute('aria-pressed', 'true')
    })
    boton.setAttribute('aria-pressed', 'false')
    franja.append(boton)
  }

  // antes de la zona de sesión, para que quede a la izquierda de guías y correo
  const barra = editor.querySelector('#tools_top')
  const sesion = barra.querySelector('#rg_sesion')
  barra.insertBefore(franja, sesion)

  const dibujando = () => {
    const modo = sc() && sc().getMode()
    return MODOS_DE_TRAZO.includes(modo) || MODOS_PROPIOS_DE_TRAZO.includes(gestor.activo())
  }
  // el editor no avisa al cambiar de herramienta, así que se consulta seguido;
  // el DOM solo se toca cuando el estado cambia
  setInterval(() => {
    const visible = dibujando()
    if (franja.hidden === visible) franja.hidden = !visible
  }, 150)
}

/* ---------------------------------------------------------------- montaje */

export function montarDibujo (editor, iman) {
  const herramientas = editor.querySelector('#tools_left')
  const gestor = crearGestor(editor)
  const previa = crearPrevia(editor)
  montarPolilinea(editor, herramientas, gestor, previa, iman)
  montarParalela(editor, herramientas, gestor)
  montarArco(editor, herramientas, gestor, previa, iman)
  montarArcoCentro(editor, herramientas, gestor, previa, iman)
  montarBote(editor, herramientas, gestor)
  montarBoceto(editor, herramientas, gestor, previa)
  montarFormas(editor)
  montarPinceles(editor, gestor)
}
