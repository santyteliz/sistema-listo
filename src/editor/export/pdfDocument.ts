/**
 * Ensambla el documento PDF final de producción — Etapa 12B. Análogo a
 * `svgDocument.ts` (misma entrada: `SvgShapeSpec[]` ya en coordenadas
 * absolutas del canvas, más `VirolaConfig`) pero para PDF — nunca parsea el
 * SVG que arma `svgDocument.ts`: consume la MISMA geometría de entrada de
 * forma independiente (ver `designPdfExporter.ts`/`designExporter.ts`,
 * donde ambos formatos comparten `collectDesignShapes`).
 *
 * SISTEMA DE COORDENADAS (ver la investigación de la Etapa 12): en su modo
 * por defecto ("compat", el que usa este módulo — nunca se llama
 * `advancedAPI()`), `jsPDF` ya interpreta las coordenadas que recibe
 * `path()`/`moveTo`/etc. con origen arriba-izquierda y eje Y creciendo
 * hacia ABAJO — el mismo sistema que usan el canvas de Fabric y el SVG
 * (confirmado leyendo el código fuente de jsPDF: `transformY(y) =
 * getPageHeight() - y` en modo "compat", aplicado automáticamente puertas
 * adentro). Por eso NO hace falta ningún flip de Y acá: alcanza con la
 * MISMA matriz canvas-px → página-mm que usa el SVG
 * (`computeCanvasToPageTransform`, `exportPathGeometry.ts`) — una única
 * transformación global, aplicada igual a todas las shapes, nunca una
 * corrección por shape.
 *
 * `jspdf` es una dependencia con un bundle considerable — se importa acá
 * adentro con `import('jspdf')` dinámico (no en el top-level del módulo)
 * para que quede en un chunk separado y no infle el bundle inicial del
 * editor (ver `designPdfExporter.ts`, que es quien realmente dispara la
 * carga).
 */
import type { VirolaConfig } from '../../config/virola.config';
import type { SvgShapeSpec } from './svgDocument';
import { parsePathCommands } from '../icons/normalizeIconPath';
import { computeCanvasToPageTransform } from './exportPathGeometry';
import { absCommandsToJsPdfOps } from './pdfPathAdapter';
import type { Matrix } from '../icons/svgTransform';

/** Misma matriz canvas-px → página-mm que arma el `<g transform>` del SVG, pero como matriz 2D combinada (traslación + escala uniforme, sin rotación/sesgo) en vez de una cadena `translate/scale/translate` — necesaria acá porque `pdfPathAdapter.ts` transforma PUNTOS, no genera un atributo de transform que un visor aplique por su cuenta. */
function computeCanvasToPageMatrix(config: VirolaConfig): Matrix {
  const { scale, canvasCenterPx, pageCenterMm } = computeCanvasToPageTransform(config);
  return [
    scale, 0, 0, scale,
    -canvasCenterPx.x * scale + pageCenterMm,
    -canvasCenterPx.y * scale + pageCenterMm,
  ];
}

/**
 * Arma el documento PDF completo y lo devuelve como `Blob` (mismo tipo que
 * ya espera `downloadFile.ts`, aunque ese módulo hoy solo descarga texto —
 * ver `designPdfExporter.ts`). Async por el `import('jspdf')` dinámico.
 *
 * Nunca recibe shapes `kind: 'text'` en un uso correcto (el caller filtra
 * antes, ver `designPdfExporter.ts` y su política explícita sobre texto
 * dependiente de fuente) — si igual llegara una, tira un error explícito en
 * vez de ignorarla en silencio.
 */
export async function buildPdfDocument(shapes: readonly SvgShapeSpec[], config: VirolaConfig): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const pageSizeMm = config.outerDiameterMm;
  const doc = new jsPDF({ unit: 'mm', format: [pageSizeMm, pageSizeMm], compress: true });
  // Un PDF nuevo trae una página en blanco por defecto con el tamaño que ya
  // le pasamos al constructor — nunca se llama `addPage()` (un único diseño,
  // una única página, mismo criterio que el SVG).

  const matrix = computeCanvasToPageMatrix(config);

  for (const shape of shapes) {
    if (shape.kind === 'text') {
      throw new Error(
        'buildPdfDocument: recibió una shape "text" (<textPath>, dependiente de fuente) — el PDF nunca dibuja ' +
        'texto con doc.text()/fuentes del sistema. El caller (designPdfExporter.ts) debe filtrar esto ANTES ' +
        'de llamar acá, nunca alcanzar este punto.',
      );
    }

    const commands = parsePathCommands(shape.d);
    if (commands.length === 0) continue;
    const ops = absCommandsToJsPdfOps(commands, matrix);
    if (ops.length === 0) continue;

    doc.path(ops);
    if (shape.kind === 'fill') {
      doc.setFillColor(shape.fill);
      if (shape.fillRule === 'evenodd') {
        doc.fillEvenOdd();
      } else {
        doc.fill();
      }
    } else {
      // 'stroke' — nunca lleva relleno (mismo criterio que `svgDocument.ts`:
      // `fill="none"` en el SVG, ningún `setFillColor`/`fill()` acá).
      doc.setDrawColor(shape.stroke);
      // `strokeWidth` viene en px de canvas (igual que en `SvgShapeSpec`,
      // ver `circularLineExportGeometry.ts`) — se escala con el MISMO
      // factor px→mm que las coordenadas, para que el grosor real coincida
      // con el que ya se ve en el SVG (que lo hereda gratis del `scale()`
      // de su `<g transform>`; acá hay que aplicarlo a mano porque no existe
      // un mecanismo equivalente de "transform que también escala el
      // trazo").
      doc.setLineWidth(shape.strokeWidth * matrix[0]);
      doc.stroke();
    }
  }

  return doc.output('blob');
}
