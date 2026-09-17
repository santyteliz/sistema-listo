# Especificaciones visuales — Zizou (a partir del video)

Convención de este documento: cada punto se marca como **Dato observado** (medible o directamente visible en un frame concreto, con su número de frame) o **Interpretación/hipótesis** (lo que probablemente significa, sin poder confirmarlo con certeza). Nunca se presenta lo segundo como si fuera lo primero.

Metodología de medición: sin Python/PIL/ImageMagick disponibles, las medidas en píxeles se obtuvieron con `ffmpeg` (recortes + `od`/lectura de bytes RGB crudos de tiras de 1-2px de alto/ancho) sobre el frame 003 (1366×688, canvas del diseño aproximadamente en x:600-1220). Es un método artesanal, fila por fila/columna por columna — arrastra un margen de error estimado de ±10-15px por cada borde leído a mano, así que todas las razones (radio línea / Ø72, separación / ancho de banda) se dan como **rango aproximado**, nunca como valor exacto.

## Geometría de la virola

**Dato observado** (frame 003, medición por corte de fila/columna):
- Centro del canvas ≈ (925, 383) px (frame 1366×688).
- Radio del círculo marrón (equivalente a nuestro Ø72) ≈ 200-210px.
- Con la proporción real 94:72 (que no depende de la medición en px, es un dato de producto ya confirmado), el radio equivalente a Ø94 se ESTIMA en ≈ 260-270px — no se midió directamente el borde exterior con la misma precisión (el borde blanco se difumina gradualmente hacia el gris de fondo, sin un corte nítido como el del círculo marrón).
- Hay una guía punteada gris (analog a nuestras guías) que corre muy pegada al borde exterior del área blanca — visualmente coincide, o está muy cerca, de lo que interpretamos como Ø94 real (ver frame 004).

**Interpretación**: la relación Ø94/Ø72 en sí (94:72) es un dato de producto ya confirmado por el cliente, no algo que dependa de esta medición — este video no la contradice ni la confirma con más precisión de la que ya teníamos.

## Líneas circulares

### Posición (Doble)

**Dato observado** (frame 004, zoom): el par de líneas verde oliva está claramente ubicado en el tercio EXTERIOR de la banda blanca, muy cerca de la guía punteada exterior — NO centrado en la banda. Entre el par de líneas y el círculo marrón (Ø72) queda un espacio en blanco notablemente más grande que el que separa a las dos líneas entre sí.

**Interpretación/estimación**: convertido a radio, esto ubicaría el par de líneas en algo del orden de 90-95% del camino entre Ø72 y Ø94 (es decir, muy cerca de Ø94), no al 50% (radio medio, 41.5mm) como asume nuestra implementación actual. Esta es la corrección más importante de este análisis — ver "Cambios recomendados" más abajo.

**Esto CONTRADICE directamente nuestra implementación actual**, que centra tanto la línea Simple como el par Doble en el radio medio de la banda (41.5mm, `circularLineRadius` en virola.config.ts).

### Separación (Doble)

**Dato observado** (medición por corte de fila, ambos lados del anillo, frame 003): separación entre las dos líneas ≈ 14-15px de una lectura, en un canvas donde el ancho de banda (Ø94-Ø72) se estima en ≈ 55-65px.

**Interpretación/estimación**: como fracción del ancho de banda, esto da aproximadamente 20-25% — coincide, dentro del margen de error de esta medición artesanal, con el 20% que ya habíamos implementado (`circularLineDoubleOffset = bandWidth * 0.10` por línea, 20% total). Este número puntual parece razonable de mantener, aunque la CONFIANZA en él es baja (una sola medición manual, sin repetir en más frames/ángulos).

### Grosor

**Dato observado**: la línea se ve fina — del orden de 1-2px en el frame nativo (1366px de ancho), notablemente más fina que el trazo de los íconos (que se ve claramente más grueso, ver frame 001/008). No se hizo una medición numérica de grosor (no aporta suficiente precisión adicional al método usado).

**Interpretación**: nuestro `CIRCULAR_LINE_STROKE_WIDTH = 2` (px, en un canvas de 640px) parece del orden correcto — proporción similar (trazo fino, mucho menor al de los íconos).

### Relación Simple/Doble

**No observado**: el video nunca muestra "Simple" activo, así que no se puede confirmar si el radio de la línea Simple coincide con el radio MEDIO del par Doble, o con uno de los dos radios individuales del par, o con otra posición. Nuestra implementación actual asume que Simple = el mismo radio medio que el centro del par Doble — esto queda como HIPÓTESIS no confirmada ni contradicha (sin evidencia en ningún sentido).

### Interrupción de la línea

**Dato observado** (frames 001, 003, 004, 006, 008, 009, 011): la línea se corta limpiamente antes de tocar cualquier texto o ícono, dejando un hueco a cada lado del elemento — nunca pasa por encima ni por debajo (no hay evidencia de z-index, la línea directamente no está dibujada en esa zona angular). Con más de un elemento, cada uno genera su propio hueco independiente (frame 001, dos íconos con dos huecos separados).

**Interpretación**: esto confirma cualitativamente el ENFOQUE de nuestra implementación (recorte geométrico angular, no z-index) — coincide en concepto. No se pudo medir con precisión el margen entre el borde del elemento y el punto exacto donde la línea se corta (el corte se ve "ajustado" al elemento, sin un espacio extra visualmente obvio, pero esto es una impresión visual, no una medición).

## Espaciados

**Dato observado**: en los frames con 2-3 elementos (001, 008, 009) los elementos guardan una separación angular amplia entre sí (aproximadamente equidistantes cuando son 2-3), sin ningún indicio de que se acerquen entre ellos en los frames disponibles.

**No observado**: ningún frame muestra dos elementos deliberadamente acercados entre sí, así que no hay evidencia de cómo Zizou resuelve ese caso (si lo resuelve).

## Toolbar

**Dato observado** (frames 001, 005, 008): aparece flotando fuera del anillo, cerca del elemento seleccionado, con 2 botones para texto (eliminar, agrandar) y 3 para íconos (eliminar, agrandar, rotar) — cada botón es un círculo de color sólido con un ícono de línea blanca/oscura adentro (rojo=eliminar, verde=agrandar, azul=rotar). Se ve además un cuadro o círculo de referencia punteado azul alrededor del elemento activo (frame 008) que no tiene un equivalente visual en nuestro `ContextualToolbar` (nuestro menú es una sola píldora con 3-5 botones agrupados, no botones sueltos alrededor del elemento).

**Interpretación**: la posición de cada botón cambia según en qué parte del anillo está el elemento (coherente con "relativo al elemento", igual que el nuestro), pero la DISPOSICIÓN visual es distinta — botones sueltos alrededor del elemento vs. una píldora agrupada. Esto es una diferencia de diseño, no necesariamente un error nuestro — no hay evidencia de que uno sea "más correcto" que el otro.

## Sidebar

**Dato observado** (frames 001, 003, 006, 007): estructura de arriba a abajo — Editar texto → Ícono → **Líneas circulares** (No/Simple/Doble) → Vectorizar Imagen → botón de confirmación. Coincide con dónde ubicamos nuestro propio panel de líneas circulares.

**Interpretación**: la jerarquía (líneas circulares como una sección más, al mismo nivel que texto/ícono/imagen, siempre visible sin depender de la selección) confirma la decisión que ya habíamos tomado de mostrar `CircularLinesPanel` de forma permanente en la barra lateral.

## Cambios recomendados

(Documentados para revisión — **no implementados en esta tarea**, según lo pedido.)

1. **Reposicionar la línea Simple/Doble hacia el tercio exterior de la banda (cerca de Ø94), en vez de centrarla en el radio medio (41.5mm).** Es el hallazgo más importante de este análisis y contradice directamente nuestra implementación actual (`circularLineRadius = innerRadius + bandWidth * 0.5`). Confianza: media-alta (patrón visual claro y repetido en varios frames), pero sin medición de precisión de laboratorio.
2. **La separación Doble actual (20% del ancho de banda) parece razonable de mantener** — coincide, dentro del margen de error de esta medición, con lo observado. Confianza: baja (una sola medición manual).
3. **Sin evidencia suficiente para determinar** el radio exacto de "Simple" en relación al par "Doble" — no cambiar nada acá sin más evidencia (ej. conseguir un frame o video adicional donde se vea "Simple" activo).
4. Ninguna de estas decisiones se tomó todavía en el código — quedan planteadas para que las confirmes antes de tocar `virola.config.ts`/`circularLines.ts`.
