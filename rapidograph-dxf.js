/**
 * Exportación a DXF (AutoCAD R12 ASCII) del dibujo abierto en RapidoGraph.
 *
 * Cómo funciona: cada figura se lleva a coordenadas del documento aplicando su
 * matriz respecto de #svgcontent, y se escribe como entidad DXF. Las curvas
 * (trazados, elipses giradas) se aproximan muestreando el propio SVG con
 * getPointAtLength, así que sale lo mismo que se ve en pantalla.
 *
 * El eje Y se invierte (en SVG crece hacia abajo, en DXF hacia arriba) usando
 * la altura de la página como referencia.
 */

const COLORES_ACI = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]],
  [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [255, 255, 255]]
]

/** Color DXF más parecido al del trazo. El 7 es el color por omisión. */
function colorACI (css) {
  if (!css || css === 'none') return 7
  const m = css.match(/^#?([0-9a-f]{6})$/i) || css.match(/rgba?\(([^)]+)\)/i)
  let rgb = null
  if (m && m[1] && m[1].length === 6) {
    rgb = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]
  } else if (m) {
    rgb = m[1].split(',').slice(0, 3).map(v => parseInt(v, 10))
  }
  if (!rgb || rgb.some(isNaN)) return 7
  // el negro y los grises se dejan en el color por omisión
  if (Math.max(...rgb) - Math.min(...rgb) < 40) return 7
  let mejor = 7; let dist = Infinity
  for (const [aci, c] of COLORES_ACI) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2
    if (d < dist) { dist = d; mejor = aci }
  }
  return mejor
}

/** Nombre de capa admisible en R12: mayúsculas, sin espacios ni signos raros. */
function nombreCapa (texto, indice) {
  const limpio = (texto || '').trim().toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[^A-Z0-9_$-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31)
  return limpio || ('CAPA' + (indice + 1))
}

export function generarDXF (svgCanvas) {
  const contenido = document.getElementById('svgcontent')
  if (!contenido) throw new Error('No se encuentra el dibujo')
  const res = svgCanvas.getResolution()
  const alto = res.h

  // Referencia de coordenadas: el rectángulo blanco de la página. Su posición en
  // pantalla y el ancho del documento dan la escala, así que cualquier punto se
  // lleva a unidades del documento sin depender de cómo el editor haya movido o
  // escalado el lienzo por dentro.
  const fondo = document.querySelector('#canvasBackground rect')
  const pagina = (fondo || contenido).getBoundingClientRect()
  const zoom = (pagina.width / res.w) || 1

  const capas = []
  const entidades = []
  const extremos = { xmin: 0, ymin: 0, xmax: res.w, ymax: alto }

  const aDocumento = (el, x, y) => {
    const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM())
    return [(p.x - pagina.left) / zoom, alto - (p.y - pagina.top) / zoom]
  }

  const sinGiro = (el) => {
    const m = el.getScreenCTM()
    return Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6 && Math.abs(Math.abs(m.a) - Math.abs(m.d)) < 1e-6
  }

  const escalaDe = (el) => {
    const m = el.getScreenCTM()
    return (Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / zoom) || 1
  }

  const anota = (puntos) => {
    for (const [x, y] of puntos) {
      extremos.xmin = Math.min(extremos.xmin, x); extremos.xmax = Math.max(extremos.xmax, x)
      extremos.ymin = Math.min(extremos.ymin, y); extremos.ymax = Math.max(extremos.ymax, y)
    }
  }

  const c = (codigo, valor) => entidades.push(String(codigo), String(valor))
  const num = (v) => (Math.round(v * 1e6) / 1e6).toFixed(6)

  function linea (capa, color, p1, p2) {
    anota([p1, p2])
    c(0, 'LINE'); c(8, capa); c(62, color)
    c(10, num(p1[0])); c(20, num(p1[1])); c(30, '0.0')
    c(11, num(p2[0])); c(21, num(p2[1])); c(31, '0.0')
  }

  function polilinea (capa, color, puntos, cerrada) {
    if (puntos.length < 2) return
    if (puntos.length === 2 && !cerrada) return linea(capa, color, puntos[0], puntos[1])
    anota(puntos)
    c(0, 'POLYLINE'); c(8, capa); c(62, color); c(66, 1); c(70, cerrada ? 1 : 0)
    c(10, '0.0'); c(20, '0.0'); c(30, '0.0')
    for (const [x, y] of puntos) {
      c(0, 'VERTEX'); c(8, capa); c(10, num(x)); c(20, num(y)); c(30, '0.0')
    }
    c(0, 'SEQEND'); c(8, capa)
  }

  function circulo (capa, color, centro, radio) {
    anota([[centro[0] - radio, centro[1] - radio], [centro[0] + radio, centro[1] + radio]])
    c(0, 'CIRCLE'); c(8, capa); c(62, color)
    c(10, num(centro[0])); c(20, num(centro[1])); c(30, '0.0'); c(40, num(radio))
  }

  function texto (capa, color, punto, altura, valor, angulo) {
    anota([punto])
    c(0, 'TEXT'); c(8, capa); c(62, color)
    c(10, num(punto[0])); c(20, num(punto[1])); c(30, '0.0')
    c(40, num(altura)); c(1, valor.replace(/\s+/g, ' ').slice(0, 250))
    if (angulo) c(50, num(angulo))
  }

  /** Aproxima cualquier figura con geometría muestreando su longitud. */
  function muestrear (el, capa, color, cerrada) {
    let largo = 0
    try { largo = el.getTotalLength() } catch { return }
    if (!largo) return
    const pasos = Math.min(4000, Math.max(8, Math.round(largo / 1.5)))
    const puntos = []
    for (let i = 0; i <= pasos; i++) {
      const p = el.getPointAtLength(largo * i / pasos)
      puntos.push(aDocumento(el, p.x, p.y))
    }
    polilinea(capa, color, puntos, cerrada)
  }

  function figura (el, capa) {
    const est = getComputedStyle(el)
    if (est.display === 'none' || est.visibility === 'hidden') return
    const color = colorACI(est.stroke !== 'none' ? est.stroke : est.fill)
    const t = el.tagName.toLowerCase()
    const a = (n) => parseFloat(el.getAttribute(n) || 0)

    if (t === 'line') {
      linea(capa, color, aDocumento(el, a('x1'), a('y1')), aDocumento(el, a('x2'), a('y2')))
    } else if (t === 'rect') {
      const x = a('x'); const y = a('y'); const w = a('width'); const h = a('height')
      if (a('rx') > 0 || a('ry') > 0) return muestrear(el, capa, color, true)
      polilinea(capa, color, [
        aDocumento(el, x, y), aDocumento(el, x + w, y),
        aDocumento(el, x + w, y + h), aDocumento(el, x, y + h)
      ], true)
    } else if (t === 'circle' && sinGiro(el)) {
      circulo(capa, color, aDocumento(el, a('cx'), a('cy')), a('r') * escalaDe(el))
    } else if (t === 'polyline' || t === 'polygon') {
      const puntos = []
      for (const p of el.points) puntos.push(aDocumento(el, p.x, p.y))
      polilinea(capa, color, puntos, t === 'polygon')
    } else if (t === 'text') {
      const alturaTexto = parseFloat(est.fontSize) * escalaDe(el) || 12
      const p = aDocumento(el, a('x'), a('y'))
      texto(capa, color, p, alturaTexto, el.textContent || '', 0)
    } else if (t === 'circle' || t === 'ellipse' || t === 'path') {
      muestrear(el, capa, color, t !== 'path' || /z\s*$/i.test(el.getAttribute('d') || ''))
    } else if (t === 'g' || t === 'a') {
      for (const hijo of el.children) figura(hijo, capa)
    }
    // image, use, foreignObject y demás no tienen representación en DXF: se omiten
  }

  const grupos = [...contenido.children].filter(e => e.tagName.toLowerCase() === 'g')
  grupos.forEach((g, i) => {
    const titulo = g.querySelector(':scope > title')
    const capa = nombreCapa(titulo && titulo.textContent, i)
    capas.push(capa)
    for (const hijo of g.children) {
      if (hijo.tagName.toLowerCase() === 'title') continue
      figura(hijo, capa)
    }
  })
  if (!capas.length) capas.push('CAPA1')

  const cab = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSBASE', '10', '0.0', '20', '0.0', '30', '0.0',
    '9', '$EXTMIN', '10', num(extremos.xmin), '20', num(extremos.ymin), '30', '0.0',
    '9', '$EXTMAX', '10', num(extremos.xmax), '20', num(extremos.ymax), '30', '0.0',
    '0', 'ENDSEC'
  ]
  const tablas = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(capas.length)]
  for (const capa of capas) {
    tablas.push('0', 'LAYER', '2', capa, '70', '0', '62', '7', '6', 'CONTINUOUS')
  }
  tablas.push('0', 'ENDTAB', '0', 'ENDSEC')

  const cuerpo = ['0', 'SECTION', '2', 'ENTITIES', ...entidades, '0', 'ENDSEC', '0', 'EOF']
  return cab.concat(tablas, cuerpo).join('\r\n') + '\r\n'
}

/** Genera el DXF y lo ofrece como descarga. */
export function descargarDXF (svgCanvas, nombre) {
  const dxf = generarDXF(svgCanvas)
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }))
  enlace.download = (nombre || 'dibujo').replace(/\.svg$/i, '') + '.dxf'
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 4000)
  return dxf.length
}
