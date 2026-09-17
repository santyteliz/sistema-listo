import { IText, Path, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { DEFAULT_FONT_FAMILY } from '../fonts/fontLibrary';
import type { EditorSelection } from '../state/selection';
import { normalizeAngleDeg } from './ringAngle';
import { createRingVisibilityMask } from './visibilityMask';
import { DESIGN_INK_COLOR } from './designColors';

/**
 * Texto curvo sobre la virola. Usa la funcionalidad nativa de Fabric.js
 * "texto sobre un path" (ver docs/DECISIONS.md, D4) — nunca una simulación
 * visual con CSS/SVG externo. La geometría de la curva sale siempre de
 * `VirolaConfig`, nunca de un número hardcodeado acá ni en un componente.
 */

const DEFAULT_TEXT = 'TU TEXTO';

/** Tamaño de fuente: mínimo legible y máximo "grande" para textos cortos. */
export const MIN_FONT_SIZE = 16;
export const MAX_FONT_SIZE = 40;

/**
 * Qué fracción del tamaño de fuente ocupa, aproximadamente, el cuerpo de
 * una letra por encima del renglón base (altura de mayúsculas/ascendentes,
 * la parte que "crece" en sentido radial desde `textCurveRadius`). Es una
 * aproximación deliberadamente conservadora (de sobra para la mayoría de
 * tipografías latinas) — mejor dejar aire de más que dejar que una letra
 * sobresalga del anillo. Ver `maxTextGlyphHeight` en virola.config.ts.
 */
/**
 * Exportada (además de usarse acá adentro) porque `circularLines.ts` también
 * la necesita para calcular la zona de exclusión de un texto frente a las
 * líneas circulares decorativas — misma fórmula, no una copia nueva.
 */
export const GLYPH_HEIGHT_RATIO = 0.78;

/**
 * Tope duro de caracteres — un número fijo de producto, no una estimación
 * geométrica (se probó una versión dinámica en la etapa anterior; esta
 * corrección la reemplaza a pedido explícito por un valor simple y
 * predecible). Se aplica tanto al `<textarea>` del panel como a la edición
 * nativa sobre el canvas (ver el recorte defensivo en `applyTextCurve`).
 */
export const MAX_TEXT_LENGTH = 161;

/**
 * Separación de seguridad entre el final y el principio del texto cuando
 * casi completa la vuelta entera, expresada como fracción del tamaño de
 * fuente actual (así el hueco se ve proporcional sea cual sea el tamaño). No
 * es una medición real de Fabric (no hay nada que medir en un hueco vacío):
 * es, igual que antes lo era `MAX_ARC_UTILIZATION`, una decisión de
 * composición del editor para que el texto nunca se vea "pegado consigo
 * mismo".
 *
 * Antes valía 0.9 (casi un carácter entero de hueco), lo que restaba mucho
 * más margen del necesario solo para separación visual — con
 * `MAX_TEXT_LENGTH = 161`, ese desperdicio hacía que el auto-fit nunca
 * pudiera llegar realmente a 161 caracteres al tamaño mínimo (se topaba
 * antes, alrededor de 145, con contenido típico). Bajarlo a 0.25 deja un
 * hueco bien perceptible pero acorde a lo que hace falta para que el
 * principio y el final no se toquen, liberando ese margen para texto real.
 * Sigue siendo geometría, no una heurística de cantidad de caracteres: el
 * ancho del texto se sigue midiendo siempre con `calcTextWidth()`.
 */
const GAP_FONT_RATIO = 0.25;

/**
 * Margen adicional de manipulación radial, exclusivo del texto — mismo
 * concepto y mismo orden de magnitud que `ICON_MARGIN_PX` en containment.ts
 * (10px ≈ 2mm), pero declarado acá aparte porque ese archivo es solo para
 * íconos (ver el comentario grande al principio de containment.ts) y este
 * módulo no lo importa.
 *
 * Da dos cosas a la vez: (1) el techo real de tamaño de fuente sube un poco
 * (ver `getEffectiveMaxFontSize`, que ahora lo suma a `maxTextGlyphHeight`
 * antes de convertirlo a tamaño de fuente) — un texto grande puede ocupar
 * más franja porque se le permite invadir levemente Ø72/Ø94, igual que a un
 * ícono grande; y (2) el rango de posiciones radiales válidas alrededor del
 * radio central de 41.5mm (`getTextRadialRange`) también se ensancha un
 * poco por ambos lados, igual que la banda efectiva de los íconos
 * (`getIconBandRadii`).
 */
const TEXT_RADIAL_MARGIN_PX = 10;

/**
 * "Invertir texto": no es un espejado del string (`scaleX(-1)` desalinearía
 * el texto respecto de la curva y dejaría los caracteres al revés). Lo que
 * se invierte es el sentido en que el arco se curva — de "sonrisa" a "ceño"
 * — manteniendo el texto siempre derecho y legible. Es el mismo mecanismo
 * que se validó en los prototipos de D4 (ahí llamado "dirección del arco").
 */
export interface CurveState {
  inverted: boolean;
  /** Posición angular alrededor de la virola (0-360°, 0 = arriba, sentido horario). */
  offset: number;
}

const DEFAULT_CURVE_STATE: CurveState = { inverted: false, offset: 0 };

/**
 * Nombres de las propiedades propias (no nativas de Fabric) que un texto
 * curvo guarda sobre sí mismo. `canvas.toJSON()` en Fabric.js 6.0.2 no
 * acepta una lista de propiedades adicionales a incluir (a diferencia de la
 * v5) — para serializar esto hay que usar `canvas.toObject(TEXT_CUSTOM_PROPERTIES)`
 * en su lugar, que sí la acepta y produce una estructura igualmente
 * compatible con `loadFromJSON()` (verificado en Chrome real).
 *
 * `desiredFontSize` es el tamaño que el usuario pidió (al agregar el texto,
 * o al mover el slider de tamaño) — puede ser más grande que `fontSize`
 * (la propiedad nativa, el tamaño realmente aplicado) si el auto-fit tuvo
 * que achicarlo para que entre. Guardar ambos por separado es lo que
 * permite que, si después se acorta el texto o se cambia a una tipografía
 * más angosta, el tamaño pueda volver a crecer hasta el que el usuario
 * había pedido en un principio, en vez de quedar achicado para siempre.
 */
export const TEXT_CUSTOM_PROPERTIES = [
  'curveInverted',
  'curveOffset',
  'curveRadius',
  'desiredFontSize',
  'textOverflowing',
] as const;

/**
 * Construye el 'd' de un arco de círculo que da casi toda la vuelta
 * completa (360° menos `gapDeg`), centrado en el origen local (0,0) — el
 * hueco queda siempre centrado en la parte de "abajo" (ángulo 180° en la
 * convención de `ringAngle.ts`), enfrente de donde arranca la lectura del
 * texto (ángulo 0°/arriba) cuando el objeto no está rotado.
 *
 * Antes esto era siempre un semicírculo fijo (180°) y la posición sobre el
 * anillo se lograba desplazando el texto a lo largo de ese semicírculo
 * (`pathStartOffset`). Ahora el arco representa el máximo utilizable —
 * hasta casi la vuelta completa, para que textos largos puedan usarlo — y
 * la posición sobre el anillo se logra rotando el objeto entero
 * (`textObj.angle`, ver `applyTextCurve`): como el pivote de rotación es
 * siempre el centro exacto de la virola (`createCurvedText` bloquea
 * `left`/`top`), rotar nunca cambia la distancia de ningún punto de la
 * curva a ese centro, así que el texto sigue perfectamente contenido en la
 * banda sin importar a qué ángulo apunte.
 *
 * Un arco de hasta 360°-ε se puede representar en un solo comando SVG `A`
 * usando el "large-arc-flag" (a diferencia de un círculo completo, que es
 * ambiguo si el punto de inicio y fin coinciden) — no hace falta partirlo
 * en dos mitades como sí necesita `guides.ts` para el contorno completo.
 *
 * El barrido SIEMPRE es el mismo sentido (sweep-flag fijo) — a propósito.
 * En el semicírculo original, invertir cambiaba el sweep-flag manteniendo
 * los mismos dos extremos, y eso funcionaba porque esos dos extremos eran
 * antipodales (un diámetro): las dos mitades resultantes son reflejo exacto
 * una de la otra respecto de esa línea, así que el texto quedaba legible en
 * ambas. Con un arco de casi 360° eso deja de ser cierto — los dos extremos
 * están casi pegados, así que cambiar el sweep-flag no "refleja" el arco,
 * lo hace recorrer el círculo en sentido contrario, y cada letra queda
 * literalmente boca abajo (se comprobó visualmente). Por eso la inversión
 * ya no se resuelve acá: ver `pathAlign` en `applyTextCurve`, que logra el
 * mismo efecto (cambiar de qué lado del trazo cuelgan las letras) sin
 * tocar el sentido del recorrido ni el orden de lectura.
 */
function buildArcPath(radius: number, gapDeg: number): string {
  // El hueco va centrado en el ángulo local 180° (abajo) para que el punto
  // medio del arco —donde el auto-fit centra un texto corto por
  // defecto, ver `centeredOffset`— caiga en el ángulo local 0° (arriba).
  // Es más que estética: al barrer siempre en sentido de ángulo creciente,
  // la dirección de lectura (hacia dónde apunta la tangente del path) es
  // hacia la derecha exactamente en el ángulo 0° — si el hueco (y por lo
  // tanto el punto medio del arco) quedara en 0°, un texto corto por
  // defecto se centraría en el ángulo 180°, donde la tangente de este
  // mismo barrido apunta hacia la IZQUIERDA, y el texto se vería al revés
  // (se comprobó visualmente).
  const startAngleDeg = 180 + gapDeg / 2;
  const endAngleDeg = 540 - gapDeg / 2;
  const toLocalPoint = (angleDeg: number): { x: number; y: number } => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return { x: radius * Math.sin(angleRad), y: -radius * Math.cos(angleRad) };
  };
  const start = toLocalPoint(startAngleDeg);
  const end = toLocalPoint(endAngleDeg);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
}

/** Ángulo (grados) del hueco de seguridad para un tamaño de fuente y radio dados. */
function getGapAngleDeg(radius: number, fontSize: number): number {
  const gapLengthPx = fontSize * GAP_FONT_RATIO;
  return (gapLengthPx / (2 * Math.PI * radius)) * 360;
}

/**
 * Rango del control LINEAL (la barra "Posición alrededor de la virola" del
 * panel) que representa la posición angular del texto — no el rango del
 * ángulo en sí (que sigue siendo circular, 0-360°, ver `ringAngle.ts`).
 *
 * El máximo es 359, no 360, a propósito: 360° y 0° son el mismo punto del
 * anillo, y `applyTextCurve` normaliza el offset guardado con `% 360` (ver
 * `normalizeAngleDeg`) — si la barra pudiera llegar a 360, ese valor se
 * guardaría como 0, y como el valor mostrado sale del mismo objeto que se
 * acaba de guardar, la barra "saltaba" de vuelta al inicio apenas se
 * arrastraba hasta el final (bucle visible). Topándola en 359 nunca se le
 * pide a `applyTextCurve` un valor que la normalización cambie, así que la
 * barra queda lineal y acotada de verdad — el mismo criterio que ya usa el
 * slider de posición de los íconos (`IconEditorPanel.tsx`, `max={359}`),
 * cuyo equivalente (`applyIconAngle`) nunca normaliza el ángulo que recibe.
 * No cambia el sistema angular del texto: solo hasta dónde puede llegar
 * este control en particular.
 */
export function getCurveOffsetRange(): { min: number; max: number } {
  return { min: 0, max: 359 };
}

/** Lee el estado de curvatura guardado en el texto (o el valor por defecto). */
export function getCurveState(textObj: IText): CurveState {
  const inverted = textObj.get('curveInverted');
  const offset = textObj.get('curveOffset');
  return {
    inverted: typeof inverted === 'boolean' ? inverted : DEFAULT_CURVE_STATE.inverted,
    offset: typeof offset === 'number' ? offset : DEFAULT_CURVE_STATE.offset,
  };
}

/** Tamaño que el usuario pidió (ver TEXT_CUSTOM_PROPERTIES) — MAX_FONT_SIZE si nunca lo tocó. */
export function getDesiredFontSize(textObj: IText): number {
  const stored = textObj.get('desiredFontSize');
  return typeof stored === 'number' ? stored : MAX_FONT_SIZE;
}

/**
 * Longitud de arco disponible para el texto, para un radio y tamaño de
 * fuente dados: la circunferencia completa menos el hueco de seguridad
 * (que depende del tamaño de fuente, ver `getGapAngleDeg`/`GAP_FONT_RATIO`)
 * — reemplaza la fracción fija (`MAX_ARC_UTILIZATION`) que antes limitaba
 * el texto a una porción chica de un semicírculo fijo.
 */
function getAvailableArcLength(radius: number, fontSize: number): number {
  const gapLengthPx = fontSize * GAP_FONT_RATIO;
  return 2 * Math.PI * radius - gapLengthPx;
}

/**
 * Tamaño de fuente más grande que el cuerpo de las letras puede tener sin
 * sobresalir en sentido radial más allá de lo que permite el margen de
 * manipulación (ver `maxTextGlyphHeight` en virola.config.ts y
 * `TEXT_RADIAL_MARGIN_PX` acá arriba). Es un límite GEOMÉTRICO, independiente
 * de `MAX_FONT_SIZE` (que es una preferencia de diseño) — se usa el más
 * chico de los dos.
 *
 * Antes no incluía ningún margen (el texto tenía que quedar siempre
 * ENTERAMENTE dentro de la banda física, sin excepción) — eso topaba el
 * tamaño real bastante antes del `MAX_FONT_SIZE` de diseño (con las medidas
 * actuales, en 35 en vez de 40). Con el margen (mismo concepto que
 * `ICON_MARGIN_PX` para íconos: se permite invadir levemente Ø72/Ø94, nunca
 * salir por completo), el techo real sube — un texto grande ahora puede
 * ocupar tanta franja como un ícono grande, en vez de quedar visualmente más
 * chico por una regla más estricta.
 */
export function getEffectiveMaxFontSize(config: VirolaConfig): number {
  const radialCeiling = Math.floor((config.maxTextGlyphHeight + TEXT_RADIAL_MARGIN_PX) / GLYPH_HEIGHT_RATIO);
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, radialCeiling));
}

/**
 * Radio (px) que el texto usa hoy para curvarse — el central de 41.5mm
 * (`config.textCurveRadius`) hasta que se lo desplace radialmente (ver
 * `curveRadius` en TEXT_CUSTOM_PROPERTIES, y `handleTextMoving` en
 * useFabricCanvas.ts, que es lo único que lo cambia, arrastrando el texto).
 */
export function getCurveRadius(textObj: IText, config: VirolaConfig): number {
  const stored = textObj.get('curveRadius');
  return typeof stored === 'number' ? stored : config.textCurveRadius;
}

/**
 * Rango de radios válidos para el texto a un tamaño de fuente dado: el
 * cuerpo de la letra (que se extiende `fontSize * GLYPH_HEIGHT_RATIO` px
 * hacia cada lado del radio, ver `pathAlign: 'center'` en `applyTextCurve`)
 * tiene que quedar dentro de la banda física ensanchada por el margen de
 * manipulación (`TEXT_RADIAL_MARGIN_PX`, igual que `getIconBandRadii` para
 * íconos). Es SIEMPRE un solo intervalo (no hace falta bisección como en
 * containment.ts: a diferencia de un ícono, el texto no rota respecto de su
 * propio radio — el alcance es el mismo en cualquier dirección, así que hay
 * una fórmula cerrada directa).
 *
 * A mayor `fontSize`, el cuerpo de la letra es más alto y el rango se
 * angosta desde los dos lados por igual — centrado siempre en
 * `config.textCurveRadius` (41.5mm): un texto GRANDE tiene poco margen para
 * alejarse del centro (tiende a quedarse ahí); uno CHICO tiene mucho más
 * (puede acercarse bastante a Ø72 o Ø94). Es exactamente el mismo
 * mecanismo que `getEffectiveMaxFontSize` usa para calcular el techo: ese
 * techo es, por definición, el `fontSize` más grande para el que este rango
 * todavía incluye el radio central.
 */
function getTextRadialRange(fontSize: number, config: VirolaConfig): { min: number; max: number } {
  const halfReach = fontSize * GLYPH_HEIGHT_RATIO;
  const innerBound = Math.max(0, config.innerRadius - TEXT_RADIAL_MARGIN_PX);
  const outerBound = config.outerRadius + TEXT_RADIAL_MARGIN_PX;
  return { min: innerBound + halfReach, max: outerBound - halfReach };
}

/**
 * Corrige un radio propuesto para que quede dentro del rango válido a un
 * tamaño de fuente dado — si el radio actual ya entra, no cambia nada; si
 * no, lo acerca al radio central (41.5mm) lo mínimo necesario. Es la
 * function que logra "al agrandar el texto, primero reacomodarlo hacia el
 * centro antes de recortar el tamaño" (ver `applyTextCurve`): como el rango
 * se angosta hacia el centro a medida que crece el tamaño de fuente,
 * simplemente volver a acotar el radio actual contra el rango del tamaño
 * NUEVO ya empuja el radio hacia adentro cuando hace falta — igual que
 * `clampIconPosition` acerca un ícono hacia el centro cuando ya no entra a
 * la escala pedida.
 *
 * Si el rango es inválido (min > max, el tamaño pedido no entra en NINGÚN
 * radio) no debería pasar nunca: `getEffectiveMaxFontSize` ya garantiza que,
 * para cualquier `fontSize` que llegue hasta acá, el rango sigue incluyendo
 * el radio central — es la misma condición, mirada desde el otro lado. El
 * respaldo (volver al centro) es solo defensivo.
 */
function clampTextCurveRadius(fontSize: number, radius: number, config: VirolaConfig): number {
  const { min, max } = getTextRadialRange(fontSize, config);
  if (min > max) {
    return config.textCurveRadius;
  }
  return Math.min(Math.max(radius, min), max);
}

/**
 * Auto-fit: encuentra el tamaño de fuente más grande, entre MIN_FONT_SIZE y
 * el tamaño pedido (`desiredFontSize`), que hace que el ANCHO REAL del
 * texto —medido de verdad por Fabric.js, no estimado por cantidad de
 * caracteres— entre en el arco disponible. Muta `textObj.fontSize`
 * directamente (nunca crea una copia/instancia paralela): es el mismo
 * objeto que se va a dibujar, así que medir sobre él es medir exactamente
 * lo que se va a ver.
 *
 * El arco disponible depende del propio tamaño de fuente que se está
 * probando (el hueco de seguridad crece/decrece con el tamaño, ver
 * `getAvailableArcLength`), así que se recalcula en cada iteración en vez
 * de una sola vez al principio.
 *
 * Como el ancho crece aproximadamente proporcional al tamaño de fuente,
 * primero se estima el tamaño con una regla de tres a partir de una
 * medición real, y después se corrige con mediciones reales adicionales
 * hasta que entra de verdad (la relación no es perfectamente lineal por
 * redondeo/hinting de fuente) — nunca se confía en la estimación sin
 * verificarla.
 *
 * IMPORTANTE — no usar `textObj.width` acá: en Fabric.js 6.0.2, en cuanto
 * un texto tiene un `path` asignado, `initDimensions()` deja de medir el
 * contenido y usa directamente `this.width = this.path.width` (el ancho de
 * la GEOMETRÍA DEL ARCO, constante, no del texto). Como este texto ya tiene
 * un path de la vez anterior que se curvó, `.width` da siempre lo mismo sin
 * importar el contenido — se descubrió probando con textos de largos muy
 * distintos y viendo que el ancho medido no cambiaba nunca. `calcTextWidth()`
 * sí mide carácter por carácter de verdad, independientemente del path.
 */
function measureRealTextWidth(textObj: IText): number {
  return textObj.calcTextWidth();
}

/**
 * `radius` ya no es siempre `config.textCurveRadius`: puede ser el radio
 * REDESPLAZADO del texto (ver `getCurveRadius`/`applyTextCurve`) — el ancho
 * disponible en el arco varía un poco con el radio (circunferencia = 2πr),
 * así que el auto-fit tiene que medir contra el radio real que se va a usar,
 * no uno fijo.
 */
function fitFontSizeToArc(textObj: IText, desiredFontSize: number, config: VirolaConfig, radius: number): void {
  const effectiveMax = getEffectiveMaxFontSize(config);
  const clampedDesired = Math.max(MIN_FONT_SIZE, Math.min(effectiveMax, desiredFontSize));

  textObj.set('fontSize', clampedDesired);
  let availableLength = getAvailableArcLength(radius, clampedDesired);
  const widthAtDesired = measureRealTextWidth(textObj) || 1;

  if (widthAtDesired <= availableLength) {
    return; // entra tal cual al tamaño pedido, no hace falta achicarlo
  }

  let candidate = Math.floor(clampedDesired * (availableLength / widthAtDesired));
  candidate = Math.max(MIN_FONT_SIZE, Math.min(effectiveMax, candidate));
  textObj.set('fontSize', candidate);

  availableLength = getAvailableArcLength(radius, candidate);
  while (measureRealTextWidth(textObj) > availableLength && candidate > MIN_FONT_SIZE) {
    candidate -= 1;
    textObj.set('fontSize', candidate);
    availableLength = getAvailableArcLength(radius, candidate);
  }
  // Si ni siquiera en MIN_FONT_SIZE entra, se queda en MIN_FONT_SIZE — ver
  // `textOverflowing` más abajo para el feedback de ese caso extremo.
}

/** true si, incluso después del auto-fit, el texto no entra en el arco disponible al radio dado. */
function computeIsOverflowing(textObj: IText, radius: number): boolean {
  const availableLength = getAvailableArcLength(radius, textObj.fontSize);
  return measureRealTextWidth(textObj) > availableLength;
}

/**
 * Aplica (o recalcula) la curvatura de un texto, incluido el auto-fit de
 * tamaño. Hay que llamarlo de nuevo cada vez que cambia algo que afecta el
 * ancho del texto (contenido, tipografía, tamaño deseado) o el propio
 * estado de curvatura (dirección, posición angular), para que se re-centre
 * y re-ajuste correctamente sobre el arco.
 *
 * La posición alrededor del anillo (`curveState.offset`, en grados) se
 * aplica como rotación nativa del objeto (`textObj.angle`) — no como
 * `pathStartOffset` (eso sigue existiendo, pero ahora solo centra el texto
 * dentro de SU PROPIO arco local, un trabajo puramente interno que no
 * depende de en qué parte del anillo está posicionado el texto).
 *
 * IMPORTANTE: la asignación de "path" pasa siempre por `.set()`, nunca por
 * asignación directa (`textObj.path = path`) — la asignación directa no
 * dispara el cálculo interno de geometría de Fabric.js y el texto no se
 * curva (encontrado durante los prototipos de validación de D4).
 */
export function applyTextCurve(
  textObj: IText,
  config: VirolaConfig,
  curveState: CurveState = DEFAULT_CURVE_STATE,
): void {
  // El texto curvo es de una sola línea siempre — protección de dominio,
  // no solo del <textarea> del panel: también vale para Enter/Shift+Enter
  // tecleado directo sobre el canvas (Fabric.js dispara este mismo evento
  // central en cada input, ver `onInput` de IText) y para texto pegado con
  // saltos de línea. `\r\n` y `\n` sueltos se reemplazan por un espacio —
  // nunca se eliminan sin más, para no pegar dos palabras que estaban en
  // líneas distintas.
  if (/\r\n|\r|\n/.test(textObj.text)) {
    textObj.set('text', textObj.text.replace(/\r\n|\r|\n/g, ' '));
  }

  // Tope de caracteres — protección de dominio, no solo del <textarea> del
  // panel: también vale si el contenido cambió por edición nativa (doble
  // click sobre el canvas). Se aplica después de reemplazar los saltos de
  // línea por espacios, para que el largo que se compara contra el límite
  // sea el que el usuario realmente va a ver.
  if (textObj.text.length > MAX_TEXT_LENGTH) {
    textObj.set('text', textObj.text.slice(0, MAX_TEXT_LENGTH));
  }

  // Resolución del radio y el tamaño de fuente juntos, en dos pasadas: hay
  // una dependencia circular entre ambos (el ancho disponible en el arco
  // depende del radio; el rango de radios válidos depende del tamaño de
  // fuente, ver `getTextRadialRange`) que no tiene una única fórmula
  // cerrada. Se resuelve con punto fijo de dos iteraciones:
  //   1) se ajusta el tamaño de fuente contra el radio ACTUAL del texto
  //      (el que tenía antes de este recálculo — sin desplazar, es
  //      `config.textCurveRadius`);
  //   2) con ese tamaño ya resuelto, se acota el radio a su rango válido
  //      (esto es lo que logra "al agrandar, reacomodar hacia el centro
  //      antes de recortar el tamaño" — ver `clampTextCurveRadius`);
  //   3) como el radio pudo haber cambiado, se repite el ajuste de tamaño
  //      una vez más contra el radio ya corregido (la diferencia entre
  //      pasada 1 y 2 nunca supera `TEXT_RADIAL_MARGIN_PX`, así que esta
  //      segunda pasada converge — no hace falta iterar más).
  // Cuando el texto no está desplazado (el caso normal, radio siempre en el
  // centro), el radio no cambia entre pasadas y esto se reduce exactamente
  // al comportamiento de antes (una sola medición real, sin diferencia).
  const desiredFontSize = getDesiredFontSize(textObj);
  let radius = getCurveRadius(textObj, config);
  fitFontSizeToArc(textObj, desiredFontSize, config, radius);
  radius = clampTextCurveRadius(textObj.fontSize, radius, config);
  fitFontSizeToArc(textObj, desiredFontSize, config, radius);
  radius = clampTextCurveRadius(textObj.fontSize, radius, config);

  const overflowing = computeIsOverflowing(textObj, radius);
  const angleDeg = normalizeAngleDeg(curveState.offset);

  const gapDeg = getGapAngleDeg(radius, textObj.fontSize);
  const path = new Path(buildArcPath(radius, gapDeg), { visible: false });
  // calcTextWidth(), no .width — ver el comentario grande en fitFontSizeToArc.
  const textWidth = measureRealTextWidth(textObj) || 100;
  const totalPathLength = getAvailableArcLength(radius, textObj.fontSize);
  const centeredOffset = Math.max(0, (totalPathLength - textWidth) / 2);

  textObj.set({
    path,
    // "Invertir texto" cambia ÚNICAMENTE el sentido de lectura sobre la
    // circunferencia (`pathSide`) — nunca la posición radial. `pathAlign`
    // siempre es 'center': centra el cuerpo de la letra (mitad hacia
    // afuera, mitad hacia adentro) exactamente sobre `radius` (el radio de
    // 41.5mm por defecto, o el desplazado si el usuario arrastró el texto
    // radialmente — ver `getCurveRadius`/`clampTextCurveRadius`) — así el
    // texto queda centrado en su propio radio tanto normal como invertido,
    // nunca pegado al borde interior ni al exterior de ESE radio (antes se
    // alternaba entre 'baseline' y 'ascender', que apoyan la letra sobre un
    // borde vertical del glifo en vez de centrarla, y por eso el cuerpo
    // quedaba pegado a un lado — corregido en esta etapa).
    pathAlign: 'center',
    pathSide: curveState.inverted ? 'right' : 'left',
    pathStartOffset: centeredOffset,
    angle: angleDeg,
    // Propiedades propias (no nativas de Fabric): se guardan sobre el mismo
    // objeto para poder leerlas de nuevo la próxima vez que haga falta
    // recalcular (ver getCurveState/getDesiredFontSize).
    curveInverted: curveState.inverted,
    curveOffset: angleDeg,
    curveRadius: radius,
    desiredFontSize,
    textOverflowing: overflowing,
  });
  textObj.setCoords();
}

/**
 * Versión liviana de `applyTextCurve`, usada durante el arrastre radial en
 * vivo (ver `handleTextMoving` en useFabricCanvas.ts): reconstruye el path
 * del arco a un radio nuevo sin volver a correr todo el auto-fit de tamaño
 * (el tamaño de fuente no cambia durante un arrastre, solo la posición) —
 * solo acota el radio pedido a su rango válido para el tamaño ACTUAL (ver
 * `clampTextCurveRadius`, el mismo criterio que `clampIconPosition` para
 * íconos: nunca bloquea el arrastre, lo acerca al radio central lo mínimo
 * necesario) y reconstruye la geometría del arco a ese radio.
 */
export function setTextCurveRadius(textObj: IText, radius: number, config: VirolaConfig): void {
  const clampedRadius = clampTextCurveRadius(textObj.fontSize, radius, config);
  const gapDeg = getGapAngleDeg(clampedRadius, textObj.fontSize);
  const path = new Path(buildArcPath(clampedRadius, gapDeg), { visible: false });
  const textWidth = measureRealTextWidth(textObj) || 100;
  const totalPathLength = getAvailableArcLength(clampedRadius, textObj.fontSize);
  const centeredOffset = Math.max(0, (totalPathLength - textWidth) / 2);
  const overflowing = computeIsOverflowing(textObj, clampedRadius);

  textObj.set({
    path,
    pathStartOffset: centeredOffset,
    curveRadius: clampedRadius,
    textOverflowing: overflowing,
  });
  textObj.setCoords();
}

/**
 * Recorta visualmente el texto al anillo real Ø72–Ø94 cuando NO está
 * seleccionado (mismo mecanismo y misma máscara que los íconos, ver
 * `setIconVisibilityClip` en iconElement.ts) — cuando está seleccionado se
 * ve completo, aunque el margen de manipulación (`TEXT_RADIAL_MARGIN_PX`)
 * lo tenga levemente desplazado más allá de Ø72 o Ø94. Puramente visual: no
 * mueve, escala ni cambia la curvatura del texto — solo su `clipPath`.
 */
export function setTextVisibilityClip(textObj: IText, isSelected: boolean, config: VirolaConfig): void {
  textObj.clipPath = isSelected ? undefined : createRingVisibilityMask(config);
  textObj.dirty = true;
}

/**
 * Crea un nuevo texto curvo, centrado sobre la virola según VirolaConfig.
 *
 * `lockMovementX/Y` en `false`: a diferencia de la Etapa 5 (P0), el texto
 * ahora SÍ se puede arrastrar — pero arrastrarlo no mueve realmente
 * `left`/`top` (eso se revierte al centro de la virola en cada evento,
 * ver `handleTextMoving` en `useFabricCanvas.ts`): lo que el arrastre
 * termina cambiando de verdad es el ángulo (`curveOffset`) y, desde esta
 * etapa, también el radio (`curveRadius`, dentro de su rango válido para el
 * tamaño de fuente actual — ver `getTextRadialRange`), nunca la posición del
 * objeto en sí. El pivote sigue siendo siempre el centro exacto de la
 * virola, que es lo que garantiza que el modelo entero de texto curvo
 * (`maxTextGlyphHeight`, auto-fit) siga siendo válido a cualquier ángulo —
 * nunca se convierte en un objeto libre de X/Y.
 *
 * `lockScalingX/Y` siguen bloqueados: el tamaño tiene su propio mecanismo
 * aprobado (`desiredFontSize` + auto-fit de Etapa 3), nunca manijas de
 * esquina. `lockRotation` también sigue bloqueado — la rotación real del
 * objeto (`.angle`) existe y cambia, pero solo mediante el cálculo
 * controlado de `handleTextMoving`, nunca a mano por una manija nativa
 * (eso sería, otra vez, "rotación libre del bloque de texto", fuera de
 * alcance). `hasControls: false` esconde las manijas de esquina/rotación,
 * ya que ninguna de las dos hace nada por sí sola.
 *
 * `perPixelTargetFind: true` es lo que hace que solo se pueda seleccionar
 * el texto haciendo click sobre una letra de verdad, no en cualquier punto
 * de su bounding box (que, al ser un texto sobre un arco, es mucho más
 * grande que las letras que se ven — llega a cubrir buena parte del
 * interior de la virola). Es una propiedad DEL OBJETO, no del canvas: Fabric
 * usa `canvas.perPixelTargetFind || obj.perPixelTargetFind` para decidir si
 * hay que mirar los píxeles (ver SelectableCanvas `_checkTarget`), así que
 * activarla acá no toca el comportamiento de selección de los íconos ni de
 * ningún otro objeto (`canvas.perPixelTargetFind` sigue en su default
 * `false`, que es a propósito por los íconos de solo trazo — ver el
 * comentario en `useFabricCanvas.ts`). Arrastrar el texto sigue funcionando
 * igual: el hit-test por píxel solo decide si el click INICIAL selecciona
 * el objeto, no afecta el arrastre una vez que ya está seleccionado.
 *
 * `hasBorders: false` (además de `hasControls: false`) esconde también el
 * marco rectangular que Fabric dibuja alrededor de la selección — sin
 * esto, aunque las manijas ya estaban ocultas, seguía viéndose un
 * rectángulo azul del tamaño del bounding box completo (ese bounding box
 * SIGUE existiendo puertas adentro, como necesita Fabric.js para
 * funcionar — nada de esto lo elimina, solo deja de dibujarlo). Con
 * `perPixelTargetFind` decidiendo qué click cuenta como "tocar el texto" y
 * sin ningún marco visible, seleccionar y arrastrar el texto se siente
 * como agarrar directamente las letras, no un rectángulo invisible
 * alrededor de ellas.
 *
 * `editable: false` desactiva por completo la edición nativa de Fabric
 * (entrar en modo edición con cursor/selección de caracteres al clickear un
 * texto ya seleccionado, o al doble click) — internamente, `enterEditing()`
 * y los manejadores de mouse de `ITextClickBehavior` (`_mouseDownHandler`,
 * `mouseUpHandler`) chequean `this.editable` antes de hacer nada, así que
 * ponerlo en `false` cierra todos esos caminos a la vez, no solo el doble
 * click. El contenido ahora se edita exclusivamente desde React
 * (`TextEditorPanel`, vía `actions.updateSelectedTextContent`), nunca
 * tecleando directo sobre el canvas — por eso ya no hace falta el ajuste de
 * `getSelectionStartFromPointer` que existía acá antes (posicionar un
 * cursor nativo sobre la curva): con `editable: false`, Fabric nunca llega
 * a llamarlo (queda gateado detrás del mismo chequeo).
 */
/**
 * Bloqueo de interacción nativa de Fabric.js que debe tener SIEMPRE un texto
 * curvo — ver el comentario grande de `createCurvedText`, arriba, para el
 * porqué de cada propiedad puntual.
 *
 * Etapa 14A (bug de restauración después de Undo): extraída a su propia
 * función porque `canvas.loadFromJSON` (dentro de `restoreDesign`,
 * `actions.ts`) reconstruye el texto de forma GENÉRICA a partir del JSON
 * serializado — nunca pasa por `createCurvedText` — y estas propiedades NO
 * viajan en ese JSON (no son parte de lo que `Fabric.js` serializa por
 * defecto, ni están en `TEXT_CUSTOM_PROPERTIES`). Sin volver a aplicarlas
 * después de restaurar, el texto reconstruido queda con los VALORES POR
 * DEFECTO de Fabric.js (`hasControls`/`hasBorders`/`editable`: `true`,
 * `lockScalingX`/`lockScalingY`/`lockRotation`: `false`,
 * `perPixelTargetFind`: `false`) — el rectángulo de selección nativo
 * reaparece, el texto vuelve a ser editable con doble click, y sobre todo:
 * las manijas nativas de escalar/rotar vuelven a estar disponibles Y
 * FUNCIONALES, sin ningún control de contención (`useFabricCanvas.ts` nunca
 * necesitó un handler de `object:scaling`/`object:rotating` para texto,
 * porque ese gesto era imposible de disparar — quedaba bloqueado acá) — así
 * es como un texto restaurado puede terminar completamente deformado o
 * fuera del área de la virola. Mismo patrón ya usado para el recorte visual
 * (ver `setTextVisibilityClip`, llamada también después de restaurar) — acá
 * se suma esta función al mismo lugar (`restoreDesign`, `actions.ts`).
 */
export function applyTextInteractionLocks(text: IText): void {
  text.set({
    perPixelTargetFind: true,
    lockMovementX: false,
    lockMovementY: false,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
    hasBorders: false,
    editable: false,
  });
}

export function createCurvedText(config: VirolaConfig): IText {
  const text = new IText(DEFAULT_TEXT, {
    left: config.width / 2,
    top: config.height / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: DEFAULT_FONT_FAMILY,
    fill: DESIGN_INK_COLOR,
  });
  applyTextInteractionLocks(text);

  // Un texto nuevo nace pidiendo el tamaño MÁXIMO posible: sin nada guardado
  // todavía, `getDesiredFontSize` (dentro de `applyTextCurve`) ya cae sola en
  // `MAX_FONT_SIZE` — no hace falta fijar nada acá a mano. `fitFontSizeToArc`
  // (sin tocar) recorta ese pedido al tamaño real más grande que entra en el
  // arco disponible para "TU TEXTO" a ese ángulo — el resultado es el
  // tamaño DEFINITIVO desde el primer render, nunca una animación posterior.
  applyTextCurve(text, config, DEFAULT_CURVE_STATE);
  return text;
}

/** Type guard: el objeto es un texto editable (IText). */
export function isTextObject(object: FabricObject | null | undefined): object is IText {
  return !!object && object.type === 'i-text';
}

/** Estado mínimo de UI derivado de un texto seleccionado (ver EditorSelection). */
export function toTextSelection(textObj: IText): EditorSelection {
  const curveState = getCurveState(textObj);
  const overflowing = textObj.get('textOverflowing');
  return {
    type: 'text',
    text: textObj.text,
    fontFamily: textObj.fontFamily,
    fontSize: textObj.fontSize,
    desiredFontSize: getDesiredFontSize(textObj),
    isOverflowing: typeof overflowing === 'boolean' ? overflowing : false,
    inverted: curveState.inverted,
    curveOffset: curveState.offset,
  };
}
