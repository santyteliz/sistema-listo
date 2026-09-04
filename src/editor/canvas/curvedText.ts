import { IText, Path, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { DEFAULT_FONT_FAMILY } from '../fonts/fontLibrary';
import type { EditorSelection } from '../state/selection';

/**
 * Texto curvo sobre la virola. Usa la funcionalidad nativa de Fabric.js
 * "texto sobre un path" (ver docs/DECISIONS.md, D4) — nunca una simulación
 * visual con CSS/SVG externo. La geometría de la curva sale siempre de
 * `VirolaConfig`, nunca de un número hardcodeado acá ni en un componente.
 */

const DEFAULT_TEXT = 'TU TEXTO';
const DEFAULT_FILL = '#222222';

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
const GLYPH_HEIGHT_RATIO = 0.78;

/**
 * Tope duro de caracteres — una red de seguridad, no el mecanismo de ajuste
 * visual (eso es el auto-fit, más abajo). Evita textos absurdamente largos
 * (ej. pegar un párrafo) independientemente de si entrarían o no en el
 * arco. Se aplica en la capa de dominio (`applyTextCurve`), no solo en el
 * `<textarea>` del panel, para que también valga si el contenido cambia
 * por edición nativa (doble click sobre el canvas).
 */
export const MAX_TEXT_LENGTH = 40;

/**
 * Qué porción del semicírculo completo se considera "disponible" para que
 * el texto la ocupe al elegir su tamaño — deja aire en ambas puntas del
 * arco a propósito (no es una tolerancia de producción: es una decisión de
 * composición del editor, igual que `textCurveRadius`/`iconPlacementRadius`
 * en virola.config.ts).
 */
const MAX_ARC_UTILIZATION = 0.85;

/**
 * "Invertir texto": no es un espejado del string (`scaleX(-1)` desalinearía
 * el texto respecto de la curva y dejaría los caracteres al revés). Lo que
 * se invierte es el sentido en que el arco se curva — de "sonrisa" a "ceño"
 * — manteniendo el texto siempre derecho y legible. Es el mismo mecanismo
 * que se validó en los prototipos de D4 (ahí llamado "dirección del arco").
 */
export interface CurveState {
  inverted: boolean;
  /** Corrimiento manual sobre el arco, en las mismas unidades que `pathStartOffset`. */
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
  'desiredFontSize',
  'textOverflowing',
] as const;

function buildArcPath(radius: number, inverted: boolean): string {
  // Semicírculo entre (-radius, 0) y (radius, 0). El sentido del barrido
  // ("sweep flag" del arco SVG) es lo único que cambia entre normal e
  // invertido — el texto sigue centrado y legible en ambos casos.
  const sweep = inverted ? 0 : 1;
  return `M ${-radius} 0 A ${radius} ${radius} 0 0 ${sweep} ${radius} 0`;
}

/** Rango razonable para el corrimiento manual sobre el arco, según la virola. */
export function getCurveOffsetRange(config: VirolaConfig): { min: number; max: number } {
  const arcLength = Math.PI * config.textCurveRadius;
  const range = arcLength / 4;
  return { min: -range, max: range };
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

/** Longitud de arco disponible para el texto (con margen), para un radio dado. */
function getAvailableArcLength(radius: number): number {
  return Math.PI * radius * MAX_ARC_UTILIZATION;
}

/**
 * Tamaño de fuente más grande que el cuerpo de las letras puede tener sin
 * sobresalir en sentido radial de la banda física de la virola (ver
 * `maxTextGlyphHeight` en virola.config.ts). Es un límite GEOMÉTRICO,
 * independiente de `MAX_FONT_SIZE` (que es una preferencia de diseño) — se
 * usa el más chico de los dos.
 */
function getEffectiveMaxFontSize(config: VirolaConfig): number {
  const radialCeiling = Math.floor(config.maxTextGlyphHeight / GLYPH_HEIGHT_RATIO);
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, radialCeiling));
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

function fitFontSizeToArc(textObj: IText, desiredFontSize: number, config: VirolaConfig): void {
  const availableLength = getAvailableArcLength(config.textCurveRadius);
  const effectiveMax = getEffectiveMaxFontSize(config);
  const clampedDesired = Math.max(MIN_FONT_SIZE, Math.min(effectiveMax, desiredFontSize));

  textObj.set('fontSize', clampedDesired);
  const widthAtDesired = measureRealTextWidth(textObj) || 1;

  if (widthAtDesired <= availableLength) {
    return; // entra tal cual al tamaño pedido, no hace falta achicarlo
  }

  let candidate = Math.floor(clampedDesired * (availableLength / widthAtDesired));
  candidate = Math.max(MIN_FONT_SIZE, Math.min(effectiveMax, candidate));
  textObj.set('fontSize', candidate);

  while (measureRealTextWidth(textObj) > availableLength && candidate > MIN_FONT_SIZE) {
    candidate -= 1;
    textObj.set('fontSize', candidate);
  }
  // Si ni siquiera en MIN_FONT_SIZE entra, se queda en MIN_FONT_SIZE — ver
  // `textOverflowing` más abajo para el feedback de ese caso extremo.
}

/** true si, incluso después del auto-fit, el texto no entra en el arco disponible. */
function computeIsOverflowing(textObj: IText, config: VirolaConfig): boolean {
  return measureRealTextWidth(textObj) > getAvailableArcLength(config.textCurveRadius);
}

/**
 * Aplica (o recalcula) la curvatura de un texto, incluido el auto-fit de
 * tamaño. Hay que llamarlo de nuevo cada vez que cambia algo que afecta el
 * ancho del texto (contenido, tipografía, tamaño deseado) o el propio
 * estado de curvatura (dirección, corrimiento), para que se re-centre y
 * re-ajuste correctamente sobre el arco.
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
  // Tope de caracteres — protección de dominio, no solo del <textarea> del
  // panel: también vale si el contenido cambió por edición nativa (doble
  // click sobre el canvas).
  if (textObj.text.length > MAX_TEXT_LENGTH) {
    textObj.set('text', textObj.text.slice(0, MAX_TEXT_LENGTH));
  }

  const radius = config.textCurveRadius;
  const desiredFontSize = getDesiredFontSize(textObj);
  fitFontSizeToArc(textObj, desiredFontSize, config);
  const overflowing = computeIsOverflowing(textObj, config);

  const path = new Path(buildArcPath(radius, curveState.inverted), { visible: false });
  // calcTextWidth(), no .width — ver el comentario grande en fitFontSizeToArc.
  const textWidth = measureRealTextWidth(textObj) || 100;
  const arcLength = Math.PI * radius;
  const centeredOffset = Math.max(0, (arcLength - textWidth) / 2);

  textObj.set({
    path,
    pathSide: 'left',
    pathAlign: 'baseline',
    pathStartOffset: centeredOffset + curveState.offset,
    // Propiedades propias (no nativas de Fabric): se guardan sobre el mismo
    // objeto para poder leerlas de nuevo la próxima vez que haga falta
    // recalcular (ver getCurveState/getDesiredFontSize).
    curveInverted: curveState.inverted,
    curveOffset: curveState.offset,
    desiredFontSize,
    textOverflowing: overflowing,
  });
  textObj.setCoords();
}

/** Crea un nuevo texto curvo, centrado sobre la virola según VirolaConfig. */
export function createCurvedText(config: VirolaConfig): IText {
  const text = new IText(DEFAULT_TEXT, {
    left: config.width / 2,
    top: config.height / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: DEFAULT_FONT_FAMILY,
    fill: DEFAULT_FILL,
  });

  // Sin desiredFontSize guardado todavía: getDesiredFontSize (dentro de
  // applyTextCurve) cae en MAX_FONT_SIZE — un texto nuevo siempre arranca
  // pidiendo el tamaño más grande posible, y el auto-fit lo achica solo si
  // hace falta (ver fitFontSizeToArc).
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
