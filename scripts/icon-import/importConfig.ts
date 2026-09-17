/**
 * Configuración compartida del importador — extraída de `runImport.ts` en
 * la Etapa 5 para poder reutilizarla desde `runImportEtapa5.ts` (que
 * escribe a un directorio de scratch, nunca a `public/icons/`) SIN
 * duplicar el mapa de overrides de revisión visual (25 entradas curadas a
 * mano en la Etapa 2 — duplicarlas habría sido un riesgo real de que las
 * dos copias se desincronizaran con el tiempo) ni importar `runImport.ts`
 * directamente (que dispararía su propia corrida completa sobre
 * `public/icons/` con solo importar el módulo, por el `void main()` al
 * final de ese archivo).
 *
 * `runImport.ts` y `runImportEtapa5.ts` importan AMBOS de acá — un solo
 * lugar con la fuente de verdad de qué carpetas/categorías se procesan y
 * qué archivos tienen un override manual.
 */
import { slugify } from './slug.ts';

export const ICONS_SOURCE_DIR = 'C:/Users/benja/OneDrive/Desktop/iconospdf';

/**
 * Las 5 categorías reales, con su nombre visible EXACTO pedido (con
 * acentos donde corresponde) y su carpeta de origen — `diseños` NO está
 * en esta lista (ni tampoco `Facu/`, la otra carpeta ajena al catálogo de
 * íconos), así que ni se leen ni pueden aparecer en el manifest bajo
 * ningún nombre.
 */
export const CATEGORY_DEFINITIONS: { folder: string; name: string }[] = [
  { folder: 'animales', name: 'Animales' },
  { folder: 'escudos', name: 'Escudos' },
  { folder: 'futbol', name: 'Fútbol' },
  { folder: 'random', name: 'Random' },
  { folder: 'signos', name: 'Signos' },
];

/**
 * Overrides de la REVISIÓN VISUAL FINAL de la Etapa 2 (ver el informe de
 * esa etapa) — archivos que el clasificador automático marcó `valid` pero
 * que, mirando el contact sheet completo, resultaron ser claramente
 * incorrectos. Nunca se toca la geometría extraída de estos archivos —
 * solo se fuerza su `status` a `manual-review`, de forma explícita y
 * documentada (una entrada por archivo, con el motivo concreto que se
 * vio) — "no hagas correcciones arbitrarias sobre la geometría".
 *
 * Categorías de motivo encontradas en la Etapa 2:
 * - "dos diseños" — el clasificador automático no separó dos piezas
 *   comparables en tamaño porque están dibujadas muy cerca/tocándose
 *   (la misma limitación conocida y aceptada de FUTBOL_12/RANDOM_02 — acá
 *   se pescan los casos ADICIONALES que la revisión visual encontró).
 * - "texto" — geometría que es, en los hechos, una palabra/título
 *   convertido a trazos (no live text, por eso el clasificador automático
 *   no lo detecta con `hasLiveText`) — no es un ícono.
 * - "geometría casi vacía / ilegible" — la extracción vectorial
 *   technically funcionó (hay un `d` no vacío) pero el resultado no es una
 *   silueta reconocible como diseño (unos pocos trazos sueltos, o ruido).
 *
 * IMPORTANTE (Etapa 5): estos overrides siguen aplicando IGUAL con el
 * pipeline nuevo de paint type — son independientes de fill/stroke, sobre
 * la decisión final de "¿es esto un ícono real?", no sobre cómo se pinta.
 */
export const VISUAL_QA_OVERRIDES: Record<string, string> = {
  'animales/ANIMALES_07.pdf': 'geometría casi vacía/ilegible — apenas unos pocos trazos sueltos, no se reconoce como un ícono (visto en el contact sheet).',
  'animales/ANIMALES_20.pdf': 'geometría casi vacía/ilegible — marcas dispersas sin silueta reconocible (visto en el contact sheet).',
  'animales/ANIMALES_29.pdf': 'geometría tipo ruido/píxeles sueltos, no se reconoce como un animal (visto en el contact sheet).',
  'animales/ANIMALES_33.pdf': 'parecen dos diseños independientes: una figura a caballo y un ave aparte, dibujados muy cerca (visto en el contact sheet).',
  'animales/ANIMALES_44.pdf': 'parecen dos versiones superpuestas/duplicadas de una cara de gato, no un único diseño limpio (visto en el contact sheet).',
  'escudos/Escudo_11.pdf': 'geometría casi vacía — el resultado queda prácticamente en blanco (visto en el contact sheet).',
  'escudos/Escudo_31.pdf': 'geometría casi vacía — el resultado queda prácticamente en blanco (visto en el contact sheet).',
  'escudos/Escudo_48.pdf': 'dos escudos/insignias circulares distintos en la misma página (visto en el contact sheet).',
  'escudos/Escudo_56.pdf': 'geometría reducida a un rectángulo sólido sin detalle reconocible — extracción incompleta (visto en el contact sheet).',
  'escudos/Escudo_63.pdf': 'geometría reducida a un rectángulo sólido sin detalle reconocible — extracción incompleta (visto en el contact sheet).',
  'futbol/FUTBOL_26.pdf': 'geometría casi vacía — el resultado queda prácticamente en blanco (visto en el contact sheet).',
  'futbol/FUTBOL_40.pdf': 'geometría casi vacía — apenas un trazo suelto tipo firma, no se reconoce como diseño (visto en el contact sheet).',
  'futbol/FUTBOL_46.pdf': 'geometría casi vacía — apenas un trazo suelto tipo firma, no se reconoce como diseño (visto en el contact sheet).',
  'random/RANDOM_111.pdf': 'geometría casi vacía — el resultado queda prácticamente en blanco (visto en el contact sheet).',
  'random/RANDOM_113.pdf': 'el contenido es mayormente texto/iniciales estilizadas, no un ícono (visto en el contact sheet).',
  'random/RANDOM_115.pdf': 'dos elementos sin relación aparente (una forma tipo luna y unos auriculares) en la misma página (visto en el contact sheet).',
  'random/RANDOM_20.pdf': 'dos elementos independientes (una estrella y un bigote) en la misma página (visto en el contact sheet).',
  'random/RANDOM_28.pdf': 'dos elementos independientes (un símbolo psi y un ave) en la misma página (visto en el contact sheet).',
  'random/RANDOM_35.pdf': 'el contenido es la palabra "familia" en cursiva — texto, no un ícono (visto en el contact sheet).',
  'random/RANDOM_62.pdf': 'varios símbolos de riesgo/peligro distintos combinados en una sola página, no un ícono único (visto en el contact sheet).',
  'random/RANDOM_74.pdf': 'dos vehículos distintos (una moto y una combi) en la misma página (visto en el contact sheet).',
  'random/RANDOM_84.pdf': 'dos coronas de diseño distinto superpuestas, no un único diseño (visto en el contact sheet).',
  'random/RANDOM_97.pdf': 'texto manuscrito más una figura suelta sin relación aparente (visto en el contact sheet).',
  'random/RANDOM_110.pdf': 'el símbolo de Tauro y una constelación de puntos aparte, dos elementos independientes (visto en el contact sheet).',
  'signos/SIGNOS_01.pdf': 'el contenido es el título "SIGNOS" (encabezado de categoría convertido a trazos), no un símbolo zodiacal (visto en el contact sheet).',

  // --- Etapa 6B — revisión visual completa de los 219 `valid` post-Etapa
  // 6A (corrección del bug de cancelación evenodd). Mismo criterio que la
  // Etapa 2: solo se agregan acá, nunca se toca geometría ni se borra nada
  // de arriba. Revisados contra el thumbnail generado por el pipeline
  // actual (nunca `page.render()` como única referencia, por el problema
  // de CropBox ya documentado) — ver el informe de esta etapa para el
  // detalle de qué se vio en cada uno. Motivos agrupados en las mismas
  // categorías conceptuales ya usadas en Etapa 2 ("visual geometry
  // incomplete/fragmented/illegible", "dos diseños distintos", "es texto,
  // no un ícono"), en español para mantener el mismo estilo que el resto
  // del mapa.
  //
  // Nota explícita: de los 16 casos que el pedido de esta etapa señaló
  // como "ya conocidos" (10 escudos + 6 futbol), 14 se confirman acá como
  // genuinamente problemáticos — pero 2 (`Escudo_50.pdf`, `FUTBOL_13.pdf`)
  // se revisaron y resultaron CORRECTOS (un wordmark "HONDA" legible y un
  // cluster de íconos de fútbol nítido, respectivamente) y quedan
  // deliberadamente FUERA de este mapa, tal como pedía la consigna de no
  // asumir que la lista conocida era automáticamente incorrecta.
  'escudos/Escudo_13.pdf': 'visual geometry fragmented — la base del escudo está completa pero el emblema superior es un amasijo de trazos ilegibles, no se reconoce como un símbolo (visto en el thumbnail).',
  'escudos/Escudo_17.pdf': 'visual geometry incomplete — el escudo queda prácticamente vacío, solo sobrevive una estrella chica (visto en el thumbnail; confirmado en la extracción: apenas 3 grupos de relleno en todo el PDF).',
  'escudos/Escudo_22.pdf': 'visual geometry fragmented — no se distingue una forma de escudo coherente, quedan trazos sueltos con parte del texto "ARP" (visto en el thumbnail).',
  'escudos/Escudo_25.pdf': 'visual geometry fragmented — geometría dispersa e ilegible, no se reconoce como un escudo (visto en el thumbnail).',
  'escudos/Escudo_26.pdf': 'visual geometry fragmented — geometría dispersa e ilegible, no se reconoce como un escudo (visto en el thumbnail).',
  'escudos/Escudo_27.pdf': 'visual geometry fragmented — geometría dispersa e ilegible, no se reconoce como un escudo (visto en el thumbnail).',
  'escudos/Escudo_28.pdf': 'visual geometry fragmented — geometría dispersa e ilegible, no se reconoce como un escudo (visto en el thumbnail).',
  'escudos/Escudo_34.pdf': 'visual geometry fragmented — piezas sueltas sin relación clara entre sí, no se arma un escudo reconocible (visto en el thumbnail).',
  'escudos/Escudo_35.pdf': 'visual geometry fragmented — el texto superior "COLO COLO" se lee, pero el cuerpo del escudo es una mancha dispersa sin forma clara (visto en el thumbnail).',
  'escudos/Escudo_44.pdf': 'visual design incomplete — el globo aerostático está completo, pero el texto que lo acompaña quedó reducido a una única letra "H" suelta y desconectada, insuficiente como wordmark (visto en el thumbnail).',
  'escudos/Escudo_45.pdf': 'parecen dos variantes o dos diseños distintos en la misma página (un emblema circular detallado arriba y un óvalo simple con texto "ACM" abajo), visto en el thumbnail.',
  'escudos/Escudo_51.pdf': 'visual geometry fragmented — el texto circular "WARRIORS" y la forma central no se leen con claridad, geometría desordenada (visto en el thumbnail).',
  'escudos/Escudo_52.pdf': 'visual geometry fragmented — quedan solo dos fragmentos sueltos tipo medialuna, sin relación clara entre sí ni con un escudo reconocible (visto en el thumbnail).',
  'futbol/FUTBOL_10.pdf': 'visual geometry fragmented — figura desarmada, no se reconoce una silueta coherente (visto en el thumbnail).',
  'futbol/FUTBOL_11.pdf': 'visual geometry fragmented — el texto "COLO COLO" se lee, pero el resto de la geometría es un amasijo desconectado (visto en el thumbnail).',
  'futbol/FUTBOL_12.pdf': 'dos diseños distintos en la misma página (un emblema circular "ASOCIACION ATLETICA ARGENTINOS JUNIORS" y un escudo a rayas aparte), visto en el thumbnail.',
  'futbol/FUTBOL_15.pdf': 'visual geometry incomplete — el escudo queda prácticamente vacío, con un fragmento de letra "A" roto en la base (visto en el thumbnail).',
  'futbol/FUTBOL_16.pdf': 'el contenido es una firma/texto manuscrito estilizado, no un ícono (mismo criterio que FUTBOL_40.pdf/FUTBOL_46.pdf de la Etapa 2, visto en el thumbnail).',
  'futbol/FUTBOL_18.pdf': 'visual geometry fragmented — las letras sobre la cinta aparecen dispersas y no se leen en orden, texto ilegible (visto en el thumbnail).',
  'futbol/FUTBOL_36.pdf': 'visual geometry fragmented — la base del escudo está completa pero el emblema superior es ilegible (visto en el thumbnail).',
  'futbol/FUTBOL_42.pdf': 'visual geometry fragmented — piezas sueltas sin relación clara entre sí, no se reconoce una figura (visto en el thumbnail).',
  'futbol/FUTBOL_43.pdf': 'visual geometry fragmented — geometría dispersa junto al texto "ARP", no se reconoce como un escudo (visto en el thumbnail).',
  'futbol/FUTBOL_44.pdf': 'varios elementos/diseños distintos en la misma página (una figura de jugador con texto "MESSI 10", un escudo aparte, y marcas sueltas), visto en el thumbnail.',
  'futbol/FUTBOL_48.pdf': 'visual geometry fragmented — un fragmento de rostro aparece desconectado de la escena principal (visto en el thumbnail).',
  'animales/ANIMALES_10.pdf': 'geometría extremadamente mínima (un solo trazo curvo) — posible fragmento de un diseño mayor, no se reconoce como un animal (visto en el thumbnail).',
  'animales/ANIMALES_11.pdf': 'geometría extremadamente mínima (un solo trazo curvo) — posible fragmento de un diseño mayor, no se reconoce como un animal (visto en el thumbnail).',
  'animales/ANIMALES_22.pdf': 'geometría insuficiente (un punto suelto y un trazo en zigzag) para reconocer un animal (visto en el thumbnail).',
  'animales/ANIMALES_23.pdf': 'geometría insuficiente (un punto suelto y un trazo en zigzag) para reconocer un animal (visto en el thumbnail).',
  'random/RANDOM_26.pdf': 'geometría prácticamente vacía — solo quedan unos puntos sueltos, no se reconoce ningún diseño (visto en el thumbnail).',
  'random/RANDOM_87.pdf': 'el diseño principal (un auto) es reconocible, pero incluye fragmentos sueltos adicionales sin identificar (visto en el thumbnail).',
  'random/RANDOM_91.pdf': 'una moto es reconocible, pero aparecen fragmentos sueltos sin relación clara flotando por separado (visto en el thumbnail).',
  'random/RANDOM_95.pdf': 'el diseño principal (una combi) es reconocible, pero incluye fragmentos sueltos adicionales sin identificar debajo (visto en el thumbnail).',
};

/** Ver Paso 4 del pedido original de Etapa 2: solo se quita la extensión y se reemplazan guiones bajos por espacios — nunca se inventa un nombre descriptivo. */
export function deriveName(filename: string): string {
  return filename.replace(/\.pdf$/i, '').replace(/_/g, ' ');
}

export function deriveIconId(categorySlug: string, filename: string): string {
  const stem = filename.replace(/\.pdf$/i, '');
  return `${categorySlug}-${slugify(stem)}`;
}
