/**
 * RapidoGraph — selección y herramientas.
 *
 *   · Contorno tenue: lo seleccionado se marca con un halo que sigue su forma,
 *     sin manijas (el recuadro de escala y giro es la herramienta Transformación).
 *   · Una sola herramienta a la vez: elegir una de SVG-Edit apaga las propias.
 *   · Las herramientas de dibujo quedan activas hasta Esc o la flecha de
 *     selección (selectNew: false, que setConfig del editor no deja pasar).
 */

const version = new URL(import.meta.url).search
const { sc, elegirSeleccion } = await import('./rapidograph-lienzo.js' + version)

const SVG_NS = 'http://www.w3.org/2000/svg'

// figuras que no tienen trazo propio que seguir: se marca su caja
const POR_CAJA = ['image', 'use', 'foreignObject', 'svg']

// modos de SVG-Edit de los que Esc vuelve a la flecha
const MODOS_DE_DIBUJO = [
  'fhpath', 'line', 'rect', 'square', 'fhrect', 'ellipse', 'circle', 'fhellipse',
  'star', 'polygon', 'shapelib', 'text', 'image', 'connector', 'eyedropper', 'zoom'
]

function montarContorno (editor) {
  const raiz = editor.querySelector('#svgroot')
  if (!raiz) return
  const halo = document.createElementNS(SVG_NS, 'g')
  halo.id = 'rg_contorno'
  halo.setAttribute('pointer-events', 'none')
  // por detrás del dibujo: el halo asoma alrededor de la figura sin teñirla
  raiz.insertBefore(halo, raiz.querySelector('#svgcontent'))

  let firma = ''

  function copia (el, m, escala) {
    const etiqueta = el.tagName.toLowerCase()
    let nodo
    if (POR_CAJA.includes(etiqueta)) {
      const c = el.getBBox()
      nodo = document.createElementNS(SVG_NS, 'rect')
      nodo.setAttribute('x', c.x); nodo.setAttribute('y', c.y)
      nodo.setAttribute('width', c.width); nodo.setAttribute('height', c.height)
    } else {
      nodo = el.cloneNode(true)
      nodo.removeAttribute('transform')
    }
    const extra = 7 / escala
    for (const n of [nodo, ...nodo.querySelectorAll('*')]) {
      n.removeAttribute('id'); n.removeAttribute('class'); n.removeAttribute('style')
      n.removeAttribute('filter'); n.removeAttribute('opacity')
      const ancho = n.getAttribute('stroke') === 'none' ? 0 : (parseFloat(n.getAttribute('stroke-width')) || 0)
      n.setAttribute('stroke-width', ancho + extra)
    }
    nodo.setAttribute('transform', `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`)
    return nodo
  }

  function sincronizar () {
    const lienzo = sc()
    if (!lienzo) return
    const visible = lienzo.getMode() === 'select' && !editor.classList.contains('rg_transformar')
    const elegidos = visible ? lienzo.getSelectedElements().filter(e => e && e.isConnected) : []
    const base = raiz.getScreenCTM()
    if (!elegidos.length || !base) {
      if (firma) { halo.textContent = ''; firma = '' }
      return
    }
    const inversa = base.inverse()
    const matrices = elegidos.map(el => inversa.multiply(el.getScreenCTM()))
    const nueva = elegidos.map((el, i) => {
      const m = matrices[i]
      return el.outerHTML.length + ':' + el.outerHTML.slice(0, 400) + [m.a, m.b, m.c, m.d, m.e, m.f].map(v => v.toFixed(2)).join(',')
    }).join('|')
    if (nueva === firma) return
    firma = nueva
    halo.textContent = ''
    elegidos.forEach((el, i) => {
      const m = matrices[i]
      const escala = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1
      try { halo.append(copia(el, m, escala)) } catch { /* figura sin geometría */ }
    })
  }

  // el editor no avisa de cada cambio (arrastres, zoom, deshacer): se consulta
  // seguido y solo se toca el DOM cuando la firma cambia
  setInterval(sincronizar, 80)
}

function montarExclusividad (editor) {
  // sin esto SVG-Edit vuelve a la flecha y selecciona cada figura recién dibujada
  if (sc()) sc().getCurConfig().selectNew = false
  const paleta = editor.querySelector('#tools_left')
  if (!paleta) return
  // clic real en una herramienta de SVG-Edit: las propias se apagan
  paleta.addEventListener('click', (e) => {
    if (!e.isTrusted) return
    const deSvgEdit = e.composedPath().some(n => n.tagName && n.tagName.startsWith('SE-'))
    if (deSvgEdit) document.dispatchEvent(new CustomEvent('rg:modo', { detail: { origen: 'svgedit' } }))
  }, true)

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !sc()) return
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return
    if (MODOS_DE_DIBUJO.includes(sc().getMode())) elegirSeleccion()
  })
}

export function montarSeleccion (editor) {
  montarContorno(editor)
  montarExclusividad(editor)
}
