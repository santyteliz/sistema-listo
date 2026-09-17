/**
 * Orquestador combinado SVG+PDF — Etapa 13. "Confirmar diseño" debe
 * descargar los dos formatos juntos (decisión de producto explícita) —
 * este módulo existe para que esa integración lea el canvas UNA sola vez,
 * en vez de que `TopBar.tsx` llame a `exportDesignToSvg` y
 * `exportDesignToPdf` por separado (cada uno de los cuales, por su cuenta,
 * volvería a llamar a `collectDesignShapes` — dos recorridos completos del
 * canvas, incluida la vectorización de cada texto DOS veces).
 *
 * Deliberadamente NO reemplaza ni modifica `exportDesignToSvg`/
 * `exportDesignToPdf` (`designExporter.ts`/`designPdfExporter.ts`) — esas
 * dos APIs siguen intactas, cada una sigue siendo válida y testeada por su
 * cuenta (ej. para un uso futuro que solo necesite un formato). Esta
 * función arma el mismo resultado llamando directamente a las piezas ya
 * puras que ambas comparten (`collectDesignShapes` + `buildSvgDocument` +
 * `buildPdfDocument`), sin duplicar su lógica.
 *
 * POLÍTICA (pedido explícito de esta etapa — "todo o nada"): los dos
 * archivos se generan COMPLETOS en memoria antes de descargar cualquiera de
 * los dos. Si el PDF no puede generarse (`fontDependentTexts` no vacío, o
 * un error real de conversión), NO se descarga tampoco el SVG — aunque el
 * SVG en sí hubiera salido bien, descargar solo uno de los dos dejaría al
 * usuario con una entrega a medias sin que quede claro qué falta. La
 * política estricta del PDF (nunca cae a un fallback dependiente de fuente,
 * ver `designPdfExporter.ts`) se hereda tal cual.
 */
import type { VirolaConfig } from '../../config/virola.config';
import { collectDesignShapes, type ExportableCanvas } from './designExporter';
import { buildSvgDocument } from './svgDocument';
import { buildPdfDocument } from './pdfDocument';

export type ConfirmDesignResult =
  | { status: 'empty' }
  | { status: 'font-dependent-text'; fontDependentTexts: string[] }
  | { status: 'pdf-error'; message: string }
  | { status: 'success'; svg: string; pdfBlob: Blob };

/**
 * Genera SVG y PDF juntos a partir del canvas real, con una única lectura
 * de geometría. Determinístico, nunca muta el canvas (mismo criterio que
 * `exportDesignToSvg`/`exportDesignToPdf`).
 */
export async function exportDesignToSvgAndPdf(canvas: ExportableCanvas, config: VirolaConfig): Promise<ConfirmDesignResult> {
  const { shapes, fontDependentTexts } = await collectDesignShapes(canvas);

  if (shapes.length === 0) {
    return { status: 'empty' };
  }
  if (fontDependentTexts.length > 0) {
    return { status: 'font-dependent-text', fontDependentTexts };
  }

  const svg = buildSvgDocument(shapes, config);
  try {
    const pdfBlob = await buildPdfDocument(shapes, config);
    return { status: 'success', svg, pdfBlob };
  } catch (err) {
    return { status: 'pdf-error', message: err instanceof Error ? err.message : String(err) };
  }
}
