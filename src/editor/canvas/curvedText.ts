import { IText, Path, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';

/**
 * Texto curvo sobre la virola. Usa la funcionalidad nativa de Fabric.js
 * "texto sobre un path" (ver docs/DECISIONS.md, D4) — nunca una simulación
 * visual con CSS/SVG externo. La geometría de la curva sale siempre de
 * `VirolaConfig`, nunca de un número hardcodeado acá ni en un componente.
 */

const DEFAULT_TEXT = 'TU TEXTO';
const DEFAULT_FONT_SIZE = 32;
const DEFAULT_FONT_FAMILY = 'Georgia, serif';
const DEFAULT_FILL = '#222222';

function buildArcPath(radius: number): string {
  // Semicírculo de (-radius, 0) a (radius, 0), pasando por arriba.
  return `M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`;
}

/**
 * Aplica (o recalcula) la curvatura de un texto. Hay que llamarlo de nuevo
 * cada vez que cambia el contenido del texto, porque el ancho cambia y el
 * texto necesita re-centrarse sobre el arco.
 *
 * IMPORTANTE: la asignación de "path" pasa siempre por `.set()`, nunca por
 * asignación directa (`textObj.path = path`) — la asignación directa no
 * dispara el cálculo interno de geometría de Fabric.js y el texto no se
 * curva (encontrado durante los prototipos de validación de D4).
 */
export function applyTextCurve(textObj: IText, radius: number): void {
  const path = new Path(buildArcPath(radius), { visible: false });
  const textWidth = textObj.width || 100;
  const arcLength = Math.PI * radius;

  textObj.set({
    path,
    pathSide: 'left',
    pathAlign: 'baseline',
    pathStartOffset: Math.max(0, (arcLength - textWidth) / 2),
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

  applyTextCurve(text, config.textCurveRadius);
  return text;
}

/** Type guard: el objeto es un texto editable (IText). */
export function isTextObject(object: FabricObject | null | undefined): object is IText {
  return !!object && object.type === 'i-text';
}
