import { Circle, Line, type Canvas, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';

/**
 * Guías visuales del editor: el contorno de la virola y las ayudas de
 * alineación/curvatura. Nunca son parte del diseño real del usuario —
 * quedan marcadas como no seleccionables, no interactivas, y excluidas de
 * la exportación de Fabric.js (`excludeFromExport`), para que cuando más
 * adelante se serialice el diseño (`canvas.toJSON()`), estos objetos no
 * aparezcan en el resultado.
 */

const VIROLA_STROKE = '#8a8680';
const GUIDE_STROKE = '#b3b0a8';

function asGuide<T extends FabricObject>(object: T): T {
  object.set({
    selectable: false,
    evented: false,
    excludeFromExport: true,
    hoverCursor: 'default',
  });
  return object;
}

/** Contorno físico de la virola (radio interior + exterior), no editable. */
function drawVirolaOutline(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): void {
  const outer = asGuide(
    new Circle({
      left: centerX - config.outerRadius,
      top: centerY - config.outerRadius,
      radius: config.outerRadius,
      fill: '',
      stroke: VIROLA_STROKE,
      strokeWidth: 2,
    }),
  );

  const inner = asGuide(
    new Circle({
      left: centerX - config.innerRadius,
      top: centerY - config.innerRadius,
      radius: config.innerRadius,
      fill: '',
      stroke: VIROLA_STROKE,
      strokeWidth: 1,
    }),
  );

  canvas.add(outer, inner);
}

/** Cruz de alineación central (horizontal + vertical). */
function drawAlignmentCross(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): void {
  const horizontal = asGuide(
    new Line([0, centerY, config.width, centerY], {
      stroke: GUIDE_STROKE,
      strokeDashArray: [4, 4],
    }),
  );

  const vertical = asGuide(
    new Line([centerX, 0, centerX, config.height], {
      stroke: GUIDE_STROKE,
      strokeDashArray: [4, 4],
    }),
  );

  canvas.add(horizontal, vertical);
}

/** Guía circular punteada: el arco por defecto donde va a curvarse el texto. */
function drawTextCurveGuide(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): void {
  const curveGuide = asGuide(
    new Circle({
      left: centerX - config.textCurveRadius,
      top: centerY - config.textCurveRadius,
      radius: config.textCurveRadius,
      fill: '',
      stroke: GUIDE_STROKE,
      strokeDashArray: [3, 5],
    }),
  );

  canvas.add(curveGuide);
}

/** Dibuja todas las guías del editor en el canvas dado. */
export function renderGuides(canvas: Canvas, config: VirolaConfig): void {
  const centerX = config.width / 2;
  const centerY = config.height / 2;

  drawVirolaOutline(canvas, config, centerX, centerY);
  drawAlignmentCross(canvas, config, centerX, centerY);
  drawTextCurveGuide(canvas, config, centerX, centerY);
}
