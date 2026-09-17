/**
 * Orquestador de exportación PDF — Etapa 12B. Análogo a `designExporter.ts`
 * (`exportDesignToSvg`) pero para PDF: reutiliza `collectDesignShapes` (la
 * MISMA extracción de texto/íconos/líneas circulares que ya usa el SVG,
 * nunca un segundo recorrido del canvas) y arma el documento vía
 * `pdfDocument.ts` en vez de `svgDocument.ts`.
 *
 * POLÍTICA DE TEXTO DEPENDIENTE DE FUENTE (pedido explícito de esta etapa,
 * MÁS ESTRICTA que la del SVG): el SVG puede caer a `<textPath>` nativo si
 * un texto no se pudo convertir a outlines (`fontDependentTexts`, Etapa 11)
 * y de todas formas descarga un archivo válido, con un aviso. El PDF NO
 * hace eso — el objetivo explícito del PDF es ser independiente de las
 * fuentes instaladas en quien lo abra (Illustrator/CorelDRAW), así que un
 * PDF con `<textPath>`-equivalente (que acá ni siquiera está implementado,
 * ver `pdfDocument.ts`) sería un archivo "aparentemente correcto" pero
 * silenciosamente incompleto. Por eso, si `collectDesignShapes` reporta
 * CUALQUIER texto dependiente de fuente, este módulo NUNCA llega a generar
 * un PDF — falla explícitamente y el caller decide cómo avisar. El
 * embedding de fuentes TTF para cubrir ese caso queda fuera de alcance de
 * esta etapa (las 13 tipografías del proyecto ya se validaron
 * convirtiéndose a outlines sin problema, Etapa 11).
 */
import type { VirolaConfig } from '../../config/virola.config';
import { collectDesignShapes, type ExportableCanvas } from './designExporter';
import { buildPdfDocument } from './pdfDocument';

export type DesignPdfExportResult =
  | { success: true; blob: Blob }
  | { success: false; reason: 'empty' }
  | { success: false; reason: 'font-dependent-text'; fontDependentTexts: string[] }
  | { success: false; reason: 'conversion-error'; message: string };

/**
 * Genera el PDF de producción a partir del canvas real. Mismo criterio que
 * `exportDesignToSvg`: determinístico, nunca muta el canvas. A diferencia
 * del SVG, puede fallar explícitamente (ver `DesignPdfExportResult`) — el
 * PDF nunca se genera "a medias".
 */
export async function exportDesignToPdf(canvas: ExportableCanvas, config: VirolaConfig): Promise<DesignPdfExportResult> {
  const { shapes, fontDependentTexts } = await collectDesignShapes(canvas);

  if (shapes.length === 0) {
    return { success: false, reason: 'empty' };
  }
  if (fontDependentTexts.length > 0) {
    return { success: false, reason: 'font-dependent-text', fontDependentTexts };
  }

  try {
    const blob = await buildPdfDocument(shapes, config);
    return { success: true, blob };
  } catch (err) {
    return { success: false, reason: 'conversion-error', message: err instanceof Error ? err.message : String(err) };
  }
}
