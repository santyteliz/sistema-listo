import { useEffect, useRef } from 'react';
import type { IconPaintMode, IconLayer } from './iconLibrary';
import { getIconPaintProps, getIconLayerPaintProps } from './iconPaintProps';

/**
 * Lo mínimo que este componente necesita para dibujar un ícono —
 * estructuralmente compatible con `IconAsset` (`iconCatalog.ts`) e
 * `IconDefinition` (`iconLibrary.ts`) por igual (ambos son supersets de
 * esto), así que sirve tanto para un ícono recién construido en
 * `IconLibraryDrawer.tsx` (`IconAsset`) como para uno derivado en vivo de
 * un objeto Fabric ya seleccionado en `IconEditorPanel.tsx`
 * (`IconDefinition`, vía `getSelectedIconRuntimeDefinition`).
 */
export interface IconGeometrySource {
  svgPath: string;
  paintMode: IconPaintMode;
  fillRule: 'nonzero' | 'evenodd';
  strokeWidth?: number;
  layers?: IconLayer[];
}

/**
 * Preview de un ícono — Etapa 8E. Componente COMPARTIDO entre
 * `IconLibraryDrawer.tsx` (vista de upload) y `IconEditorPanel.tsx` (panel
 * lateral): antes cada uno dibujaba su propio `<svg><path/></svg>` por
 * separado — a partir de esta etapa los dos usan ESTE componente, para que
 * nunca puedan quedar dos técnicas de preview distintas mostrando cosas
 * distintas entre sí (pedido explícito de esta etapa, Paso 10).
 *
 * Dos casos:
 *
 * - Ícono SIMPLE (`layers` ausente, el 100% del catálogo y los legacy):
 *   un único `fill`/`stroke`, sin ninguna composición entre capas — un
 *   `<svg><path/></svg>` declarativo alcanza y sigue siendo el más simple
 *   (nunca hace falta canvas para esto).
 * - Ícono COMPUESTO (`layers` presente, SVG subidos con varias capas de
 *   pintado — ver `IconLayer`, `iconLibrary.ts`): SVG declarativo NO puede
 *   expresar "esta capa revela lo pintado antes" (`destination-out`) de
 *   forma nativa — se usa un `<canvas>` chico + Canvas2D, pintando cada
 *   capa EN ORDEN con el mismo `globalCompositeOperation` que
 *   `iconElement.ts` aplica en Fabric (`getIconLayerPaintProps`, la MISMA
 *   función — nunca una segunda decisión de "qué significa ink/paper").
 *   El fondo del `<canvas>` es transparente a propósito: una capa `paper`
 *   revela lo que haya DETRÁS (acá, el fondo neutro del preview; en el
 *   editor real, la textura de la virola) — nunca introduce blanco real.
 */

const REFERENCE_VIEWBOX_SIZE = 100;
const CANVAS_PIXEL_SIZE = 200; // 2x el viewBox de referencia, para que se vea nítido sin depender de devicePixelRatio.

function CompoundPreviewCanvas({ layers }: { layers: IconLayer[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(CANVAS_PIXEL_SIZE / REFERENCE_VIEWBOX_SIZE, CANVAS_PIXEL_SIZE / REFERENCE_VIEWBOX_SIZE);
    for (const layer of layers) {
      const paintProps = getIconLayerPaintProps(layer);
      ctx.globalCompositeOperation = paintProps.globalCompositeOperation;
      ctx.fillStyle = paintProps.fill;
      const path2d = new Path2D(layer.d);
      ctx.fill(path2d, layer.fillRule);
    }
    ctx.restore();
  }, [layers]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_PIXEL_SIZE}
      height={CANVAS_PIXEL_SIZE}
      className="icon-geometry-preview__canvas"
      aria-hidden="true"
    />
  );
}

export function IconGeometryPreview({ icon }: { icon: IconGeometrySource }) {
  if (icon.layers && icon.layers.length > 0) {
    return <CompoundPreviewCanvas layers={icon.layers} />;
  }
  const paintProps = getIconPaintProps(icon);
  return (
    <svg viewBox={`0 0 ${REFERENCE_VIEWBOX_SIZE} ${REFERENCE_VIEWBOX_SIZE}`} aria-hidden="true" className="icon-geometry-preview__svg">
      <path
        d={icon.svgPath}
        fill={paintProps.fill ?? 'none'}
        stroke={paintProps.stroke ?? 'none'}
        fillRule={paintProps.fillRule}
        strokeWidth={paintProps.strokeWidth}
      />
    </svg>
  );
}
