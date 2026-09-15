# RapidoGraph

Editor de dibujo vectorial en el navegador: trazados, formas, texto, capas,
guías isométricas y triangulares, imán, medición a escala, polilínea, paralela
(offset), arco por radio, bote de pintura, pinceles, y exportación a SVG, PNG,
PDF y **DXF**.

**Usar en línea:** https://kenyinwong.github.io/rapidograph/

Todo corre en el navegador: los dibujos no se suben a ningún servidor. La
sesión por correo solo identifica el trabajo en este equipo.

## Créditos y licencias
- Motor de edición: [SVG-Edit](https://github.com/SVG-Edit/svgedit) 7.4.2 — MIT
  (ver `LICENSE-MIT.txt`).
- Abrir y guardar archivos: [browser-fs-access](https://github.com/GoogleChromeLabs/browser-fs-access)
  0.38.0 — Apache-2.0 (licencia en `extensions/node_modules/browser-fs-access/`).
- Iconos: [Phosphor Icons](https://phosphoricons.com) — MIT.
- Capa RapidoGraph (interfaz, herramientas y exportación DXF): © crearcodex.com.

## Ejecutar en local
Cualquier servidor estático sirve, por ejemplo:

```
python -m http.server 8765
```

y abrir http://localhost:8765/
