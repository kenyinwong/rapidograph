/**
 * Gestos táctiles de RapidoGraph.
 *
 * SVG-Edit ya traduce un dedo a eventos de ratón, pero el navegador se quedaba
 * con el gesto (desplazaba o ampliaba la página) antes de que llegara: por eso
 * en la tablet no respondían ni la mano ni el dibujo, y el pellizco no existía.
 *
 *   · `touch-action: none` en el lienzo → los gestos llegan a la aplicación.
 *   · Un dedo  → lo maneja SVG-Edit con la herramienta elegida. Aquí solo se
 *                añade el "clic" del toque simple, que sus modos no necesitan
 *                pero los de RapidoGraph (polilínea, bote, juntar…) sí.
 *   · Dos dedos → pellizco para el zoom, centrado entre los dedos, y arrastre
 *                para desplazar la vista. Si había un trazo a medias, se cierra.
 *   · Ctrl + rueda (pellizco en el panel táctil de un portátil) → zoom.
 */

// misma marca de versión que el resto, para no quedar en la caché del navegador
const version = new URL(import.meta.url).search
const { pagina, zoomEn } = await import('./rapidograph-lienzo.js' + version)

export function montarTactil (editor) {
  const zona = editor.querySelector('#workarea')
  // sin esto el navegador se queda con los gestos (desplaza o amplía la página)
  zona.style.touchAction = 'none'

  const dedos = new Map()        // pointerId -> { x, y, objetivo }
  let dibujando = null           // primer dedo: su arrastre lo traduce SVG-Edit
  let inicio = null              // dónde tocó, para saber si fue un toque simple
  let pellizco = null            // { distancia, cx, cy }

  const raton = (tipo, e, objetivo, botones) => {
    const clon = new MouseEvent(tipo, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      button: 0,
      buttons: botones,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey
    })
    clon.rgTactil = true
    ;(objetivo || e.target).dispatchEvent(clon)
  }

  const medir = () => {
    const [a, b] = [...dedos.values()]
    return { distancia: Math.hypot(b.x - a.x, b.y - a.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }

  zona.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY, objetivo: e.target })
    if (dedos.size === 1) {
      dibujando = e.pointerId
      inicio = { x: e.clientX, y: e.clientY }
    } else if (dedos.size === 2) {
      // el segundo dedo convierte el gesto en navegación: se suelta el "ratón"
      if (dibujando !== null) {
        const primero = dedos.get(dibujando)
        raton('mouseup', { ...e, clientX: primero.x, clientY: primero.y, screenX: 0, screenY: 0 }, primero.objetivo, 0)
        dibujando = null
      }
      pellizco = medir()
    }
  }, true)

  zona.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !dedos.has(e.pointerId)) return
    const dedo = dedos.get(e.pointerId)
    dedo.x = e.clientX; dedo.y = e.clientY
    if (dedos.size === 2 && pellizco) {
      const ahora = medir()
      const p = pagina(editor)
      if (p && pellizco.distancia > 8) {
        const factor = ahora.distancia / pellizco.distancia
        if (Math.abs(factor - 1) > 0.015) {
          zoomEn(editor, p.zoom * factor, ahora.cx, ahora.cy)
          pellizco.distancia = ahora.distancia
        }
      }
      zona.scrollLeft -= ahora.cx - pellizco.cx
      zona.scrollTop -= ahora.cy - pellizco.cy
      pellizco.cx = ahora.cx; pellizco.cy = ahora.cy
    }
  }, true)

  const soltar = (e) => {
    if (e.pointerType !== 'touch' || !dedos.has(e.pointerId)) return
    const dedo = dedos.get(e.pointerId)
    dedos.delete(e.pointerId)
    if (dibujando === e.pointerId) {
      // el toque simple cuenta como clic para los modos de RapidoGraph
      if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 8) raton('click', e, dedo.objetivo, 0)
      dibujando = null
      inicio = null
    }
    if (dedos.size < 2) pellizco = null
  }
  zona.addEventListener('pointerup', soltar, true)
  zona.addEventListener('pointercancel', soltar, true)

  // Si el navegador emite además su propio clic "de compatibilidad" tras el
  // toque, llegaría duplicado: se descarta.
  let ultimoToque = 0
  zona.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') ultimoToque = Date.now() }, true)
  zona.addEventListener('click', (e) => {
    if (e.isTrusted && Date.now() - ultimoToque < 700) { e.stopImmediatePropagation(); e.preventDefault() }
  }, true)

  // pellizco en el panel táctil de un portátil: llega como rueda con Ctrl
  zona.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const p = pagina(editor)
    if (p) zoomEn(editor, p.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
  }, { passive: false })
}
