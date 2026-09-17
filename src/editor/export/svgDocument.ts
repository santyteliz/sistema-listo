/**
 * Ensambla el documento SVG final de producción — Etapa 10. PURO: recibe
 * geometría ya extraída (en coordenadas absolutas del canvas, px) más la
 * escala mm↔px del proyecto, y arma un único `<svg>` con dimensiones
 * FÍSICAS reales (`width`/`height` en mm, `viewBox` en las mismas unidades)
 * — nunca asume que los píxeles del canvas equivalen a mm (pedido
 * explícito de esta etapa): la conversión sale siempre de
 * `config.mmToPx` (`virola.config.ts`), la única fuente de verdad ya
 * establecida en el proyecto para esa relación.
 *
 * Un único `<g transform="...">` envuelve TODO el contenido, convirtiendo
 * de una sola vez el espacio de coordenadas del canvas (centrado en
 * `config.width/2, config.height/2`) al espacio de la página en mm
 * (centrado en `outerDiameterMm/2, outerDiameterMm/2`) — así ningún shape
 * individual necesita su propia conversión de unidades, evitando
 * duplicar esa cuenta en cada uno.
 *
 * Nunca interpreta ni ejecuta el contenido de los `d`/texto que recibe —
 * son siempre datos geométricos ya validados (paths) o texto plano
 * (escapado acá mismo antes de insertarlo, ver `escapeXml`) — mismo
 * principio de seguridad que el resto del proyecto (nunca `innerHTML`,
 * nunca contenido no controlado insertado directo).
 */
import type { VirolaConfig } from '../../config/virola.config';
import { computeCanvasToPageTransform } from './exportPathGeometry';

export interface FillShapeSpec {
  kind: 'fill';
  d: string;
  fillRule: 'nonzero' | 'evenodd';
  fill: string;
}

export interface StrokeShapeSpec {
  kind: 'stroke';
  d: string;
  strokeWidth: number;
  stroke: string;
}

export interface TextShapeSpec {
  kind: 'text';
  id: string;
  pathD: string;
  content: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  side: 'left' | 'right';
  startOffset: number;
}

export type SvgShapeSpec = FillShapeSpec | StrokeShapeSpec | TextShapeSpec;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function renderShape(shape: SvgShapeSpec): string {
  if (shape.kind === 'fill') {
    return `<path d="${shape.d}" fill="${escapeXml(shape.fill)}" fill-rule="${shape.fillRule}" />`;
  }
  if (shape.kind === 'stroke') {
    return `<path d="${shape.d}" fill="none" stroke="${escapeXml(shape.stroke)}" stroke-width="${round(shape.strokeWidth)}" />`;
  }
  // 'text': el `d` del arco guía se declara una sola vez en <defs> y el
  // <text> lo referencia por id — evita repetir la geometría del arco dos
  // veces en el archivo.
  return (
    `<defs><path id="${shape.id}" d="${shape.pathD}" /></defs>` +
    `<text font-family="${escapeXml(shape.fontFamily)}" font-size="${round(shape.fontSize)}" fill="${escapeXml(shape.fill)}">` +
    `<textPath href="#${shape.id}" side="${shape.side}" startOffset="${round(shape.startOffset)}">${escapeXml(shape.content)}</textPath>` +
    `</text>`
  );
}

/**
 * Arma el documento SVG completo. `shapes` deben venir en el MISMO orden de
 * pintado que el diseño real (mismo criterio que el resto del proyecto:
 * `iconElement.ts`/`svgIconExtractor.ts` nunca reordenan capas) — acá
 * simplemente se serializan en el orden recibido, sin ninguna lógica de
 * z-index propia.
 */
export function buildSvgDocument(shapes: readonly SvgShapeSpec[], config: VirolaConfig): string {
  const pageSizeMm = config.outerDiameterMm;
  const { scale: mmPerPx, canvasCenterPx: centerPx, pageCenterMm } = computeCanvasToPageTransform(config);

  // translate(a) scale(b) translate(c) — aplicado de derecha a izquierda a
  // cada punto: primero centra el origen del canvas (resta centerPx),
  // después escala de px a mm, y por último traslada al centro de la
  // página en mm. Un único transform para TODO el contenido (ver el
  // comentario grande del archivo). Misma fuente de verdad que usa
  // `pdfDocument.ts` (Etapa 12B) — ver `computeCanvasToPageTransform`.
  const transform = `translate(${round(pageCenterMm)},${round(pageCenterMm)}) scale(${mmPerPx}) translate(${round(-centerPx.x)},${round(-centerPx.y)})`;

  const body = shapes.map(renderShape).join('\n    ');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${pageSizeMm}mm" height="${pageSizeMm}mm" viewBox="0 0 ${pageSizeMm} ${pageSizeMm}">\n` +
    `  <g transform="${transform}">\n` +
    `    ${body}\n` +
    `  </g>\n` +
    `</svg>\n`
  );
}
