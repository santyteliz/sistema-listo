# Mapa de interacción — Zizou (observado en el video)

Cada entrada distingue lo que el video muestra DIRECTAMENTE de lo que se infiere. Cuando no hay evidencia directa, se dice explícitamente "no observado en el video" en vez de inventarlo.

## Sidebar

**Estructura observada** (frames 001, 003, 006): tres pestañas arriba del todo (Plantillas / Diseño / Confirmar). Dentro de "Diseño", de arriba hacia abajo: "Editar texto" (campo de texto + tipografía + "Invertir texto") → "Ícono" (Espejar / Invertir / Ángulo inicial cuando hay uno seleccionado; "Seleccioná un ícono para ajustar" cuando no) → **"Líneas circulares"** (No / Simple / Doble) → "Vectorizar Imagen" (subir PNG/WebP) → botón "Continuar a confirmación". Al pie, siempre visible: usuario logueado + "Cerrar sesión".

Coincide con la ubicación que ya replicamos en nuestro editor (`CircularLinesPanel` inmediatamente después del panel de ícono).

## Líneas circulares

### Doble (única activa observada)

Acción: no se observó el click que la activó (ya estaba activa en el primer frame, 0:00).

Resultado observado: dos círculos concéntricos finos, color verde oliva, dibujados dentro de la banda blanca — pero NO centrados en ella: se ubican notablemente más cerca del borde EXTERIOR (justo por dentro de una guía punteada que corre pegada al límite del área blanca) que del círculo marrón central. Entre el par de líneas y el círculo marrón queda un espacio en blanco considerable, sin ninguna otra marca.

Referencia: frames 002 (sin elementos, círculo completo), 003 y 004 (zoom, con elementos e interrupciones).

### Simple / No

No observado en el video — el control existe y se ve completo (frame 003), pero nunca se lo ve presionado ni activo. No hay evidencia visual de dónde queda la línea simple ni de que desaparezca del todo.

## Texto

- **Agregar/editar contenido**: campo de texto libre en "Editar texto"; se probó escribiendo "hola claude" (frame 005).
- **Tipografía**: dropdown con al menos 5 opciones (Lato, Playfair Display, Poppins, Merriweather, Dancing Script) — cada una con su propia vista previa tipográfica en la lista (frame 005).
- **Invertir**: botón "Invertir texto" presente (frame 001, 005) — no se observó el resultado de presionarlo (no hay un frame antes/después).
- **Curvatura / posición radial**: en el frame 009 hay un texto ("INDIO") orientado en sentido RADIAL (vertical, de afuera hacia adentro) en vez de tangencial al anillo — distinto de cómo nuestro editor cur va el texto siempre tangencialmente. No se pudo determinar en el video si esto es una opción explícita (ej. "ángulo" del texto) o un efecto de rotarlo manualmente; no hay un control de texto visible específicamente para esto en los frames revisados.
- **Interacción con las líneas**: el texto interrumpe la línea Doble igual que un ícono — confirmado en frames 003/004 (hueco alrededor de donde iría el texto/T) y 009 (hueco alrededor de "INDIO").

## Iconos

- **Agregar ícono**: modal "Seleccionar ícono" en dos niveles — primero una lista de CATEGORÍAS (Romántico, Música, Random, Iconos del Usuario, Deportes, Naturaleza, River, Astros, Animal, Fútbol Arg — frame 007), después la grilla de íconos de esa categoría (frame 008). Estructura más profunda que nuestro selector plano.
- **Panel de ajuste del ícono**: "Espejar / Invertir / Ángulo inicial" (tres botones — frame 007), diferente de nuestro panel (que usa un slider de posición angular). No se pudo determinar en el video si "Ángulo inicial" abre un control adicional (no se observó el resultado de tocarlo).
- **Mover / Agrandar / Rotar**: no observado como gesto en curso (ver limitación general en FRAME-INDEX.md) — sí se confirma la EXISTENCIA de handles para rotar y agrandar en el toolbar flotante (frame 008).
- **Iconos cerca de límites**: no se observó ningún ícono llevado deliberadamente a un límite Ø72/Ø94 en los frames revisados.
- **Interacción con las líneas**: igual que el texto, cada ícono corta la línea Doble en su propia posición angular (confirmado en todos los frames con elementos: 001, 003, 004, 006, 008, 009, 011). Con más de un ícono, cada uno genera su propio hueco independiente (frame 001: dos huecos distintos, uno por ícono).

## Toolbar

Aparece flotando sobre el elemento seleccionado, fuera del anillo, con un cuadro/círculo punteado azul de referencia alrededor del elemento (frame 008). Botones observados (íconos): eliminar (círculo rojo, papelera — arriba del elemento), agrandar (círculo verde, flechas diagonales — costado), rotar (círculo azul, flecha circular — solo en íconos, no se vio en texto). La posición exacta de cada botón varía según dónde está el elemento en el anillo (en frame 001 el "agrandar" queda arriba-derecha del texto; en frame 008 el "rotar" queda a la izquierda del ícono) — coherente con un posicionamiento relativo al elemento, no fijo en pantalla, igual que nuestro `ContextualToolbar`.

## Movimiento / Resize / Rotación

No observado como gesto en curso en ningún frame candidato (ver limitación en FRAME-INDEX.md) — el video no contiene frames intermedios de un arrastre, solo estados de reposo antes/después de acciones discretas (cambio de texto, cambio de pestaña, apertura de modal). No se puede confirmar ni contradecir el comportamiento específico de nuestro sistema de gestos contra esta referencia.

## Selección

Un elemento seleccionado muestra su toolbar flotante + un cuadro/círculo de referencia punteado (frame 008) — no se observó el estado "sin selección" con un elemento presente para comparar el cambio visual exacto al deseleccionar (el frame 006, sin selección, ya no tiene texto).

## Flujo general

Plantillas (elegir plantilla de partida, o "Empezar desde cero") → Diseño (editar texto/ícono/líneas/imagen) → Confirmar (datos de compra + notas) → "Enviar" → toast de confirmación "Diseño enviado. Te avisaremos cuando esté listo." (frames 001, 010). El usuario puede volver a "Plantillas" en cualquier momento sin perder el diseño en curso (frame 011, cerca del final, con el mismo diseño ya editado todavía visible en la preview).
