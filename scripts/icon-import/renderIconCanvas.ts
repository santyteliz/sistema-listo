/**
 * Render de un ícono sobre un `CanvasRenderingContext2D` de Node
 * (`@napi-rs/canvas`) — Etapa 4 del plan de biblioteca de íconos.
 *
 * ÚNICA pieza de código que dibuja thumbnails, usada tanto por
 * `runImport.ts` (importador completo) como por cualquier script de
 * muestra/piloto — para que nunca vuelva a pasar lo que motivó esta etapa
 * (el thumbnail mostrando algo distinto de lo que Fabric.js termina
 * dibujando en el navegador). La decisión de QUÉ pintar (relleno vs. trazo,
 * qué color, qué fillRule, qué ancho) viene de `getIconPaintProps`
 * (`src/editor/icons/iconPaintProps.ts`) — la MISMA función que usa
 * `iconElement.ts` (`createIconObject`) para configurar el `fabric.Path`
 * real. Acá solo se adapta esa decisión a las llamadas concretas de
 * `CanvasRenderingContext2D` (`ctx.fill(path, fillRule)` / `ctx.stroke()`),
 * que es la única parte que necesariamente difiere entre Node y el
 * navegador (Fabric.js hace, internamente, exactamente las mismas llamadas
 * — ver `_renderFill`/`_renderStroke` en `node_modules/fabric/dist/index.js`,
 * confirmado leyendo el código fuente real en el diseño técnico de esta
 * etapa).
 */
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { getIconPaintProps } from '../../src/editor/icons/iconPaintProps.ts';
import type { IconPaintMode } from '../../src/editor/icons/iconLibrary.ts';

export interface RenderableIcon {
  svgPath: string;
  paintMode: IconPaintMode;
  fillRule: 'nonzero' | 'evenodd';
  strokeWidth?: number;
}

/**
 * Dibuja un ícono ya normalizado (viewBox `0 0 100 100`) en un canvas
 * cuadrado de `size`x`size` píxeles, fondo blanco — devuelve el buffer PNG
 * listo para escribir a disco. No recibe ningún color de fondo/tinta como
 * parámetro: usa siempre los mismos que Fabric (`DESIGN_INK_COLOR`, vía
 * `getIconPaintProps`) para que la comparación visual sea directa.
 */
export function renderIconToPngBuffer(icon: RenderableIcon, size: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.scale(size / 100, size / 100);
  const path2d = new Path2D(icon.svgPath);
  const paintProps = getIconPaintProps(icon);
  if (paintProps.fill) {
    ctx.fillStyle = paintProps.fill;
    ctx.fill(path2d, paintProps.fillRule);
  }
  if (paintProps.stroke) {
    ctx.strokeStyle = paintProps.stroke;
    ctx.lineWidth = paintProps.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path2d);
  }
  ctx.restore();

  return canvas.toBuffer('image/png');
}
