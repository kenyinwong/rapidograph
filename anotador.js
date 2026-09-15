/**
 * Anotador de observaciones sobre la interfaz de RapidoGraph.
 *
 * Un botón flotante abre el panel; desde ahí se arma el modo de marcado: al
 * pasar el cursor se resalta el elemento bajo él (entrando también en los
 * componentes con shadow DOM) y al hacer clic se captura, se escribe la
 * observación y queda un marcador numerado sobre el elemento. Las notas se
 * guardan en el navegador y se pueden copiar como texto listo para pegar en
 * una conversación (selector CSS, rótulo del elemento, ventana y fecha).
 *
 * Mientras el modo de marcado está activo, los clics NO llegan a la
 * aplicación: solo seleccionan. Con Escape se sale del modo.
 */

const CLAVE = 'rg_observaciones'

/* ------------------------------------------------------------ persistencia */

function leerNotas () {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '[]') } catch { return [] }
}

function guardarNotas (notas) {
  try { localStorage.setItem(CLAVE, JSON.stringify(notas)) } catch { /* modo privado */ }
}

/* ---------------------------------------------------- selector del elemento */

/** Selector dentro de un mismo árbol (documento o shadow root). */
function selectorLocal (el) {
  const partes = []
  let n = el
  for (let salto = 0; n && n.nodeType === 1 && salto < 5; salto++) {
    if (n.id) { partes.unshift('#' + n.id); break }
    let parte = n.tagName.toLowerCase()
    const clase = typeof n.className === 'string' && n.className.trim().split(/\s+/)[0]
    if (clase) parte += '.' + clase
    const padre = n.parentElement
    if (padre) {
      const iguales = [...padre.children].filter(h => h.tagName === n.tagName)
      if (iguales.length > 1) parte += `:nth-of-type(${iguales.indexOf(n) + 1})`
    }
    partes.unshift(parte)
    n = padre
  }
  return partes.join(' > ')
}

/** Selector completo, cruzando shadow DOM con «>>>». */
function selectorDe (el) {
  const cadena = []
  let n = el
  while (n && n.nodeType === 1) {
    cadena.unshift(selectorLocal(n))
    const raiz = n.getRootNode()
    n = raiz instanceof ShadowRoot ? raiz.host : null
  }
  return cadena.join(' >>> ')
}

/** Descripción legible: etiqueta, id, título o texto visible. */
function rotuloDe (el) {
  const titulo = el.title || el.getAttribute?.('aria-label') ||
    (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host.title : '')
  const texto = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return [el.tagName.toLowerCase(), titulo && `«${titulo}»`, !titulo && texto && `«${texto}»`]
    .filter(Boolean).join(' ')
}

/* ----------------------------------------------------------------- montaje */

export function montarAnotador () {
  if (document.getElementById('an_boton')) return

  const estilo = document.createElement('style')
  estilo.textContent = `
    #an_boton {
      position: fixed; right: 18px; bottom: 18px; z-index: 9000;
      font: 600 13px 'Segoe UI', Inter, system-ui, sans-serif;
      color: #ffffff; background: #dc3839; border: none; border-radius: 999px;
      padding: 10px 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25);
    }
    #an_boton:hover { background: #c2302f; }
    #an_boton.activo { background: #302a52; }
    #an_panel {
      position: fixed; right: 18px; bottom: 64px; z-index: 9000; width: 320px;
      max-height: min(430px, 70vh); overflow: auto;
      font: 13px 'Segoe UI', Inter, system-ui, sans-serif; color: #3d3832;
      background: #ffffff; border: 1px solid #dfdfe4; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.22); padding: 12px;
    }
    #an_panel h3 { margin: 0 0 8px; font-size: 13.5px; }
    #an_panel .an_fila { display: flex; gap: 6px; margin-bottom: 10px; }
    #an_panel button {
      font: inherit; border: 1px solid #dfdfe4; background: #ffffff; color: #3d3832;
      border-radius: 7px; padding: 6px 10px; cursor: pointer;
    }
    #an_panel button:hover { background: #ececf0; }
    #an_panel button.an_primario { background: #302a52; border-color: #302a52; color: #fff; }
    #an_panel button.an_primario:hover { background: #423a6d; }
    #an_panel ol { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
    #an_panel li { line-height: 1.4; }
    #an_panel li .an_sel { color: #75757d; font-size: 11.5px; word-break: break-all; }
    #an_panel li button { padding: 1px 7px; font-size: 11.5px; margin-left: 4px; }
    #an_panel .an_vacio { color: #75757d; margin: 4px 0 8px; }
    #an_resalte {
      position: fixed; z-index: 8998; pointer-events: none; display: none;
      border: 2px solid #dc3839; border-radius: 4px; background: rgba(220,56,57,.08);
    }
    #an_marcas { position: fixed; inset: 0; z-index: 8997; pointer-events: none; }
    #an_marcas .an_marca {
      position: absolute; transform: translate(-50%, -50%);
      min-width: 20px; height: 20px; border-radius: 999px; padding: 0 4px;
      background: #dc3839; color: #fff; font: 700 12px/20px 'Segoe UI', sans-serif;
      text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.35);
    }
    #an_forma {
      position: fixed; z-index: 9001; width: 260px;
      background: #ffffff; border: 1px solid #dfdfe4; border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.25); padding: 10px;
      font: 13px 'Segoe UI', Inter, system-ui, sans-serif; color: #3d3832;
    }
    #an_forma .an_sel { color: #75757d; font-size: 11px; word-break: break-all; margin-bottom: 6px; }
    #an_forma textarea {
      width: 100%; box-sizing: border-box; min-height: 64px; resize: vertical;
      font: inherit; color: inherit; border: 1px solid #dfdfe4; border-radius: 7px; padding: 6px 8px;
    }
    #an_forma .an_fila { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
    body.an_marcando, body.an_marcando * { cursor: crosshair !important; }
  `
  document.head.append(estilo)

  const boton = document.createElement('button')
  boton.id = 'an_boton'; boton.type = 'button'; boton.textContent = 'Observaciones'
  boton.title = 'Anotar observaciones sobre la interfaz'
  document.body.append(boton)

  const resalte = document.createElement('div'); resalte.id = 'an_resalte'
  const marcas = document.createElement('div'); marcas.id = 'an_marcas'
  document.body.append(resalte, marcas)

  let panel = null
  let forma = null
  let marcando = false
  let objetivo = null

  const esPropio = (el) => el && (el.closest?.('#an_panel, #an_forma, #an_boton') ||
    ['an_panel', 'an_forma', 'an_boton'].includes(el.id))

  /* ---------- marcadores numerados ---------- */
  function pintarMarcas () {
    marcas.textContent = ''
    leerNotas().filter(n => n.pagina === location.pathname).forEach((nota) => {
      let el = null
      try {
        el = nota.selector.split(' >>> ').reduce(
          (raiz, sel) => raiz && (raiz.shadowRoot || raiz).querySelector
            ? (raiz.shadowRoot || raiz).querySelector(sel)
            : null,
          document)
      } catch { /* selector que ya no existe */ }
      if (!el) return
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) return
      const m = document.createElement('div')
      m.className = 'an_marca'
      m.textContent = nota.n
      m.style.left = (r.right - 4) + 'px'
      m.style.top = (r.top + 4) + 'px'
      marcas.append(m)
    })
  }

  window.addEventListener('resize', pintarMarcas)
  document.addEventListener('scroll', pintarMarcas, { capture: true, passive: true })

  /* ---------- panel ---------- */
  function abrirPanel () {
    cerrarPanel()
    panel = document.createElement('div')
    panel.id = 'an_panel'
    const notas = leerNotas().filter(n => n.pagina === location.pathname)
    panel.innerHTML = `
      <h3>Observaciones de esta página</h3>
      <div class="an_fila">
        <button type="button" class="an_primario" id="an_marcar">＋ Marcar elemento</button>
        <button type="button" id="an_copiar" ${notas.length ? '' : 'disabled'}>Copiar todo</button>
        <button type="button" id="an_borrar" ${notas.length ? '' : 'disabled'}>Vaciar</button>
      </div>
      ${notas.length ? '<ol>' + notas.map(n => `
        <li value="${n.n}">${n.texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}
          <button type="button" data-quitar="${n.n}" title="Quitar esta observación">×</button>
          <div class="an_sel">${n.etiqueta} — ${n.selector.replace(/</g, '&lt;')}</div>
        </li>`).join('') + '</ol>'
      : '<p class="an_vacio">Todavía no hay observaciones. Con «Marcar elemento» eliges un botón o zona y escribes el cambio que quieres.</p>'}
    `
    panel.querySelector('#an_marcar').addEventListener('click', () => { cerrarPanel(); activarMarcado(true) })
    panel.querySelector('#an_copiar').addEventListener('click', copiarTodo)
    panel.querySelector('#an_borrar').addEventListener('click', () => {
      guardarNotas(leerNotas().filter(n => n.pagina !== location.pathname))
      pintarMarcas(); abrirPanel()
    })
    panel.addEventListener('click', (e) => {
      const num = e.target.dataset && e.target.dataset.quitar
      if (num) {
        guardarNotas(leerNotas().filter(n => !(n.pagina === location.pathname && String(n.n) === num)))
        pintarMarcas(); abrirPanel()
      }
    })
    document.body.append(panel)
  }

  function cerrarPanel () { if (panel) { panel.remove(); panel = null } }

  async function copiarTodo () {
    const notas = leerNotas().filter(n => n.pagina === location.pathname)
    const fecha = new Date().toLocaleString('es-CL')
    const texto = [
      'OBSERVACIONES SOBRE LA INTERFAZ — RapidoGraph',
      `Página: ${location.pathname} · Ventana: ${window.innerWidth}x${window.innerHeight} · ${fecha}`,
      '',
      ...notas.map(n => `${n.n}. [${n.selector}] ${n.etiqueta}\n   ${n.texto}\n   (anotada el ${n.fecha}, ventana ${n.ventana})`)
    ].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      panel.querySelector('#an_copiar').textContent = '¡Copiado!'
      setTimeout(() => panel && abrirPanel(), 900)
    } catch {
      window.prompt('Copia el texto con Ctrl+C:', texto)
    }
  }

  /* ---------- modo de marcado ---------- */
  function elementoBajo (e) {
    const ruta = e.composedPath()
    const el = ruta.find(x => x.nodeType === 1 && !esPropio(x) &&
      x !== document.documentElement && x !== document.body &&
      x.id !== 'an_resalte' && x.id !== 'an_marcas')
    return el || null
  }

  function activarMarcado (encendido) {
    marcando = encendido
    boton.classList.toggle('activo', encendido)
    boton.textContent = encendido ? 'Marcando… (Esc para salir)' : 'Observaciones'
    document.body.classList.toggle('an_marcando', encendido)
    if (!encendido) { resalte.style.display = 'none'; cerrarForma() }
  }

  function mover (e) {
    if (!marcando || forma) return
    const el = elementoBajo(e)
    if (!el) { resalte.style.display = 'none'; return }
    const r = el.getBoundingClientRect()
    resalte.style.display = 'block'
    resalte.style.left = (r.left - 2) + 'px'
    resalte.style.top = (r.top - 2) + 'px'
    resalte.style.width = r.width + 'px'
    resalte.style.height = r.height + 'px'
  }

  function cerrarForma () { if (forma) { forma.remove(); forma = null } }

  function abrirForma (el, x, y) {
    cerrarForma()
    objetivo = el
    forma = document.createElement('div')
    forma.id = 'an_forma'
    forma.innerHTML = `
      <div class="an_sel">${rotuloDe(el).replace(/</g, '&lt;')}</div>
      <textarea placeholder="¿Qué cambio quieres aquí?"></textarea>
      <div class="an_fila">
        <button type="button" id="an_cancelar">Cancelar</button>
        <button type="button" class="an_primario" id="an_guardar">Guardar</button>
      </div>`
    forma.style.left = Math.min(x, window.innerWidth - 280) + 'px'
    forma.style.top = Math.min(y, window.innerHeight - 190) + 'px'
    document.body.append(forma)
    const area = forma.querySelector('textarea')
    area.focus()
    forma.querySelector('#an_cancelar').addEventListener('click', () => { cerrarForma() })
    forma.querySelector('#an_guardar').addEventListener('click', () => {
      const texto = area.value.trim()
      if (!texto) { area.focus(); return }
      const notas = leerNotas()
      const enPagina = notas.filter(n => n.pagina === location.pathname)
      notas.push({
        n: (enPagina.length ? Math.max(...enPagina.map(n => n.n)) : 0) + 1,
        pagina: location.pathname,
        selector: selectorDe(objetivo),
        etiqueta: rotuloDe(objetivo),
        texto,
        ventana: window.innerWidth + 'x' + window.innerHeight,
        fecha: new Date().toLocaleString('es-CL')
      })
      guardarNotas(notas)
      cerrarForma()
      activarMarcado(false)
      pintarMarcas()
      abrirPanel()
    })
  }

  // En modo de marcado, ningún clic llega a la aplicación: solo selecciona.
  const interceptar = (e) => {
    if (!marcando) return
    if (esPropio(e.composedPath()[0])) return
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'click') {
      const el = elementoBajo(e)
      if (el) abrirForma(el, e.clientX + 10, e.clientY + 10)
    }
  }
  for (const tipo of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
    document.addEventListener(tipo, interceptar, true)
  }
  document.addEventListener('pointermove', mover, true)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && marcando) { e.stopPropagation(); activarMarcado(false) }
  }, true)

  boton.addEventListener('click', () => {
    if (marcando) { activarMarcado(false); return }
    panel ? cerrarPanel() : abrirPanel()
  })

  pintarMarcas()
}

montarAnotador()
