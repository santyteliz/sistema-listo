# TEAM-HANDOFF.md — Handoff a desarrollador visual/deployment

Este documento es para el desarrollador que va a integrar el personalizador con la
landing existente del cliente y desplegarlo en Hostinger. Léelo antes de tocar
cualquier archivo.

## A. Qué es el proyecto

**Personalizador web de virolas de mate para MateShop.** Una app de una sola página
(sin backend, sin base de datos, sin login) donde un usuario diseña libremente el
grabado de la virola de su mate: agrega texto curvo y hasta 16 íconos de un catálogo
propio (o sube su propia imagen), ajusta líneas circulares decorativas, y al final
exporta el diseño como SVG y PDF vectoriales listos para producción. El diseño se
guarda automáticamente en el navegador (`localStorage`) para no perderlo si se
refresca la página.

## B. Estado actual

El editor **ya está funcional y validado** — pasó varias etapas de desarrollo y una
auditoría de QA dedicada (regresión funcional completa, desktop y mobile, con
corrección de los bugs reales que aparecieron). Stack y funcionalidades confirmadas:

- **React 19 + TypeScript + Vite 8** — aplicación de una sola página, sin router (ver
  sección D).
- **Fabric.js 6.0.2** — motor gráfico del canvas.
- **Catálogo de íconos**: 233 íconos propios (`public/icons/manifest.json` +
  thumbnails), con categorías, búsqueda, e íconos "multilayer" (varias capas con
  agujeros reales).
- **Upload de imágenes propias**: el usuario sube un PNG/WebP y el editor lo
  vectoriza automáticamente (vía `vectortracer`, WASM) para poder grabarlo igual que
  cualquier ícono del catálogo.
- **Texto curvo**: hasta 4 textos por diseño, con tipografía, tamaño, inversión y
  auto-ajuste real al arco de la virola.
- **Gestos mobile**: selección por un toque, pellizco de dos dedos para escalar
  íconos y texto, rotación de dos dedos para íconos — con protección contra
  selección/deselección accidental durante el gesto.
- **Persistencia local**: el diseño se guarda solo en `localStorage` (sin backend) y
  se restaura al volver a abrir la página, sin generar un paso falso de Deshacer.
- **Undo/Redo**: historial completo de la sesión, agrupado por gestos (no una entrada
  por cada pixel de movimiento).
- **Reset** ("Empezar desde cero"), con confirmación y deshacible.
- **Líneas circulares** decorativas (No/Simple/Doble), que se recortan
  automáticamente alrededor de cada texto/ícono.
- **Exportación**: SVG y PDF vectoriales (94×94mm), más un botón de exportación
  combinada (ambos archivos, o ninguno si algo falla).
- **Responsive**: validado en 1024/1280/1440px de escritorio y 320/375/390/430px de
  mobile.

No existen actualmente: cuentas de usuario, backend, integración con Tienda Nube,
checkout, ni envío de emails — esas piezas las está construyendo el equipo de
producto en paralelo (ver `docs/PRODUCT.md`, `docs/TIENDANUBE.md`,
`docs/DECISIONS.md`) y **no son responsabilidad de este handoff**.

---

## FUNCIONALIDAD CONGELADA

> El personalizador ya pasó una etapa de desarrollo y QA. La funcionalidad existente
> debe considerarse congelada. Los cambios visuales no deben alterar el
> comportamiento del editor.

Áreas congeladas (ya probadas y aprobadas — no se tocan por motivos visuales):

- Fabric.js y toda su configuración (locks de interacción, clipping, controles).
- Selección de elementos (click en desktop, toque único en mobile).
- Movimiento, resize y rotación de texto e íconos.
- Pellizco (pinch) de dos dedos para escalar íconos y texto.
- Rotación de dos dedos para íconos.
- Protección contra selección accidental durante gestos multitáctiles.
- Interacción mobile y desktop en general (scroll, `touch-action`, pointer capture).
- Toolbar contextual (aparición, posicionamiento, qué botones muestra cada tipo de
  elemento).
- Texto curvo: curvatura, inversión, auto-ajuste de tamaño (`fitFontSizeToArc`).
- Fuentes disponibles y su carga.
- Límites de elementos (20 totales, 4 textos, 16 íconos) y sus mensajes.
- Colisión/separación entre textos.
- Posiciones iniciales de íconos alrededor del anillo.
- Catálogo de íconos, íconos multilayer, íconos subidos por el usuario.
- Vectorización de imágenes subidas.
- Geometría de la virola (radios, banda, clipping).
- Líneas circulares (posición, grosor, recorte alrededor de elementos).
- Undo/Redo.
- Reset.
- Serialización y restauración del diseño (`serializeDesign`/`restoreDesign`).
- Persistencia local (`localStorage`).
- Exportación SVG, PDF y combinada.

**Regla práctica**: si un cambio se puede describir como *"cambia cómo se ve"*, está
permitido. Si se puede describir como *"cambia qué hace"*, no está permitido —
detenete y consultá (ver sección "Qué hacer si no estás seguro" más abajo).

---

## C. Archivos y carpetas protegidos (NO MODIFICAR)

Basado en la estructura real del repositorio (`src/editor/`, verificada directamente,
no inventada). Es lógica del editor — TypeScript/TSX, nunca el CSS que vive al lado:

```text
NO MODIFICAR (lógica — .ts/.tsx):

src/editor/canvas/          → Fabric.js, geometría, clipping, texto curvo, íconos,
                               gestos táctiles, colisiones, límites, contención.
                               Incluye: actions.ts, useFabricCanvas.ts, curvedText.ts,
                               iconElement.ts, containment.ts, circularLines.ts,
                               textCollision.ts, designLimits.ts, guides.ts,
                               ringAngle.ts, designColors.ts, visibilityMask.ts,
                               touchGestures.ts, useTouchGestures.ts, y todos los
                               *.test.ts de esta carpeta.

src/editor/icons/           → catálogo, búsqueda, subida de imágenes, vectorización,
                               normalización de paths SVG.
                               Incluye: iconLibrary.ts, iconCatalog.ts,
                               loadIconManifest.ts, normalizeIconPath.ts,
                               svgIconExtractor.ts, svgColorGrouping.ts,
                               svgTransform.ts, rasterIconExtractor.ts,
                               uploadIconFlow.ts, uploadIconValidation.ts,
                               uploadRasterValidation.ts, iconSearch.ts,
                               iconPaintProps.ts, useIconCatalog.ts,
                               IconGeometryPreview.tsx, y sus *.test.ts.

src/editor/history/         → useDesignHistory.ts (Undo/Redo).

src/editor/persistence/     → designPersistence.ts (localStorage).

src/editor/export/          → toda la exportación SVG/PDF/combinada.
                               Incluye: designExporter.ts, designPdfExporter.ts,
                               designCombinedExporter.ts, svgDocument.ts,
                               pdfDocument.ts, exportPathGeometry.ts,
                               iconExportGeometry.ts, textExportGeometry.ts,
                               textOutlineExport.ts, pdfPathAdapter.ts,
                               circularLineExportGeometry.ts, downloadFile.ts,
                               y sus *.test.ts.

src/editor/state/           → EditorContext.tsx, selection.ts (estado del editor).

src/editor/fonts/           → fontLibrary.ts (qué fuentes existen y cómo se cargan
                               para el motor gráfico — no es solo presentación).

src/editor/panels/*.tsx     → la LÓGICA de cada panel (handlers, gestos, qué
                               acciones invoca). Sus archivos .css HERMANOS sí son
                               editables — ver la sección de CSS más abajo.

src/components/layout/*.tsx → misma distinción: lógica del layout congelada, el
                               .css hermano es editable.

src/config/virola.config.ts → medidas y geometría real de la virola.

scripts/icon-import/        → pipeline offline (PDF → catálogo de íconos). Nunca se
                               importa desde src/, pero es lo que generó
                               public/icons/ — tocarlo puede corromper el catálogo
                               en la próxima regeneración.

public/icons/                → el catálogo YA generado (manifest.json + thumbnails).
                               Son datos, no código, pero definen qué íconos existen
                               y con qué geometría — no reemplazar/editar a mano.
```

### Advertencia especial: dos archivos `.css` con reglas FUNCIONALES

La regla general es "el `.css` siempre es visual, libre de editar" — con **dos
excepciones reales** en este proyecto, donde el CSS no es solo estética:

- **`src/editor/panels/ContextualToolbar.css`**: las reglas `touch-action: none` (en
  `.contextual-toolbar__btn--gesture`) y `pointer-events: none` (en
  `.contextual-toolbar--gesture-active .contextual-toolbar__btn`) son necesarias para
  que los gestos de arrastre/pellizco funcionen sin interferencia del navegador. Se
  puede cambiar color, tamaño, sombra, transición de este archivo — **nunca esas dos
  propiedades puntuales**.
- **`src/editor/canvas/MateCanvas.css`** y **`src/pages/EditorPage.css`**: el tamaño
  real del `<canvas>` en pantalla lo mide en tiempo de ejecución
  `useFabricCanvas.ts` (`applyResponsiveScale`, lee el ancho disponible del
  contenedor). Cambiar `padding`/`width`/`max-width` acá SÍ está permitido (es
  responsive visual), pero **hay que volver a probar el editor en mobile después**,
  porque cambia cuánto espacio real tiene el canvas para calcular su propio zoom.

Fuera de esos dos casos puntuales, cualquier `.css` del proyecto (incluido
`src/index.css`, los tokens de marca) es visual y editable libremente.

---

## D. Qué SÍ puede modificar el otro desarrollador

### Permitido

- CSS: colores, tipografía, espaciado, tamaños visuales, bordes, sombras,
  backgrounds, animaciones/transiciones visuales, estados hover/focus, responsive
  puramente visual, layout visual.
- La landing/página de inicio (vive fuera de este repo — ver
  `docs/DEPLOYMENT-HANDOFF.md`) y su integración visual con el personalizador.
- Contenido visual, assets visuales (imágenes, logo, favicon).
- Metadata SEO (`<title>`, `<meta>` en `index.html`) si no cambia el `#root`/el
  `<script>` que monta React.
- Configuración necesaria **exclusivamente** para deployment/hosting (ver sección
  "Regla especial: `.tsx`/config de deployment" abajo).

### NO permitido

- Lógica del editor, sus eventos y handlers (`onPointerDown`, `onPointerMove`,
  `onTouchStart`, `onTouchMove`, y en general cualquier función que empiece con
  `set...`/`get...`/`apply...` dentro de `src/editor/`).
- Gestos (mouse o touch), Fabric.js, el `<canvas>` en sí.
- Selección, resize, rotate, pinch.
- Persistencia, historial (Undo/Redo), exportación.
- Límites, geometría, catálogo, vectorización, serialización, restauración.
- Comportamiento mobile o desktop del editor.

### Ejemplos concretos (con funciones/propiedades reales de este proyecto)

**Permitido cambiar** (CSS — cualquier archivo `.css` del proyecto, salvo las dos
excepciones puntuales de la sección C):

```css
border-radius
padding / margin
font-size / font-weight
background
box-shadow
transition / animation
```

**NO permitido cambiar** (TypeScript, dentro de `src/editor/`):

```ts
onPointerDown / onPointerMove / onTouchStart / onTouchMove
setSelectedIconScale / setSelectedTextFontSize / setSelectedIconAngle
restoreDesign / serializeDesign
getDefaultIconAngle
fitFontSizeToArc
```

---

## Regla especial para mobile

**El comportamiento mobile está congelado.** No modificar:

- Selección por toque, deselección.
- Pellizco (pinch) de íconos y de texto.
- Rotación de íconos.
- Protección contra selección/deselección accidental durante multitouch.
- Scroll de la página, `touch-action`, `pointer capture`.
- Qué botones muestra la toolbar en mobile (ya está decidido: en mobile se ocultan
  los controles de tamaño/rotación de un dedo porque el gesto de dos dedos los
  reemplaza).

Un cambio visual **nunca** debe modificar la interacción táctil. Si una modificación
visual aparentemente requiere tocar lógica mobile: **no la hagas.** Documentá el
conflicto (en un comentario, un issue, o consultando directamente) en vez de forzar
el cambio.

## Regla especial para desktop

También está congelado: selección, movimiento, resize, rotación, toolbar, edición de
texto, tamaño de texto, undo/redo, reset. Los cambios visuales pueden modificar
**cómo se ve** un control (color, forma, ícono, tamaño del botón), pero nunca **qué
hace** ese control ni cuándo aparece/desaparece.

## Regla especial para archivos `.tsx` de landing/integración

No todos los `.tsx` están prohibidos — el desarrollador probablemente necesite crear
o modificar componentes de la landing/integración visual, que hoy no existen en este
repo (ver `docs/DEPLOYMENT-HANDOFF.md`). La regla:

- `.tsx` dentro de `src/editor/` → **congelado**, no tocar.
- `.tsx` de landing/layout/integración nueva → permitido, **siempre que no altere el
  funcionamiento del editor** (por ejemplo: no importar ni llamar funciones de
  `src/editor/` fuera de cómo ya se usan hoy, no envolver `<EditorPage />` en lógica
  nueva que cambie cuándo/cómo se monta).

Si no podés determinar con certeza si un archivo afecta el funcionamiento del editor:
**detenete y preguntá antes de modificarlo.**

## Validación obligatoria después de cambios visuales

Antes de dar por terminado cualquier cambio, ejecutar:

```bash
npx tsc -b
npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx")
npm run build
npm run lint
```

Y hacer un smoke test manual del editor:

**Desktop**: seleccionar un elemento, moverlo, agregar texto, agregar ícono, undo,
redo, reset, exportar.

**Mobile** (real o emulado): seleccionar por toque, scroll de la página, pellizco
sobre texto, pellizco sobre ícono, rotación de ícono, que la toolbar contextual
aparezca correctamente.

**Si cualquiera de estas pruebas falla después de un cambio visual: revertí ese
cambio antes de continuar.** Un cambio puramente visual nunca debería romper ninguna
de estas pruebas — si lo hizo, algo tocó más de lo que debía.

## Qué hacer si no estás seguro

Parar y preguntar. Es preferible perder cinco minutos confirmando que un cambio es
seguro que reabrir una regresión que ya se encontró y arregló en la etapa de QA
anterior (ver `docs/DECISIONS.md`/el historial de auditorías si necesitás contexto de
por qué algo se hizo de una forma específica — hay comentarios extensos en el propio
código explicando el motivo de cada decisión no obvia).
