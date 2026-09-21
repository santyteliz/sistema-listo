import { Circle, Gradient, Line, Shadow, type Canvas, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';

/**
 * Guías visuales del editor: el contorno de la virola y las ayudas de
 * alineación/curvatura. Nunca son parte del diseño real del usuario —
 * quedan marcadas como no seleccionables, no interactivas, y excluidas de
 * la exportación de Fabric.js (`excludeFromExport`), para que cuando más
 * adelante se serialice el diseño (`canvas.toJSON()`), estos objetos no
 * aparezcan en el resultado.
 */

const VIROLA_STROKE = '#74756f';
const GUIDE_STROKE = 'rgba(104, 106, 101, 0.28)';

/**
 * La virola es una capa de PRESENTACION del lienzo: estos fills y sombras
 * viven en objetos Fabric no interactivos y excluidos de exportacion. La
 * geometria sigue saliendo integramente de `VirolaConfig`; texto, iconos y
 * lineas circulares continúan siendo sus propios objetos editables.
 */
function createMetallicFill(config: VirolaConfig, centerX: number, centerY: number) {
  return new Gradient({
    type: 'radial',
    gradientUnits: 'pixels',
    coords: {
      x1: centerX - config.outerRadius * 0.28,
      y1: centerY - config.outerRadius * 0.38,
      r1: 0,
      x2: centerX,
      y2: centerY,
      r2: config.outerRadius,
    },
    colorStops: [
      { offset: 0, color: '#ffffff' },
      { offset: 0.3, color: '#f0f1ee' },
      { offset: 0.68, color: '#c8cac4' },
      { offset: 1, color: '#9da09a' },
    ],
  });
}

/**
 * Superficie visible del mate debajo de la virola. El degradado es
 * concentricamente radial para conservar una lectura circular limpia en
 * cualquier viewport: ilumina apenas el centro y se vuelve más cálido hacia
 * el encuentro con el metal, sin introducir una dirección artificial.
 */
function createMateInteriorFill(config: VirolaConfig, centerX: number, centerY: number) {
  return new Gradient({
    type: 'radial',
    gradientUnits: 'pixels',
    coords: {
      x1: centerX,
      y1: centerY,
      r1: 0,
      x2: centerX,
      y2: centerY,
      r2: config.innerRadius,
    },
    colorStops: [
      { offset: 0, color: '#e4d5b1' },
      { offset: 0.68, color: '#dcc99f' },
      { offset: 1, color: '#c8af80' },
    ],
  });
}

function asGuide<T extends FabricObject>(object: T): T {
  object.set({
    selectable: false,
    evented: false,
    excludeFromExport: true,
    hoverCursor: 'default',
  });
  return object;
}

/**
 * Material de la virola. Se construye con capas Fabric nativas (no una
 * imagen plana): disco metalico, reflejo perimetral y superficie interior.
 * El disco interior tapa el centro del exterior y deja visible exactamente la
 * banda fisica entre ambos radios. Todos los objetos se mandan al fondo al
 * finalizar `renderGuides`, algo esencial al restaurar un diseño ya guardado.
 */
function drawVirolaMaterial(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): FabricObject[] {
  const outerBase = asGuide(
    new Circle({
      left: centerX - config.outerRadius,
      top: centerY - config.outerRadius,
      radius: config.outerRadius,
      fill: createMetallicFill(config, centerX, centerY),
      shadow: new Shadow({ color: 'rgba(22, 15, 13, 0.16)', blur: 22, offsetX: 0, offsetY: 12 }),
    }),
  );

  const outerHighlight = asGuide(
    new Circle({
      left: centerX - (config.outerRadius - 5),
      top: centerY - (config.outerRadius - 5),
      radius: config.outerRadius - 5,
      fill: '',
      stroke: 'rgba(255, 255, 255, 0.68)',
      strokeWidth: 1,
    }),
  );

  const innerSurface = asGuide(
    new Circle({
      left: centerX - config.innerRadius,
      top: centerY - config.innerRadius,
      radius: config.innerRadius,
      fill: createMateInteriorFill(config, centerX, centerY),
      stroke: 'rgba(93, 79, 52, 0.56)',
      strokeWidth: 1.45,
      shadow: new Shadow({ color: 'rgba(52, 41, 23, 0.18)', blur: 9, offsetX: 0, offsetY: 3 }),
    }),
  );

  const materialSeam = asGuide(
    new Circle({
      left: centerX - (config.innerRadius + 3),
      top: centerY - (config.innerRadius + 3),
      radius: config.innerRadius + 3,
      fill: '',
      stroke: 'rgba(71, 70, 62, 0.46)',
      strokeWidth: 1.2,
    }),
  );

  const innerLip = asGuide(
    new Circle({
      left: centerX - (config.innerRadius + 4),
      top: centerY - (config.innerRadius + 4),
      radius: config.innerRadius + 4,
      fill: '',
      stroke: 'rgba(255, 255, 255, 0.54)',
      strokeWidth: 1,
    }),
  );

  const material = [outerBase, outerHighlight, innerSurface, materialSeam, innerLip];
  canvas.add(...material);
  return material;
}

/** Contorno físico de la virola (radio interior + exterior), no editable. */
function drawVirolaOutline(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): FabricObject[] {
  const outer = asGuide(
    new Circle({
      left: centerX - config.outerRadius,
      top: centerY - config.outerRadius,
      radius: config.outerRadius,
      fill: '',
      stroke: VIROLA_STROKE,
      strokeWidth: 1.45,
    }),
  );

  const inner = asGuide(
    new Circle({
      left: centerX - config.innerRadius,
      top: centerY - config.innerRadius,
      radius: config.innerRadius,
      fill: '',
      stroke: VIROLA_STROKE,
      strokeWidth: 1.15,
    }),
  );

  canvas.add(outer, inner);
  return [outer, inner];
}

/** Cruz de alineación central (horizontal + vertical). */
function drawAlignmentCross(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): FabricObject[] {
  const horizontal = asGuide(
    new Line([0, centerY, config.width, centerY], {
      stroke: GUIDE_STROKE,
      strokeWidth: 1,
      strokeDashArray: [3, 6],
    }),
  );

  const vertical = asGuide(
    new Line([centerX, 0, centerX, config.height], {
      stroke: GUIDE_STROKE,
      strokeWidth: 1,
      strokeDashArray: [3, 6],
    }),
  );

  canvas.add(horizontal, vertical);
  return [horizontal, vertical];
}

/** Guía circular punteada: el arco por defecto donde va a curvarse el texto. */
function drawTextCurveGuide(
  canvas: Canvas,
  config: VirolaConfig,
  centerX: number,
  centerY: number,
): FabricObject[] {
  const curveGuide = asGuide(
    new Circle({
      left: centerX - config.textCurveRadius,
      top: centerY - config.textCurveRadius,
      radius: config.textCurveRadius,
      fill: '',
      stroke: GUIDE_STROKE,
      strokeWidth: 1,
      strokeDashArray: [2, 6],
    }),
  );

  canvas.add(curveGuide);
  return [curveGuide];
}

/** Dibuja todas las guías del editor en el canvas dado. */
export function renderGuides(canvas: Canvas, config: VirolaConfig): void {
  const centerX = config.width / 2;
  const centerY = config.height / 2;

  const guides = [
    ...drawVirolaMaterial(canvas, config, centerX, centerY),
    ...drawVirolaOutline(canvas, config, centerX, centerY),
    ...drawAlignmentCross(canvas, config, centerX, centerY),
    ...drawTextCurveGuide(canvas, config, centerX, centerY),
  ];

  // `restoreDesign()` recompone los objetos editables ANTES de las guías.
  // Al enviar estas capas al fondo preservamos el mismo orden visual tanto
  // al iniciar el editor como al restaurar/rehacer, sin tocar los objetos de
  // usuario ni su sistema de seleccion.
  guides.slice().reverse().forEach((guide) => canvas.sendObjectToBack(guide));
}
