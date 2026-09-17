/**
 * Geometría compartida del lienzo de RapidoGraph.
 *
 * El lienzo se siente infinito: la página de SVG-Edit es enorme y no se ve, y
 * todo lo auxiliar (guías, reglas, vistas previas, medición) se dibuja en capas
 * del tamaño de la VISTA, no de la página. Cada capa entrega un contexto ya
 * transformado a unidades del documento, así que el código que dibuja no sabe
 * nada de zoom ni de desplazamiento.
 */

export const sc = () => window.svgEditor && window.svgEditor.svgCanvas

/** Deja elegida la flecha de selección, también en la paleta de SVG-Edit. */
export function elegirSeleccion () {
  const ed = window.svgEditor
  if (ed && ed.leftPanel && ed.leftPanel.clickSelect) ed.leftPanel.clickSelect()
  else if (sc()) sc().setMode('select')
}

/** Rectángulo en pantalla de la página y zoom vigente. */
export function pagina (editor) {
  const fondo = editor.querySelector('#canvasBackground rect')
  if (!fondo || !sc()) return null
  const rect = fondo.getBoundingClientRect()
  const res = sc().getResolution()
  return { rect, zoom: rect.width / res.w || 1 }
}

export const aDocumento = (p, x, y) => [(x - p.rect.left) / p.zoom, (y - p.rect.top) / p.zoom]
export const aPantalla = (p, x, y) => [p.rect.left + x * p.zoom, p.rect.top + y * p.zoom]

/** Rectángulo visible del área de trabajo, sin sus barras de desplazamiento. */
export function vista (editor) {
  const zona = editor.querySelector('#workarea')
  const r = zona.getBoundingClientRect()
  return { left: r.left, top: r.top, width: zona.clientWidth, height: zona.clientHeight }
}

/**
 * Capa de dibujo que cubre la vista. `contexto()` la ajusta al tamaño actual,
 * la limpia y devuelve el contexto en unidades del documento junto con el
 * rectángulo visible en esas mismas unidades.
 */
export function crearCapaVista (editor, id, orden = 4) {
  const capa = document.createElement('canvas')
  capa.id = id
  capa.className = 'rg_capa_vista'
  capa.style.zIndex = orden
  capa.style.display = 'none'
  editor.append(capa)

  function contexto () {
    const p = pagina(editor)
    if (!p) return null
    const v = vista(editor)
    const base = editor.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    capa.style.display = 'block'
    capa.style.left = (v.left - base.left) + 'px'
    capa.style.top = (v.top - base.top) + 'px'
    capa.style.width = v.width + 'px'
    capa.style.height = v.height + 'px'
    const w = Math.max(1, Math.round(v.width * dpr)); const h = Math.max(1, Math.round(v.height * dpr))
    if (capa.width !== w) capa.width = w
    if (capa.height !== h) capa.height = h
    const ctx = capa.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const ox = p.rect.left - v.left; const oy = p.rect.top - v.top
    ctx.setTransform(dpr * p.zoom, 0, 0, dpr * p.zoom, dpr * ox, dpr * oy)
    const visible = {
      x0: -ox / p.zoom,
      y0: -oy / p.zoom,
      x1: (v.width - ox) / p.zoom,
      y1: (v.height - oy) / p.zoom
    }
    return { ctx, p, v, dpr, visible, origen: [ox, oy] }
  }

  return { contexto, ocultar: () => { capa.style.display = 'none' }, elemento: capa }
}

/**
 * Avisa cuando la vista cambia (desplazamiento, zoom, tamaño de ventana o de
 * página). Las llamadas se agrupan en un solo repintado.
 */
export function alCambiarVista (editor, fn) {
  let pendiente = false
  const pedir = () => {
    if (pendiente) return
    pendiente = true
    requestAnimationFrame(() => { pendiente = false; fn() })
  }
  const zona = editor.querySelector('#workarea')
  const lienzo = editor.querySelector('#svgcanvas')
  zona.addEventListener('scroll', pedir, { passive: true })
  window.addEventListener('resize', pedir)
  const observador = new MutationObserver(pedir)
  if (lienzo) observador.observe(lienzo, { attributes: true, attributeFilter: ['style', 'width', 'height'] })
  const contenido = editor.querySelector('#svgcontent')
  if (contenido) observador.observe(contenido, { attributes: true, attributeFilter: ['width', 'height', 'viewBox', 'style'] })
  if (window.ResizeObserver && lienzo) new ResizeObserver(pedir).observe(lienzo)
  return pedir
}

/**
 * Cambia el zoom manteniendo fijo bajo el cursor (o los dedos) el punto de
 * pantalla dado. Replica el cálculo de la rueda de SVG-Edit.
 */
export function zoomEn (editor, nuevoZoom, clientX, clientY) {
  const lienzo = sc()
  const p = pagina(editor)
  if (!lienzo || !p) return
  const z = Math.min(10, Math.max(0.05, nuevoZoom))
  if (Math.abs(z - p.zoom) < 1e-4) return
  const zona = editor.querySelector('#workarea')
  const v = zona.getBoundingClientRect()
  // punto del documento bajo el foco, y dónde debe quedar tras el zoom
  const [dx, dy] = aDocumento(p, clientX, clientY)
  lienzo.setZoom(z)
  const campo = document.getElementById('zoom')
  if (campo) campo.value = (z * 100).toFixed(1)
  lienzo.call('updateCanvas', { center: false, newCtr: { x: dx * z, y: dy * z } })
  lienzo.call('zoomDone')
  // updateCanvas centra ese punto: se corrige para que quede bajo el foco
  const q = pagina(editor)
  if (!q) return
  const [sx, sy] = aPantalla(q, dx, dy)
  zona.scrollLeft += sx - clientX
  zona.scrollTop += sy - clientY
  void v
}
