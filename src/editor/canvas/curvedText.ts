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
const DEFAULT_FONT_SIZE = 32;
const DEFAULT_FILL = '#222222';

export const MIN_FONT_SIZE = 16;
export const MAX_FONT_SIZE = 72;

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
 * v5) — para serializar esto hay que usar `canvas.toObject(CURVE_CUSTOM_PROPERTIES)`
 * en su lugar, que sí la acepta y produce una estructura igualmente
 * compatible con `loadFromJSON()` (verificado en Chrome real).
 */
export const CURVE_CUSTOM_PROPERTIES = ['curveInverted', 'curveOffset'] as const;

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

/**
 * Aplica (o recalcula) la curvatura de un texto. Hay que llamarlo de nuevo
 * cada vez que cambia algo que afecta el ancho del texto (contenido,
 * tipografía, tamaño) o el propio estado de curvatura (dirección,
 * corrimiento), para que se re-centre correctamente sobre el arco.
 *
 * IMPORTANTE: la asignación de "path" pasa siempre por `.set()`, nunca por
 * asignación directa (`textObj.path = path`) — la asignación directa no
 * dispara el cálculo interno de geometría de Fabric.js y el texto no se
 * curva (encontrado durante los prototipos de validación de D4).
 */
export function applyTextCurve(
  textObj: IText,
  radius: number,
  curveState: CurveState = DEFAULT_CURVE_STATE,
): void {
  const path = new Path(buildArcPath(radius, curveState.inverted), { visible: false });
  const textWidth = textObj.width || 100;
  const arcLength = Math.PI * radius;
  const centeredOffset = Math.max(0, (arcLength - textWidth) / 2);

  textObj.set({
    path,
    pathSide: 'left',
    pathAlign: 'baseline',
    pathStartOffset: centeredOffset + curveState.offset,
    // Propiedades propias (no nativas de Fabric): se guardan sobre el mismo
    // objeto para poder leerlas de nuevo la próxima vez que haga falta
    // recalcular la curva (ver getCurveState).
    curveInverted: curveState.inverted,
    curveOffset: curveState.offset,
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
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    fill: DEFAULT_FILL,
  });

  applyTextCurve(text, config.textCurveRadius, DEFAULT_CURVE_STATE);
  return text;
}

/** Type guard: el objeto es un texto editable (IText). */
export function isTextObject(object: FabricObject | null | undefined): object is IText {
  return !!object && object.type === 'i-text';
}

/** Estado mínimo de UI derivado de un texto seleccionado (ver EditorSelection). */
export function toTextSelection(textObj: IText): EditorSelection {
  const curveState = getCurveState(textObj);
  return {
    type: 'text',
    text: textObj.text,
    fontFamily: textObj.fontFamily,
    fontSize: textObj.fontSize,
    inverted: curveState.inverted,
    curveOffset: curveState.offset,
  };
}
