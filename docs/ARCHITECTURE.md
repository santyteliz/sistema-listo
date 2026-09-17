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

## Catálogo de íconos (biblioteca administrable)

Etapa 1 de un plan más amplio (biblioteca real de ~370 íconos del cliente + selector
con categorías/búsqueda + upload de usuario + administrador del equipo — ver el
análisis previo, no repetido acá). Esta etapa **solo** deja preparados el modelo y el
normalizador — no importa los PDFs reales, no cambia el selector actual, no toca
`iconLibrary.ts`/`createIconObject`.

- **Formato interno definitivo de un ícono: SVG (datos de trazo `d`), no PNG.**
  Mismo mecanismo que ya usa `iconLibrary.ts` hoy (`new Path(svgPath, {...})` de
  Fabric.js) — sin esto, un ícono nuevo necesitaría un segundo tipo de objeto Fabric
  (`fabric.Image`), rompiendo la homogeneidad que hoy asumen `containment.ts`,
  clipping, resize y rotación (todos genéricos sobre el bounding box de un `Path`).
- **`IconAsset`/`IconCategory`** (`src/editor/icons/iconCatalog.ts`) son el modelo de
  catálogo administrable — separado de `IconDefinition` (`iconLibrary.ts`), que sigue
  siendo la fuente de verdad que usa el editor HOY. `id` es estable y queda grabado
  en diseños serializados (`iconId`); `name` es solo de presentación y puede cambiar
  libremente sin afectar `id`. Las categorías también tienen `id` estable e
  independiente de su `name`, por el mismo motivo.
- **`active: false` en vez de borrado físico**: desactivar un ícono o una categoría lo
  oculta para usuarios nuevos sin borrar el recurso — necesario para que un diseño ya
  guardado que lo usa siga pudiendo reconstruirse más adelante (versionado — ver el
  análisis previo, "Versionado y futuras actualizaciones").
- **Biblioteca y uploads de usuario comparten el mismo tipo Fabric `icon`**
  (`graphicKind: 'icon'`, ver `iconElement.ts`) y el mismo cupo (`MAX_ICON_ELEMENTS`,
  `designLimits.ts`) — `IconAsset.source: 'library' | 'upload'` es solo trazabilidad,
  nunca un segundo sistema de límites ni un segundo tipo de elemento. `custom-image`
  (ya modelado en `designLimits.ts` con cupo en `0`) NO se usa para esto.
- **`normalizeIconPath.ts`** recalcula el bounding box real de un `d` de SVG (nunca
  confía en un viewBox externo declarado), lo centra y lo reescala de forma uniforme
  (preserva la proporción del dibujo original) al viewBox de referencia `0 0 100 100`
  que ya usan los 6 íconos actuales — para que un ícono importado de un PDF, o subido
  por un usuario, entre al editor con el mismo criterio geométrico que uno ya
  hardcodeado, sin aparecer gigante/diminuto/desplazado.
- **Nunca interpreta el contenido como SVG/HTML ejecutable** (sin `DOMParser`, sin
  `innerHTML`, sin `loadSVGFromString`) — mismo principio de seguridad ya documentado
  en "SVG y seguridad" más arriba. Solo trabaja con datos geométricos (comandos de
  path + números), nunca con markup.
- El futuro administrador del equipo (todavía sin diseñar) va a tener que poder
  crear/renombrar/ordenar/desactivar categorías e íconos **sin modificar código** —
  este modelo es la base de datos que ese administrador va a leer/escribir; hoy no
  hay ningún backend ni UI que lo consuma todavía.

### La representación interna NO está atada a PDF (verificado en la Etapa 6B)

El catálogo de 307 PDFs del cliente es la **primera fuente**, no la única prevista —
más adelante, clientes y el equipo van a poder subir íconos propios en `.svg`/`.png`.
Se verificó explícitamente (sin implementar nada de esto todavía) que el modelo actual
no cierra esa puerta:

- **`IconAsset`/`IconDefinition` (`svgPath` + `paintMode` + `fillRule` +
  `strokeWidth?`) no contienen ningún concepto propio de PDF** (nada de páginas,
  operadores de pintado, CropBox, etc.) — son puramente geometría + cómo pintarla,
  aplicable igual de bien a un `<path>` de SVG (que ya trae su propio `fill-rule`) o a
  la silueta que salga de vectorizar un PNG.
- **Toda la lógica específica de PDF vive exclusivamente en `scripts/icon-import/`**
  (herramienta de build offline, nunca importada desde `src/`) — el pipeline real es
  `PDF → pdfToPaths.ts (extracción) → composeIconGeometry.ts (composición) →
  normalizeIconPath.ts (normalización, YA agnóstica de la fuente) → IconAsset`. Una
  fuente SVG futura seguiría el mismo patrón con un extractor propio (parsear/sanear
  el `<path>` y leer su `fill-rule` real, sin `pdfjs-dist`) que entregue el mismo
  `{d, paintMode, fillRule, strokeWidth?}` a `normalizeIconPath` — sin tocarlo. Una
  fuente PNG futura necesitaría, antes que nada, un paso de vectorización/extracción
  de silueta (no implementado, ni decidido) que termine produciendo esa misma forma.
- **`normalizeIconPath.ts` ya es 100% agnóstico de la fuente** — nunca supo ni le
  importó si el `d` que recibe vino de un PDF, un SVG o (a futuro) una silueta
  vectorizada; solo opera sobre datos de trazo.
- **`getIconPaintProps` (`src/editor/icons/iconPaintProps.ts`) es la única función que
  decide props de render** (`fill`/`stroke`/`fillRule`/`strokeWidth`), y la usan por
  igual `iconElement.ts` (Fabric, en el navegador) y `renderIconCanvas.ts` (thumbnail,
  en Node) — el mismo mecanismo que ya evitó, en la Etapa 4, que el thumbnail y Fabric
  mostraran cosas distintas. Cualquier fuente futura (SVG, PNG vectorizado) que termine
  en un `IconAsset` correcto hereda esa garantía gratis, sin cambios acá.
- **Único punto que SÍ asume PDF hoy** (documentado, no un impedimento — una tarea
  futura esperable): `classifyIcon.ts` recibe un `PdfExtractionResult` con campos
  específicos del formato (`numPages`, `hasRasterImage`, `hasLiveText`, `paintGroups`
  con paint types de PDF). Una fuente SVG/PNG futura va a necesitar su propia función
  de clasificación/filtros (una `PdfExtractionResult` no tiene sentido para un SVG que
  no tiene "páginas"), reusando igual `composeIconGeometry`/`normalizeIconPath` donde
  aplique — no reusar `classifyIcon.ts` tal cual, escribir el equivalente para cada
  formato.

En síntesis: no hay ninguna decisión de esta etapa (ni de las anteriores) que ate el
catálogo a PDF — el único trabajo real pendiente para agregar SVG/PNG es escribir un
extractor/clasificador propio de cada formato, nunca tocar `IconAsset`, la
normalización, ni las props de render compartidas.

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
  cómo se gestionan/agregan nuevos) — el MODELO y el normalizador ya están resueltos
  (ver "Catálogo de íconos" más abajo); lo que sigue pendiente es la importación real
  de los ~370 PDFs del cliente, el selector con categorías/búsqueda, el upload de
  usuario y el administrador del equipo — todavía sin implementar.
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
