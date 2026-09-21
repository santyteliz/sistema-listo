import { Circle, Line, Path, type Canvas, type FabricObject } from 'fabric';
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
// Tinte neutro (mismo tono que VIROLA_STROKE, muy transparente) para marcar
// la banda física real entre el radio interior y exterior. No es un color
// de marca todavía — eso es una decisión de una etapa posterior.
const BAND_FILL = 'rgba(138, 134, 128, 0.08)';

function asGuide<T extends FabricObject>(object: T): T {
  object.set({
    selectable: false,
    evented: false,
    excludeFromExport: true,
    hoverCursor: 'default',
  });
  return object;
}

/** 'd' de un círculo completo, como dos arcos semicirculares. */
function circlePathD(centerX: number, centerY: number, radius: number): string {
  return (
    `M ${centerX - radius} ${centerY} ` +
    `A ${radius} ${radius} 0 1 0 ${centerX + radius} ${centerY} ` +
    `A ${radius} ${radius} 0 1 0 ${centerX - radius} ${centerY} Z`
  );
}

/**
 * Relleno sutil de la banda física real de la virola (entre radio interior
 * y exterior): un círculo exterior y uno interior en un solo Path con
 * `fillRule: 'evenodd'`, para que el área interior se "recorte" sola y solo
 * quede pintada la banda — sin necesitar saber el color de fondo del canvas.
 */
function drawVirolaBand(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): void {
  const d = [
    circlePathD(centerX, centerY, config.outerRadius),
    circlePathD(centerX, centerY, config.innerRadius),
  ].join(' ');

  const band = asGuide(
    new Path(d, {
      fill: BAND_FILL,
      fillRule: 'evenodd',
      stroke: '',
    }),
  );

  canvas.add(band);
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

  drawVirolaBand(canvas, config, centerX, centerY);
  drawVirolaOutline(canvas, config, centerX, centerY);
  drawAlignmentCross(canvas, config, centerX, centerY);
  drawTextCurveGuide(canvas, config, centerX, centerY);
}
