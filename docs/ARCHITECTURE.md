# ARCHITECTURE.md

## Stack

- **React + TypeScript + Vite** — frontend, aplicación única (ver "Estructura de
  carpetas" más abajo; no monorepo por ahora).
- **Fabric.js 6.0.2** — motor gráfico del editor. Decisión validada con prototipos
  reales en Chrome/Playwright — ver `docs/DECISIONS.md`, D4, para el detalle de por qué
  esta versión y no 5.3.1.

Este MVP es standalone: sin backend, sin base de datos, sin Tienda Nube (ver
`docs/PRODUCT.md`, "Qué NO incluye este MVP").

## Principios de arquitectura

- **Fabric.js queda aislado dentro de una capa propia del editor.** Ningún componente
  de UI fuera de esa capa importa ni manipula objetos de Fabric directamente.
- **Una única instancia de Fabric por sesión de edición**, administrada por un
  hook/contexto dedicado — no se crea ni se destruye desde componentes de presentación.
- **Capa de acciones/comandos** entre la UI y Fabric: los paneles y botones invocan
  funciones con nombre de intención (`addCurvedText`, `setCurveIntensity`,
  `removeSelectedObject`, `serializeDesign`, `restoreDesign`, etc.), nunca llaman
  métodos de Fabric sueltos desde un componente. Ahí es donde vive el conocimiento ya
  aprendido en los prototipos (por ejemplo: asignar `path` con `.set()`, nunca por
  asignación directa; recalcular `pathStartOffset` cuando cambia el texto o la
  tipografía).
- **Fabric es la fuente de verdad del estado gráfico** (posición, forma, curvatura,
  contenido de cada objeto). React **no** duplica ese estado en `useState`; solo
  escucha los eventos de Fabric (`selection:created`, `selection:updated`,
  `selection:cleared`, `object:modified`, `text:changed`, etc.) para decidir qué mostrar.
- **React mantiene únicamente estado de UI**: selección activa (tipo de objeto y sus
  propiedades relevantes para el panel), paso actual del wizard (Plantillas / Diseño /
  Revisión), y estado de controles (modales, carga de imagen, etc.).
- **El modelo de diseño propio está separado del JSON interno de Fabric.** La app
  define sus propios tipos TypeScript para "un diseño" (texto, ícono, líneas
  circulares, imagen) en vez de depender de la forma exacta que Fabric use
  internamente para serializar — así, si el motor gráfico cambia en el futuro (como ya
  pasó una vez, de 5.3.1 a 6.0.2), el resto de la app no se ve afectado.
- **Serialización con `canvas.toJSON()` y restauración con `loadFromJSON()`** —
  validado en Fabric.js 6.0.2 sin necesidad de workarounds (a diferencia de 5.3.1, ver
  D4).
- **Autosave con debounce a `localStorage`**, disparado por los eventos de
  modificación del canvas, para no perder trabajo sin necesidad de backend.
- **Las medidas de la virola están centralizadas en una única configuración**, no
  hardcodeadas por distintos componentes — hoy con valores provisorios/pendientes (ver
  `docs/PRODUCTION-SPECS.md`), reemplazables por los reales sin tocar el editor.
- **Las guías visuales (cruces de alineación, guía del arco) están separadas del
  contenido real del diseño**, para no terminar formando parte del archivo final
  exportado (en los prototipos esto ya se resolvió marcando esos objetos como excluidos
  de la exportación de Fabric).
- **Los íconos se preparan como SVGs propios/curados** para el proyecto, no como una
  dependencia externa de íconos genéricos.
- La arquitectura debe permitir agregar backend, pedidos y la integración con Tienda
  Nube más adelante **sin rehacer el editor** — el editor no debe asumir en ningún
  punto que existe (o no existe) un backend detrás.

## Estructura de carpetas propuesta

Aplicación única, sin monorepo por ahora (ver nota más abajo sobre por qué se aparta
temporalmente de la estructura `apps/web` / `apps/api` de `CLAUDE.md`):

```
src/
  editor/
    canvas/
      useFabricCanvas.ts      setup y cleanup de la instancia de Fabric.Canvas
      actions.ts               capa de comandos (agregar/editar/mover/curvar/etc.)
      serialization.ts         toJSON()/loadFromJSON() + integración con autosave
      guides.ts                dibujo y exclusión de las guías visuales
    state/
      EditorContext.tsx        contexto: instancia de canvas, selección, paso actual
      designModel.ts           tipos TS propios del diseño (independientes de Fabric)
    panels/
      TemplatesPanel/
      TextEditorPanel/
      IconEditorPanel/
      ImageUploadPanel/
    icons/
      iconLibrary.ts           catálogo de íconos propios (SVG)
  components/                  UI genérica reutilizable (botones, tabs, inputs, modal)
  pages/
    EditorPage.tsx             orquesta los 3 pasos (Plantillas / Diseño / Revisión)
  config/
    virola.config.ts           medidas y parámetros de la virola (hoy provisorios)
  lib/
    storage.ts                 helpers de localStorage + debounce
    sanitize.ts                sanitización de imágenes/SVG subidos por el usuario
```

**Nota sobre el monorepo de `CLAUDE.md`:** la estructura original del proyecto propone
`apps/web`, `apps/api` y `packages/shared`. Mientras este MVP sea standalone (sin
backend), montar ese monorepo sería sobreingeniería para lo que hay que construir hoy.
Por eso se documenta acá una aplicación única bajo `src/`. El editor queda organizado
de forma autocontenida (toda su lógica de Fabric.js vive dentro de `src/editor/`, sin
asumir dónde ni cómo se despliega), justamente para poder moverlo a `apps/web/` dentro
del monorepo cuando se agregue backend/Tienda Nube, sin tener que reescribirlo.

## Qué queda deliberadamente fuera del MVP

- Cualquier llamada de red real (no hay backend todavía).
- Persistencia más allá de `localStorage` (nada de base de datos).
- Autenticación o manejo de usuarios.
- Vectorización automática real de imágenes subidas (ver "Decisiones pendientes").
- Cualquier lógica de `orderId` / `lineItemId` / `unitIndex` real (D1) — el modelo de
  diseño se prepara para eso, pero no se implementa en este MVP.

## Decisiones técnicas pendientes

- **Qué reemplaza exactamente a "Confirmar"**: alcance final de la pantalla de Revisión
  (¿descarga local del diseño en JSON + imagen preview? ¿solo visualización?).
- **Alcance de "vectorizar imagen"**: vectorización automática real (requiere evaluar
  librería o servicio) vs. una versión reducida para el MVP (subida directa de
  PNG/SVG con validación de formato y sanitización), dejando la vectorización real
  como fase posterior.
- **Origen y formato de la biblioteca de íconos** propios (cuántos, en qué estilo,
  cómo se gestionan/agregan nuevos).
- **Significado exacto de "invertir texto"** — a confirmar interactuando con la
  referencia en vivo antes de implementarlo (ver `docs/PRODUCT.md`).
- **Persistencia más allá de `localStorage`**: si diseños con imágenes subidas pesan
  demasiado para `localStorage`, evaluar IndexedDB.
- **Alcance del onboarding interactivo** (tour guiado visto en la referencia): ¿se
  construye en este MVP o se deja para una iteración posterior?
- **Comportamiento táctil/mobile** de los handles de Fabric.js (mover/escalar/rotar) y
  de la subida de imágenes en pantallas chicas — no resuelto por la referencia (solo
  se vio uso de escritorio) y es requisito propio del MVP.
- **Medidas reales de la virola** (`docs/PRODUCTION-SPECS.md`): siguen pendientes de
  recibir del cliente; hasta entonces, `config/virola.config.ts` usa valores
  provisorios claramente marcados como tales.
