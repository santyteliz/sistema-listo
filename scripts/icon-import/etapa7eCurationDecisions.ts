/**
 * Decisiones de curación — Etapa 7E. Capa ADITIVA de datos de QA, separada
 * a propósito de `VISUAL_QA_OVERRIDES` (`importConfig.ts`, Etapa 2/6B) —
 * esa fuente histórica NUNCA se edita ni se borra (no "silenciosamente" ni
 * de ninguna otra forma): esto es una decisión de la Etapa 7E, tomada
 * DESPUÉS de corregir el bug de matrices (Etapa 7C), revisando cada caso
 * uno por uno contra el PDF original con el `dossier-manual-review/` de
 * esta etapa (ground truth + geometría corregida forzada) — ver el informe
 * completo de la Etapa 7E para la evidencia de cada decisión.
 *
 * `RETIRED_OVERRIDES`: claves de `VISUAL_QA_OVERRIDES` (mismo formato
 * `categoria/archivo.pdf`) cuyo motivo original describía geometría
 * corrupta por el bug de matrices (ya corregido) — verificado, uno por
 * uno, que la geometría corregida coincide con el PDF original y es
 * completa/reconocible. El runner de Etapa 7E las excluye de los
 * overrides aplicados, dejando que el clasificador automático decida
 * (que ya las encuentra `valid`).
 *
 * `NEW_MANUAL_REVIEW`: hallazgos NUEVOS de esta etapa — casos que el
 * clasificador automático (con las coordenadas ya corregidas) dejó pasar
 * como `valid`, pero que la revisión visual humana de la Etapa 7E
 * determinó que en realidad son varios diseños independientes combinados,
 * o tienen un elemento genuinamente ilegible/corrupto. Se agregan acá
 * (nunca en `importConfig.ts`) para no mezclar el registro histórico de
 * Etapa 2/6B con hallazgos de esta etapa.
 */

export const RETIRED_OVERRIDES: Record<string, string> = {
  'animales/ANIMALES_07.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un galgo/schnauzer completo y reconocible (verificado contra el PDF original) — el motivo original ("casi vacía/ilegible") describía el efecto del bug de matrices (Etapa 7A-C), ya corregido.',
  'animales/ANIMALES_29.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra una jirafa completa y reconocible — el motivo original ("ruido/píxeles sueltos") describía el efecto del bug de matrices, ya corregido.',
  'animales/ANIMALES_44.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra una única cara de gato limpia, sin duplicación visible — el motivo original ("dos versiones superpuestas") no se confirma con la geometría corregida.',
  'escudos/Escudo_11.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra el escudo "RACING" completo y legible (37.6% de tinta, no vacío) — el motivo original ("prácticamente en blanco") describía el efecto del bug de matrices, ya corregido.',
  'escudos/Escudo_13.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo "C.A.T" con estrella, completo y legible — el motivo original ("amasijo de trazos ilegible") describía el efecto del bug de matrices, ya corregido. Confirmado repetidamente en Etapas 7B/7C/7D/7E.',
  'escudos/Escudo_17.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo "C.A.T" completo con estrella — el motivo original ("prácticamente vacío, solo una estrella") ya no se sostiene.',
  'escudos/Escudo_25.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo "CARP" completo y legible — el motivo original ("geometría dispersa e ilegible") describía el efecto del bug de matrices, ya corregido.',
  'escudos/Escudo_26.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo completo y legible — mismo patrón que Escudo_25/27/28.',
  'escudos/Escudo_27.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo "CASL DE A" completo y legible.',
  'escudos/Escudo_28.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo "CARP" completo y legible.',
  'escudos/Escudo_34.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo/insignia completo y legible — el motivo original ("piezas sueltas") ya no se sostiene.',
  'escudos/Escudo_35.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra el escudo "COLO COLO" completo y legible, no solo el texto superior.',
  'escudos/Escudo_44.pdf': 'RETIRADO (Etapa 7E), con reserva menor: geometría corregida muestra un globo aerostático con una "H" — geométricamente limpio y completo, aunque la completitud del contenido (¿es un monograma intencional o falta más texto?) queda como duda de contenido, no de extracción.',
  'escudos/Escudo_45.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra UN solo escudo coherente (el crest real de "AC Milan 1899", donde la cruz es parte del propio diseño del escudo) — no son dos diseños distintos como se pensó originalmente.',
  'escudos/Escudo_51.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra el logo "Golden State Warriors" completo y legible. NOTA aparte (no bloquea la decisión de curación): es un logo real de una marca/equipo de la NBA — igual que otros escudos de clubes reales ya presentes en el catálogo (Boca, River, AC Milan, etc.), queda a criterio del cliente si se usan marcas de terceros.',
  'escudos/Escudo_52.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un monograma "I FC" con una X — coherente, no dos fragmentos sueltos.',
  'futbol/FUTBOL_10.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo heráldico completo (casco con plumaje, espada, hojas, blasón "GC") — el motivo original ("figura desarmada") describía el efecto del bug de matrices, ya corregido.',
  'futbol/FUTBOL_11.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra el escudo "COLO·COLO" completo, no solo el texto.',
  'futbol/FUTBOL_15.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un escudo completo con monograma legible — el motivo original ("prácticamente vacío") ya no se sostiene.',
  'futbol/FUTBOL_36.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra el escudo "CARP" completo — mismo patrón que Escudo_13.',
  'futbol/FUTBOL_42.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un jugador festejando, ilustración completa y coherente — el motivo original ("piezas sueltas") ya no se sostiene.',
  'futbol/FUTBOL_43.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra el escudo "CARP" completo y legible — el motivo original ("geometría dispersa junto a ARP") ya no se sostiene.',
  'futbol/FUTBOL_48.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra una ilustración completa de un jugador besando un trofeo — el motivo original ("fragmento de rostro desconectado") ya no se sostiene.',
  'random/RANDOM_115.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un ícono único y coherente (auriculares con una carita) — no dos elementos sin relación.',
  'random/RANDOM_84.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra UNA sola corona, sin superposición visible de un segundo diseño.',
  'random/RANDOM_87.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra un auto completo y limpio, sin fragmentos sueltos adicionales visibles.',
  'random/RANDOM_91.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra una bicicleta de montaña completa y limpia (no una moto, corrección menor de descripción), sin fragmentos sueltos.',
  'random/RANDOM_95.pdf': 'RETIRADO (Etapa 7E): geometría corregida muestra una combi VW completa y detallada, sin fragmentos sueltos adicionales visibles.',
};

export const NEW_MANUAL_REVIEW: Record<string, string> = {
  // --- Hallazgos nuevos entre los 30 "recuperados" de la Etapa 7D ---
  'escudos/Escudo_09.pdf': '[Etapa 7E] el escudo en sí es correcto, pero el texto/banner superior sale genuinamente ilegible/deformado (no un problema de matrices) — posible cancelación evenodd en texto curvo superpuesto (ver Etapa 7B, Problema 2) u otro problema de la fuente.',
  'escudos/Escudo_24.pdf': '[Etapa 7E] son DOS escudos independientes en la misma página (una insignia "CAA" con forma de pez arriba, un escudo "I.A.C.C." rayado abajo) — el clustering automático no los separó por estar muy cerca, pero no es un único diseño.',
  'futbol/FUTBOL_19.pdf': '[Etapa 7E] dos elementos sin relación aparente: un jugador con las manos en la cabeza, y una columna/trofeo decorativo separado — no un único diseño.',
  'random/RANDOM_23.pdf': '[Etapa 7E] dos elementos sin relación aparente: una forma abstracta tipo mancha/textura arriba, y un mapa de Sudamérica abajo — no un único diseño.',
  'random/RANDOM_42.pdf': '[Etapa 7E] son al menos 5 íconos genéricos sin relación combinados en una sola página (bailarina, batería, árbol, ancla, Torre Eiffel) — no un único diseño.',
  'random/RANDOM_60.pdf': '[Etapa 7E] son al menos 4 elementos sin relación combinados (alas/murciélago, una persona, un tiburón, un ave) — no un único diseño.',
  'random/RANDOM_67.pdf': '[Etapa 7E] son 3 elementos sin relación combinados (yin-yang, una figura con paraguas, un jugador de golf) — no un único diseño.',
  'random/RANDOM_73.pdf': '[Etapa 7E] dos objetos sin relación aparente (una pistola de pintura y una cámara fotográfica) muy próximos entre sí — el clustering automático los agrupa como 1 solo cluster por la cercanía, pero no leen como un único ícono.',

  // --- Hallazgos nuevos entre los 186 "se mantienen" (previamente `valid`, no tocados por el fix de matrices) ---
  'animales/ANIMALES_25.pdf': '[Etapa 7E] dos animales independientes (una cabeza de caballo con riendas, y un gato chico aparte) — no un único diseño. Revisión visual sistemática de esta etapa detectó esto pese a que el archivo ya era `valid` desde antes de la Etapa 6C.',
  'futbol/FUTBOL_13.pdf': '[Etapa 7E] revierte una aceptación explícita de la Etapa 6B ("cluster de íconos de fútbol nítido"): la revisión de esta etapa encuentra 4 insignias/objetos claramente distintos combinados (2 escudos distintos + un trofeo + un sello redondo "CARP") — se marca para reconsideración humana, no se decide unilateralmente que la Etapa 6B se equivocó.',
  'futbol/FUTBOL_25.pdf': '[Etapa 7E] dos escudos de club independientes en la misma página ("VJS" y "CAA") — no un único diseño.',
};

// --- Hallazgo documentado, NO corregido (posible bug de pipeline) ---
// `Escudo_48.pdf`: la geometría corregida muestra un escudo real (5
// estrellas + monograma) PERO el segundo elemento de la página, que el
// PDF original (ground truth, `page.render()`) muestra como un patrón de
// muchas estrellas chicas armando un círculo (estilo balón de la Champions
// League), se extrae/compone como un simple RECTÁNGULO SÓLIDO NEGRO — no
// coincide con el original. Sospecha: cancelación evenodd entre las
// estrellas superpuestas (mismo mecanismo documentado para FUTBOL_56 en la
// Etapa 7A/7B, pero aquí con cancelación total en vez de parcial). NO SE
// INVESTIGÓ NI SE MODIFICÓ `composeIconGeometry.ts` — queda documentado
// para una futura etapa, tal como pide el pedido de la Etapa 7E ("si
// aparece un posible bug de código, documentarlo y detenerse en ese
// caso"). Este archivo YA estaba en `VISUAL_QA_OVERRIDES` (Etapa 2, motivo
// "dos escudos/insignias circulares distintos") y se MANTIENE en
// `manual-review` — no se agrega a `NEW_MANUAL_REVIEW` porque ya está
// cubierto por el override existente, sin cambios.
