# Auditoría Editor vs Zizou

Fuente de verdad: `referencias/zizou/analisis/` (README, FRAME-INDEX, INTERACTION-MAP, VISUAL-SPECS, frames/, contact-sheet.png). No se reprocesó el video original — todo lo de este documento sale de ese material ya digerido. Donde el material no alcanza para responder algo, se dice explícitamente "sin evidencia" en vez de inventar.

Marco de decisión usado en cada punto (pedido en la tarea): ¿Zizou realmente lo hace? ¿Es importante para la experiencia? ¿Nuestro producto necesita lo mismo? ¿Nuestra implementación ya es mejor? ¿Copiarlo introduce problemas? ¿Afecta producción? ¿Afecta la simplicidad del MVP? — la conclusión de cada ítem es siempre una de: **COPIAR / MEJORAR / MANTENER / NO APLICA**.

## Resumen ejecutivo

- El hallazgo más importante de todo el análisis (posición de las líneas circulares) **ya se corrigió** en esta misma iteración — ver `virola.config.ts`, `circularLineRadius` ahora en 0.82 del ancho de banda en vez de 0.5 (radio medio).
- La mayoría de las diferencias encontradas son de **filosofía de diseño** (toolbar agrupado vs. botones sueltos, sidebar colapsable vs. estructura fija), no de correctness — se recomienda **MANTENER** nuestro enfoque en casi todos los casos, porque fueron decisiones tomadas con razones de UX ya documentadas, no accidentes.
- Nuestro sistema de **geometría/contención** (bisección exacta para bounding boxes rotados, márgenes de manipulación, libertad radial dependiente del tamaño del texto) es más sofisticado que lo que se puede siquiera verificar en Zizou desde afuera — no hay ninguna recomendación de simplificarlo.
- El video **no aporta evidencia** sobre: la línea "Simple" activa, ningún gesto de arrastre/resize/rotación EN CURSO (solo estados de reposo), ni el comportamiento responsive/mobile — estas áreas quedan "sin evidencia", no "confirmadas".
- Se encontraron 2 problemas reales y acotados de código (no de UX): una duplicación de código evitable (`getIconHalfExtents` en `ContextualToolbar.tsx` ya podría reusar la versión exportada de `containment.ts`) y un patrón frágil ya solucionado (el guard `isCircularLineObject` contra recursión infinita) que conviene documentar para el futuro.
- **Nada de la auditoría (sección 2 en adelante) se implementó en esta iteración** — solo la corrección de líneas (Parte 1). Todo lo demás queda priorizado P0-P3 para decidir después.

---

## 1. Toolbar

| Aspecto | Nuestro editor | Zizou | Recomendación | Prioridad |
|---|---|---|---|---|
| Cantidad de botones | Texto: 4 (Editar, Tamaño, Invertir, Eliminar). Ícono: 5 (Tamaño, Rotar, Espejar H, Espejar V, Eliminar). | Texto: 2 (Eliminar, Agrandar — frame 005). Ícono: 3 (Eliminar, Agrandar, Rotar — frame 008). "Invertir"/"Espejar" viven en el sidebar, no en el toolbar. | Nuestro toolbar hace más cosas de una — no está mal, pero vale revisar si "Invertir" (texto) y "Espejar V" (ícono) ganan algo estando en el menú rápido en vez de en el panel. | MANTENER (revisar como P2) |
| Orden | Editar → Tamaño → Invertir → Eliminar | Agrandar → Eliminar (texto); Agrandar → Rotar → Eliminar (ícono, orden exacto no 100% claro en frame 008) | Sin diferencia crítica. | MANTENER |
| Íconos (visual) | Trazo monocromático (currentColor) sobre fondo blanco/transparente; solo Eliminar en rojo. | Círculo de color SÓLIDO por botón (rojo/verde/azul) con ícono blanco adentro. | Es una diferencia de identidad de marca, no de funcionalidad — los colores saturados de Zizou no encajan con nuestra paleta offwhite/oliva. | NO APLICA (no copiar la paleta) |
| Tamaño | 40×40px (mínimo de accesibilidad ya decidido en una iteración anterior). | Orden de magnitud similar a simple vista, sin medición confiable (frame 1366px de ancho, no comparable 1:1 con nuestro canvas de 640px). | Sin evidencia suficiente para cambiar nada. | MANTENER |
| Separación | Botones agrupados en una píldora, gap de 2px. | Botones SUELTOS, separados por espacio real alrededor del elemento — no son comparables 1:1 (arquitecturas distintas). | — | NO APLICA |
| Forma | Una píldora redondeada con todos los botones adentro. | Círculos individuales dispersos alrededor del elemento, con un cuadro/círculo punteado de referencia (frame 008) que nosotros no tenemos. | La píldora tapa menos área del diseño — preferible para un mate donde el espacio de la banda es chico. El cuadro punteado de Zizou podría ser un lindo indicador visual adicional, pero es cosmético. | MANTENER (el punteado de referencia: MEJORA opcional, P3) |
| Aparición | Selección por click único (ya migrado desde doble-click, con justificación de UX documentada en el código). | No determinable con certeza — ningún frame captura el momento exacto de selección inicial. | Sin evidencia para cambiar. | MANTENER |
| Desaparición | Al deseleccionar o click afuera del canvas/menú (con excepciones para el editor de texto). | No determinable. | — | MANTENER |
| Posición respecto del elemento | Algoritmo de 8 direcciones con fallback de ajuste a viewport, anclado a un punto geométrico del elemento. | Confirmado relativo al elemento (los botones cambian de posición según dónde está en el anillo — frames 001 vs 008), pero sin el detalle de un algoritmo de 8 direcciones ni fallback observable. | Nuestro sistema es más robusto de lo que se puede verificar en Zizou. | MANTENER |
| Comportamiento al mover el elemento | El toolbar sigue al elemento en vivo, recalculado cada frame. | Sin evidencia (no hay frames de arrastre en curso). | — | MANTENER |
| Comportamiento cerca de bordes | Clamping a los límites del viewport. | Sin evidencia. | — | MANTENER |
| Interacción con texto | 4 botones incluyendo Invertir. | 2 botones, Invertir vive en el sidebar. | Ver "Cantidad de botones" arriba. | MEJORA a evaluar (P2) |
| Interacción con íconos | 5 botones incluyendo Espejar H/V. | 3 botones, Espejar vive en el sidebar (y parece ser un solo botón "Espejar", no separado en horizontal/vertical — frame 007). | Revisar si "Espejar vertical" se usa poco en la práctica (nuestra librería de íconos, `iconLibrary.ts`, tiene 6 íconos — la mayoría simétricos verticalmente, por lo que "Espejar V" podría aportar poco). | MEJORA a evaluar (P3) |
| Resize | Gesto de distancia euclídea al elemento (acercarse achica, alejarse agranda, cualquier dirección) — ya probado y aprobado esta misma sesión. | Existe un botón de "agrandar" (verde, flechas diagonales) — sin evidencia de la mecánica del gesto en sí (no hay frames de arrastre en curso). | Sin base para comparar el GESTO — solo la existencia del control, que coincide. | MANTENER (sin cambios) |
| Rotación | Gesto de arrastre circular alrededor de un pivote, solo para íconos. | Botón de rotar (azul) solo para íconos — coincide en que el texto no rota libremente en ninguno de los dos sistemas. Sin evidencia de la mecánica del gesto. | — | MANTENER |
| Eliminar | Botón rojo con ícono de tacho, siempre presente. | Igual — rojo, tacho, siempre presente. | Coincide. | MANTENER |
| Edición | Requiere click en "Editar" para revelar el campo de texto en el sidebar (decisión deliberada para no abrir el editor con solo seleccionar). | El campo de texto está SIEMPRE visible en el sidebar bajo "Editar texto", sin botón extra — editás apenas seleccionás. | Nuestra fricción extra tiene una razón documentada (evitar que un simple click interfiera con arrastrar el texto) — Zizou demuestra que es posible sin ese paso, pero no sabemos si Zizou tiene el mismo problema que motivó nuestra decisión. | MEJORA a evaluar (P2) — no cambiar sin re-confirmar que el problema original ya no aplica |

## 2. Sidebar

**Estructura**: Zizou mantiene los headers "Editar texto" / "Ícono" siempre visibles (con un placeholder tipo "Seleccioná un texto/ícono para modificarlo" cuando no aplica — frame 006); nuestro Sidebar en cambio OCULTA por completo la sección entera y muestra un único placeholder genérico ("Seleccioná un elemento del canvas para editarlo").

- **Evidencia**: frames 001, 003, 006, 007 (Zizou); `Sidebar.tsx` actual (nuestro).
- **Análisis de producto**: mantener los headers fijos da una sensación de estructura más estable (nada aparece/desaparece de golpe, solo el contenido interior cambia) — podría sentirse más "profesional". Es una mejora de pulido, no una corrección de un error.
- **Recomendación**: MEJORA (P2) — considerar mostrar "Editar texto" e "Ícono" como secciones siempre presentes con su propio placeholder, en vez de una sola sección condicional. Bajo riesgo, cambio acotado a `Sidebar.tsx`.

**Líneas circulares**: coincide exactamente en ubicación (después de "Ícono", antes de la sección de imagen) — confirmado en frames 001/003/006/007. **MANTENER**, sin cambios.

**Selector de íconos**: Zizou usa dos niveles (categorías → grilla, frames 007/008); nuestro es una grilla plana única. Con 6 íconos en `iconLibrary.ts` un selector de categorías sería sobre-ingeniería hoy. **MEJORA FUTURA (P2)** — revisar solo si el catálogo de íconos crece significativamente (ej. >20-25 íconos).

**Selector de texto / tipografías**: **coincidencia exacta** — nuestras 5 tipografías (`fontLibrary.ts`: Lato, Playfair Display, Poppins, Merriweather, Dancing Script) son las MISMAS 5 que aparecen en el dropdown de Zizou (frame 005), en el mismo orden. Ya está alineado. **MANTENER**, no es una diferencia.

**"Vectorizar Imagen"**: feature de Zizou (subir PNG/WebP para vectorizar) que no existe en nuestro editor — requeriría un pipeline de vectorización de imágenes, claramente fuera del alcance actual del MVP (ver docs/ARCHITECTURE.md). **NO APLICA** — no es una omisión, es una feature de otra escala de producto.

**Botón "Continuar a confirmación" / flujo de checkout**: Zizou integra Plantillas → Diseño → Confirmar en la misma app; nuestro proyecto separa esto deliberadamente (docs/PRODUCT.md ya define el flujo de compra vía Tienda Nube en otra capa). **NO APLICA** a este audit de UI del editor — es una decisión de arquitectura ya tomada en otro documento, no algo que este audit deba re-litigar.

**Controles redundantes/faltantes en nuestra sidebar**: no se encontró ningún control nuestro que sea claramente redundante. Lo único "faltante" respecto de Zizou (Vectorizar Imagen, Plantillas, Confirmar) corresponde a features de otra etapa del roadmap, no a huecos de esta capa.

**Responsive**: el video es 100% desktop (1366×688, browser de escritorio) — no aporta ninguna evidencia sobre mobile. Coincide con nuestra propia restricción actual ("no mobile work"). **NO APLICA**.

## 3. Texto

| Aspecto | Evidencia Zizou | Nuestro editor | Conclusión |
|---|---|---|---|
| Agregar | Campo de texto libre en el sidebar (frame 005) | Botón "Agregar texto", nace centrado arriba (0°) | Coincide en concepto |
| Posición inicial | Texto nuevo aparece arriba del anillo (frames 001, 011) | `curveOffset` inicial = 0° (arriba) | **Coincide exactamente** |
| Movimiento | Sin evidencia de arrastre en curso | Angular + radial (dependiente del tamaño), ya probado y aprobado | MANTENER — no tocar, sin evidencia que lo contradiga |
| Radio / curvatura | El texto se curva tangencialmente al anillo en casi todos los frames, EXCEPTO el frame 009 donde "INDIO" aparece en orientación RADIAL (vertical) | Nuestro texto siempre tangencial, con libertad radial de posición (no de orientación) | Ver más abajo — posible feature de Zizou que no tenemos |
| Tamaño | Sin evidencia de gesto de resize de texto en curso | Gesto de distancia + fórmula exponencial normalizada, ya probado | MANTENER |
| Límites (máx. caracteres, auto-fit) | No observable en los frames disponibles | 161 caracteres, auto-fit real por ancho medido (`calcTextWidth`) | Sin comparación posible |
| Inversión | Botón "Invertir texto" presente (frame 001, 005), efecto no observado (sin frame antes/después) | `curveInverted`, cambia el lado de lectura de la curva | Función existe en ambos, efecto visual no verificable en Zizou |
| Orientación (tangencial vs. radial) | Frame 009 muestra un texto ("INDIO") en orientación RADIAL, no tangencial | Nuestro sistema SOLO permite orientación tangencial | **Posible feature de Zizou que no tenemos** — ver abajo |
| Edición | Directo en el sidebar, siempre visible | Requiere click en "Editar" primero | Ver sección Toolbar/Edición arriba |
| Eliminación | Botón eliminar en el toolbar | Botón eliminar en el toolbar | Coincide |
| Relación con líneas | El texto interrumpe la línea igual que un ícono (frames 003, 004, 009) | Igual — `getTextExclusionZone` en `circularLines.ts` | **Coincide, ya confirmado en la implementación actual** |

**Sobre la orientación radial ("INDIO" en frame 009)**: no hay evidencia de que sea un control explícito (no hay un botón visible tipo "orientación" en los frames revisados) — podría ser el resultado de rotar el texto con algún control que no identificamos, o una función que Zizou tiene y nosotros no. Análisis de producto: nuestro sistema deliberadamente NO permite rotación libre del texto (fue una decisión explícita y repetida en varias iteraciones, para evitar romper la curvatura/legibilidad). Copiar esto introduciría exactamente el problema que ya evitamos a propósito. **NO APLICA / MANTENER nuestra restricción** — si en el futuro se quiere una orientación radial como opción EXPLÍCITA y controlada (no rotación libre), sería una feature nueva a diseñar desde cero, no una corrección.

## 4. Iconos

| Aspecto | Evidencia Zizou | Nuestro editor | Conclusión |
|---|---|---|---|
| Agregar | Modal en 2 niveles (categorías → grilla, frames 007/008) | Modal de grilla plana única | MEJORA FUTURA (P2), solo si crece el catálogo |
| Posición inicial | Íconos nacen distribuidos alrededor del anillo (izquierda/derecha en varios frames) | Ángulos iniciales 180°/90°/270°, evitando superposición | Coincide en concepto |
| Categorías | Romántico, Música, Random, Iconos del Usuario, Deportes, Naturaleza, River, Astros, Animal, Fútbol Arg (frame 007) | Sin categorías (6 íconos: Corazón, Estrella, Infinito, Hoja, Mate, Sol) | Zizou tiene un catálogo mucho más grande — no comparable en escala hoy |
| Selección | Click en la grilla | Click en la grilla | Coincide |
| Tamaño / resize | Botón "agrandar" en el toolbar, sin evidencia del gesto en curso | Gesto de distancia + reposicionamiento automático al crecer cerca de un borde (recién corregido en una iteración anterior) | MANTENER — nuestro sistema de reposicionamiento es más sofisticado de lo verificable en Zizou |
| Rotación | Botón "rotar" en el toolbar, sin evidencia del gesto en curso | Gesto de arrastre circular, con achicado automático si la rotación ya no entra en la banda | MANTENER |
| Movimiento | Sin evidencia de arrastre en curso | Arrastre libre dentro de la banda (+ margen de manipulación) | MANTENER |
| Límites / Ø72 / Ø94 | No se observó ningún ícono llevado deliberadamente a un límite | Contención geométrica exacta por bisección, con margen de manipulación (`ICON_MARGIN_PX`) y recorte visual en anillo Ø72-Ø94 | Sin evidencia para comparar — nuestro sistema es intencionalmente muy robusto |
| Relación con líneas | Cada ícono interrumpe la línea en su propia posición (frames 001, 003, 006, 008, 009, 011) | Igual — `getIconExclusionZone` | **Coincide, ya confirmado** |

## 5. Límites (cantidad máxima)

- **Nuestro**: `MAX_DESIGN_ELEMENTS=4`, `MAX_TEXT_ELEMENTS=1`, `MAX_ICON_ELEMENTS=3` (`designLimits.ts`).
- **Evidencia Zizou**: los nombres de las plantillas observadas en "Plantillas" son literalmente **"Texto + 1 Icono"**, **"Texto + 2 Iconos"**, **"Texto + 3 Iconos"** (frame 011 de esta carpeta, y `referencias/zizou/02-pantallainicialplantilla1.png`/`03-...`/`04-...` — las capturas estáticas de la tarea anterior, distintas del numerado `analisis/frames/001-011`) — es decir, Zizou también topea a **1 texto + hasta 3 íconos = 4 elementos totales**, exactamente nuestros números.
- **Conclusión**: **MANTENER, coincidencia ya confirmada** — no es una recomendación, es una validación de que el límite de producto que ya elegimos coincide con el de la referencia. No cambiar nada acá.

## 6. Geometría y contención

Ø72/Ø94/radio central, banda de diseño, libertad radial/angular, escalas mín/máx, comportamiento en bordes, clipping, zonas de exclusión — todo esto está implementado con matemática exacta (bisección para bounding boxes rotados en `containment.ts`, intersección de círculos para las zonas de exclusión en `circularLines.ts`, rango radial dependiente del tamaño de fuente en `curvedText.ts`) y verificado extensamente con Playwright en iteraciones anteriores (íconos rotados, grandes, pequeños, cerca de ambos bordes; texto grande/chico/desplazado).

**No hay forma de auditar esto en profundidad contra Zizou** — el video solo muestra el resultado visual final (que no viola el margen), nunca los casos límite ni la lógica interna. Lo único que se puede decir con la evidencia disponible es que **el resultado visual de Zizou es consistente con un sistema de contención que tampoco dejaría atravesar los límites** — no hay ninguna señal de que necesitemos simplificar o cambiar nuestro enfoque.

**Conclusión: MANTENER completo, sin cambios.** Siguiendo la prioridad pedida (1. comportamiento correcto, 2. producción segura, 3. UX natural, 4. similitud con la referencia), nuestro sistema ya cumple las primeras dos con una rigurosidad que Zizou no necesariamente iguala (no podemos saberlo, y no importa: no vamos a bajar nuestro estándar para parecernos más).

## 7. Líneas circulares

- **No / Simple / Doble**: control idéntico en ubicación y comportamiento de exclusión geométrica (ya corregido en la Parte 1 de esta misma tarea).
- **Posición**: corregida esta iteración de radio medio (50% del ancho de banda) a 82% (tercio exterior) — ver Parte 1 del informe.
- **Separación (Doble)**: se mantuvo sin cambios (20% del ancho de banda) — la evidencia de video, aunque de baja confianza, no contradice este valor.
- **Grosor**: se mantuvo sin cambios (2px) — coincide en orden de magnitud con lo observado.
- **Interrupción**: nuestro mecanismo (recorte geométrico angular mediante intersección de círculos, nunca z-index) coincide CONCEPTUALMENTE con lo observado en Zizou (frames 001, 003, 004, 006, 008, 009, 011) — no hay evidencia de que Zizou use algo menos robusto, pero tampoco de que use algo más. **No reemplazar nuestro sistema geométrico por algo más simple** — ya es, si acaso, más explícito/verificable que lo que se puede confirmar del lado de Zizou.
- **Varios elementos**: confirmado que cada elemento genera su propio hueco independiente, en ambos sistemas.
- **Movimiento/resize/rotación de líneas**: las líneas no se mueven ni se redimensionan por sí mismas en ninguno de los dos sistemas — solo reaccionan a los elementos.
- **Persistencia**: nuestro sistema guarda el ESTILO elegido (no la geometría ya calculada) y la recalcula siempre al restaurar — no hay forma de verificar cómo lo resuelve Zizou internamente, pero el resultado visual esperado (mismo estilo, mismos huecos) es el mismo.
- **"Simple" sigue sin evidencia de video** — se implementó compartiendo el mismo radio central que el par "Doble" (asunción ya existente, no confirmada ni contradicha). Ver "Decisiones que no debemos copiar" / seguimiento pendiente más abajo.

## 8. Selección e interacción

- **Click / selección**: ambos sistemas seleccionan con un click. Sin evidencia de doble-click en Zizou (ningún frame lo muestra explícitamente, pero tampoco hay evidencia de lo contrario).
- **Toolbar al seleccionar**: coincide (aparece apenas se selecciona).
- **Click fuera / seleccionar otro elemento**: comportamiento no completamente verificable en Zizou (sin frames de transición). Nuestro comportamiento (cerrar el menú sin deseleccionar al hacer click en el panel lateral) es una decisión propia bien documentada, sin evidencia de que Zizou haga algo distinto o mejor.
- **Doble click**: eliminado deliberadamente de nuestro flujo de edición de texto (reemplazado por el botón "Editar") en una iteración anterior — sin evidencia de que Zizou use doble-click para algo.
- **Conclusión general**: no se encontró ninguna diferencia que haga que Zizou se sienta claramente "más natural" que nuestro editor en esta área — las diferencias reales (edición de texto con un click extra, ver Toolbar) ya están marcadas como MEJORA a evaluar, no como algo urgente.

## 9. Movimiento

Sin evidencia de video (ningún frame captura un arrastre en curso). Nuestro sistema (angular + radial, con reacomodo hacia el centro al agrandar, límites dependientes del tamaño) es la única implementación verificable de las dos. **MANTENER sin cambios** — no hay ninguna base para modificarlo, y la tarea explícitamente pide no tocarlo.

## 10. Resize

Sin evidencia de video sobre la MECÁNICA del gesto (solo se confirma que el botón "agrandar" existe en ambos sistemas). El gesto actual nuestro (distancia euclídea al elemento, cualquier dirección, acercarse achica/alejarse agranda) fue diseñado, probado y aprobado en la iteración inmediatamente anterior a esta. **No hay ninguna evidencia en el video que sugiera cambiarlo.** MANTENER, sin cambios.

## 11. Rotación

Mismo caso que Resize: existe el control en ambos sistemas (solo para íconos), sin evidencia de la mecánica del gesto en Zizou. **MANTENER sin cambios.**

## 12. Feedback visual

- **Hover/active/disabled**: implementados con CSS (`--active`, `:disabled`, `:hover`) — sin problema evidente.
- **Contador de elementos** (`ElementCounter`, "4/4 · Texto 1/1 · Íconos 3/3"): **no se observó nada equivalente en ningún frame de Zizou** — ningún indicador numérico de cuántos elementos van usados. Esto es un lugar donde **nuestro editor parece mejor**: da información proactiva al usuario en vez de solo bloquear botones en silencio.
- **Mensajes de límite** ("Llegaste al máximo de elementos...", visible en frame propio de una sesión anterior): tampoco se observó un mensaje equivalente en Zizou.
- **Conclusión**: no se encontró ningún detalle de feedback visual donde Zizou sea claramente superior. Ver "Cosas en las que nuestro editor es mejor" al final.

## 13. Flujo completo

```text
Zizou:    Plantillas → Diseño → Confirmar (con checkout: tipo de compra, notas) → Enviar → toast de confirmación
Nuestro:  (solo) Diseño — el resto del flujo (selección de compra, checkout, envío a producción) vive en otra capa/documento (docs/PRODUCT.md, integración Tienda Nube)
```

- **Pasos que tenemos**: el equivalente de "Diseño" (edición completa: texto, íconos, líneas).
- **Pasos que "faltan"**: Plantillas (partir de un diseño pre-armado) y Confirmar (checkout embebido) — ambos son features de otra escala de producto, ya contempladas en otros documentos del proyecto, no un hueco de esta capa del editor.
- **Pasos que sobran**: ninguno — nuestro alcance actual (solo el editor) es más chico a propósito, no tiene nada de más.
- **Conclusión**: **NO APLICA** rehacer el flujo completo en base a este audit — es una decisión de arquitectura de producto ya tomada en otro lugar, no algo que este documento deba re-decidir.

## 14. Responsive / Mobile

El video es 100% desktop (1366×688, ventana de navegador). **No hay ningún frame ni indicio de comportamiento mobile/responsive de Zizou.** Coincide con nuestra propia decisión ya tomada de no trabajar mobile todavía. **NO APLICA implementar nada** — no hay evidencia que lo justifique, y ya estaba fuera de alcance de por sí.

## 15. Código / arquitectura

Hallazgos concretos (no especulativos) revisando el estado actual del código:

1. **Duplicación evitable**: `getIconHalfExtents` en `ContextualToolbar.tsx` (líneas ~295-306) es una copia manual de `getRotatedHalfExtents` (ahora exportada desde `containment.ts` desde la iteración de líneas circulares). Cuando se escribió la copia, la función original NO estaba exportada (comentario explícito en el código lo documenta) — eso ya cambió. **P2** — reemplazar la copia por un import, bajo riesgo (misma fórmula, ya usada en 3 lugares).
2. **Patrón frágil ya resuelto, pero digno de nota para el futuro**: agregar/quitar las líneas circulares dispara `object:added`/`object:removed`, que a su vez podían volver a disparar el redibujado de las líneas — se encontró y arregló una recursión infinita real durante la implementación (guard `isCircularLineObject` en `useFabricCanvas.ts`). **Cualquier futuro sistema que agregue objetos propios al canvas y escuche esos mismos eventos debe replicar este guard** — dejarlo documentado explícitamente acá. **P2** (mantenibilidad/riesgo futuro, no un bug activo hoy).
3. **`useFabricCanvas.ts` es un archivo grande** con más de una decena de handlers definidos dentro de un único `useEffect` (necesario porque todos comparten el cierre sobre `canvas`/`lastTextDragPointer`). No es un bug, pero dificulta la navegación. **P3** — posible extracción de algunos handlers a funciones nombradas fuera del efecto (recibiendo `canvas` como parámetro) si se vuelve a tocar este archivo por otra razón; no vale la pena un refactor solo por esto.
4. **Constantes de margen dispersas** (`EXCLUSION_MARGIN_PX`, `ICON_MARGIN_PX`, `TEXT_RADIAL_MARGIN_PX`, `ANCHOR_MARGIN_PX`, cada una en su propio archivo): cada una está bien documentada y resuelve un problema geométrico genuinamente distinto — NO es la misma configuración duplicada en varios lugares, es un margen distinto por concepto. **No se recomienda consolidar** (P3, solo observación) — consolidarlas arriesgaría mezclar conceptualmente cosas que no deberían compartir un solo número.
5. **No se encontró** código muerto evidente, comentarios claramente obsoletos, ni estados de React innecesarios en la revisión de esta sesión — la última ronda de iteraciones (gesto de resize, líneas circulares) se hizo con bastante disciplina de "borrar lo que ya no aplica" (confirmado en iteraciones anteriores: se sacó `getSizeGestureReferencePoint`, el override de `getSelectionStartFromPointer`, etc. cuando dejaron de usarse).

---

## Cambios recomendados

### P0 — crítico
*(ninguno encontrado)*

### P1 — importante
*(ninguno encontrado — todas las diferencias reales resultaron ser de pulido/filosofía, no de funcionalidad rota o faltante crítica)*

### P2 — mejora

| # | Problema | Evidencia | Frame | Estado actual | Propuesta | Impacto | Dificultad |
|---|---|---|---|---|---|---|---|
| 1 | Editar texto requiere un click extra en "Editar" | Zizou edita directo desde el sidebar | 005 | Botón "Editar" abre `TextEditorPanel` | Re-evaluar si el problema que motivó el botón (evitar que seleccionar abra el editor) sigue aplicando; si no, considerar mostrar el campo directo al seleccionar | Menos fricción para editar texto | Baja-media (tocar `EditorContext`/`Sidebar`/`ContextualToolbar`) |
| 2 | Sidebar oculta toda la sección al no haber selección | Zizou mantiene "Editar texto"/"Ícono" siempre visibles con placeholder | 001, 006 | `Sidebar.tsx` muestra un único placeholder genérico | Mostrar ambas secciones siempre, con su propio placeholder | Sensación de estructura más estable | Baja (solo `Sidebar.tsx`) |
| 3 | Toolbar de texto/ícono incluye Invertir/Espejar V | Zizou los deja en el sidebar, no en el toolbar rápido | 001, 005, 007 | 4 y 5 botones respectivamente | Evaluar si conviene mover Invertir/Espejar V al panel, dejando el toolbar más chico | Toolbar más simple | Media (toca `ContextualToolbar.tsx`, `TextEditorPanel.tsx`, `IconEditorPanel.tsx`) |
| 4 | `getIconHalfExtents` duplicada | Ya exportada en `containment.ts` | — (código) | Copia manual en `ContextualToolbar.tsx` | Reemplazar por import | Menos código para mantener | Baja |
| 5 | Guard anti-recursión de líneas circulares no documentado en un lugar central | Se encontró y arregló durante la implementación | — (código) | Guard puntual en `useFabricCanvas.ts` | Dejar una nota central (este documento ya cumple esa función) | Evita reintroducir el bug en el futuro | N/A (ya hecho, documental) |
| 6 | Selector de íconos plano vs. por categorías | Zizou usa categorías con un catálogo grande | 007, 008 | Grilla plana, 6 íconos | Revisar solo si el catálogo crece mucho | Escalabilidad del selector | Media-alta (si se hace) |

### P3 — cosmético

- Colores saturados por botón en el toolbar de Zizou (rojo/verde/azul) — NO copiar, no encaja con la marca.
- Cuadro/círculo punteado de referencia alrededor del elemento seleccionado (Zizou lo tiene, nosotros no) — posible micro-mejora visual, no funcional.
- Revisar si "Espejar vertical" se usa lo suficiente dado que la mayoría de nuestros íconos son simétricos verticalmente.
- Tamaño del archivo `useFabricCanvas.ts` — posible extracción de handlers si se vuelve a tocar por otra razón.

---

## Decisiones que NO debemos copiar de Zizou

1. **Botones sueltos alrededor del elemento en vez de un menú agrupado** — tapa más área del diseño; nuestra píldora es más compacta y ya fue una decisión deliberada.
2. **Orientación radial del texto** (frame 009, "INDIO") — permitir esto reintroduciría el riesgo de romper la curvatura/legibilidad que evitamos a propósito en varias iteraciones anteriores. Si se quiere en el futuro, debe diseñarse como una feature explícita y controlada, no como "rotación libre".
3. **Selector de íconos en dos niveles** — sobre-ingeniería para un catálogo de 6 íconos; solo tendría sentido si el catálogo crece mucho.
4. **Flujo de checkout embebido en el editor** (Plantillas/Confirmar) — nuestra arquitectura ya separa esto deliberadamente en otra capa (Tienda Nube); mezclarlo acá contradiría decisiones de arquitectura ya tomadas.
5. **Simplificar nuestro sistema de contención geométrica** para "parecerse más" — la similitud con la referencia es la prioridad MÁS BAJA de las cuatro (correctness > producción segura > UX > similitud), y nuestro sistema ya cumple las dos primeras con más rigor del que se puede verificar en Zizou.

## Cosas en las que nuestro editor es mejor

1. **Contador de elementos con desglose por tipo** (`ElementCounter`) — feedback proactivo que no se observó en ningún frame de Zizou.
2. **Mensajes explícitos de límite alcanzado** — tampoco observados en Zizou.
3. **Sistema de contención geométrica exacto** (bisección para bounding boxes rotados, intersección real de círculos para las zonas de exclusión) — más verificable/robusto que lo que se puede confirmar desde afuera en Zizou.
4. **Libertad radial de texto dependiente del tamaño de fuente** (texto grande se mantiene cerca del centro, texto chico gana más libertad) — no se observó nada equivalente en Zizou (no hay evidencia de que el texto de Zizou tenga libertad radial en absoluto, aparte del caso aislado y no explicado del frame 009).
5. **Gesto de resize por distancia euclídea, omnidireccional** — ya verificado exhaustivamente (texto, íconos, distintas formas, cualquier ángulo de arrastre); no hay evidencia de que el de Zizou sea comparable en robustez (no se puede verificar, pero tampoco hay razón para dudar del nuestro).
6. **Reposicionamiento automático al agrandar cerca de un borde** (íconos y texto) — corregido y probado extensamente; sin evidencia equivalente en Zizou.
