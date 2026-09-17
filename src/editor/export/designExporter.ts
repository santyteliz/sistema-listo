/**
 * Orquestador de exportación vectorial — Etapa 10, texto convertido a
 * outlines en la Etapa 11. Lee el canvas de Fabric REAL (en vivo, tal como
 * está en pantalla en el momento de confirmar el diseño — nunca pasa por
 * el JSON serializado de `actions.serializeDesign()`, que es un mecanismo
 * distinto, pensado para localStorage/undo-redo, no para producción) y
 * arma el SVG final vía los extractores puros de este mismo módulo
 * (`iconExportGeometry.ts`, `circularLineExportGeometry.ts`,
 * `textOutlineExport.ts`/`textExportGeometry.ts`) + `svgDocument.ts`.
 *
 * QUÉ ELEMENTOS SE EXPORTAN (ver el informe de la Etapa 10): texto e
 * íconos (`isDesignElement`, el mismo criterio que ya usa
 * `designLimits.ts`) MÁS las líneas circulares (`isCircularLineObject`) —
 * que SÍ deben aparecer en el archivo de producción aunque tengan
 * `excludeFromExport: true` (ese flag existe para que NO viajen en el JSON
 * de `localStorage`, donde son puramente derivadas — ver
 * `circularLines.ts` — pero acá se agregan aparte, a propósito, porque
 * para el archivo final SÍ son parte visible del diseño). Las guías
 * (contorno de la virola, cruz de alineación) NUNCA se exportan — no son
 * parte del diseño real, ver `guides.ts`.
 *
 * TEXTO (Etapa 11): cada texto se intenta convertir primero a outlines
 * independientes de la fuente (`textOutlineExport.ts`, reusa
 * `vectortracer`) — si eso falla por cualquier motivo (bounding box
 * degenerado, el motor de vectorización tira), cae a `<text><textPath>`
 * nativo (`textExportGeometry.ts`, Etapa 10) como FALLBACK EXPLÍCITO — ver
 * `DesignExportResult.fontDependentTexts`, que el caller usa para avisar
 * si el archivo final quedó, para algún texto puntual, dependiente de que
 * la fuente esté instalada en quien lo abra (pedido explícito de esta
 * etapa: nunca descargar en silencio un archivo que dependa
 * accidentalmente de una fuente sin que quede marcado como tal).
 */
import { Path, type FabricObject, type IText } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { isDesignElement } from '../canvas/designLimits';
import { isIconObject, type IconObject } from '../canvas/iconElement';
import { isTextObject } from '../canvas/curvedText';
import { isCircularLineObject } from '../canvas/circularLines';
import { DESIGN_INK_COLOR } from '../canvas/designColors';
import { extractIconExportShapes } from './iconExportGeometry';
import { extractCircularLineExportShape } from './circularLineExportGeometry';
import { extractTextExportInfo } from './textExportGeometry';
import { extractTextOutlineShapes } from './textOutlineExport';
import { buildSvgDocument, type SvgShapeSpec } from './svgDocument';

/**
 * Lo único que este módulo necesita del `Canvas` real de Fabric —
 * deliberadamente más angosto que el tipo `Canvas` completo, para poder
 * testear `exportDesignToSvg` en Node con un objeto simulado mínimo (sin
 * necesitar construir un `Canvas`/`StaticCanvas` real, que sí exige un
 * `document`/contexto 2D reales — ver el informe de esta etapa) — mismo
 * criterio ya usado en otras partes del proyecto para poder testear lógica
 * de Fabric sin DOM (ej. `svgIconExtractor.ts` con un `Element` simulado).
 */
export interface ExportableCanvas {
  getObjects(): FabricObject[];
}

/** Objetos exportables del canvas, en orden de pintado real (`canvas.getObjects()` ya los devuelve en ese orden — nunca se reordenan acá). */
function getExportableObjects(canvas: ExportableCanvas): FabricObject[] {
  return canvas.getObjects().filter((object) => isDesignElement(object) || isCircularLineObject(object));
}

/** Fallback explícito a `<text><textPath>` nativo — nunca la vía preferida (ver el comentario grande del archivo). */
function textFallbackShape(textObj: IText, textPathCounter: { value: number }): SvgShapeSpec[] {
  const info = extractTextExportInfo(textObj);
  if (!info.pathD || info.content.trim().length === 0) return [];
  textPathCounter.value += 1;
  return [{
    kind: 'text',
    id: `mateshop-text-path-${textPathCounter.value}`,
    pathD: info.pathD,
    content: info.content,
    fontFamily: info.fontFamily,
    fontSize: info.fontSize,
    fill: info.fill,
    side: info.side,
    startOffset: info.startOffset,
  }];
}

/**
 * Un texto: primero intenta outlines reales (independientes de la fuente,
 * Etapa 11); si `extractTextOutlineShapes` devuelve `null` (bounding box
 * degenerado, o el motor de vectorización falló), cae a `<textPath>` nativo
 * y lo registra en `fallbackTexts` para que el caller pueda avisar — nunca
 * se descarga en silencio un archivo que dependa de una fuente sin que
 * quede marcado como tal (pedido explícito de esta etapa).
 */
async function shapesForText(textObj: IText, textPathCounter: { value: number }, fallbackTexts: string[]): Promise<SvgShapeSpec[]> {
  if (textObj.text.trim().length === 0) return [];
  const outlineShapes = await extractTextOutlineShapes(textObj);
  if (outlineShapes) {
    return outlineShapes.map((shape): SvgShapeSpec => ({
      kind: 'fill',
      d: shape.d,
      fillRule: shape.fillRule,
      fill: DESIGN_INK_COLOR,
    }));
  }
  fallbackTexts.push(textObj.text);
  return textFallbackShape(textObj, textPathCounter);
}

function shapesForNonTextObject(object: FabricObject): SvgShapeSpec[] {
  if (isIconObject(object)) {
    return extractIconExportShapes(object as IconObject).map((shape): SvgShapeSpec => ({
      kind: 'fill',
      d: shape.d,
      fillRule: shape.fillRule,
      fill: DESIGN_INK_COLOR,
    }));
  }
  if (isCircularLineObject(object) && object instanceof Path) {
    const shape = extractCircularLineExportShape(object);
    if (!shape) return [];
    return [{ kind: 'stroke', d: shape.d, strokeWidth: shape.strokeWidth, stroke: DESIGN_INK_COLOR }];
  }
  return [];
}

export interface DesignExportResult {
  svg: string;
  /** `false` si el diseño está vacío (sin texto/íconos/líneas) — el caller decide qué hacer (ver `IconLibraryDrawer`-style UX: no debe generar/descargar un archivo sin contenido real). */
  hasContent: boolean;
  /**
   * Contenido de cada texto que NO se pudo convertir a outlines y quedó
   * como `<textPath>` dependiente de fuente (ver el comentario grande del
   * archivo) — vacío en el caso normal. El caller (`TopBar.tsx`) lo usa
   * para avisar, nunca para bloquear la descarga.
   */
  fontDependentTexts: string[];
}

export interface CollectedDesignShapes {
  shapes: SvgShapeSpec[];
  fontDependentTexts: string[];
}

/**
 * Recorre el canvas real y arma la geometría (`SvgShapeSpec[]`) — el mismo
 * paso, EXACTO, que necesitan tanto `exportDesignToSvg` como
 * `exportDesignToPdf` (`designPdfExporter.ts`, Etapa 12B). Extraído acá
 * para que ningún formato de salida duplique la extracción de texto/
 * íconos/líneas circulares ni el orden secuencial de conversión — los dos
 * formatos consumen la MISMA geometría, nunca dos recorridos independientes
 * del canvas que podrían divergir entre sí.
 */
export async function collectDesignShapes(canvas: ExportableCanvas): Promise<CollectedDesignShapes> {
  const objects = getExportableObjects(canvas);
  const textPathCounter = { value: 0 };
  const fallbackTexts: string[] = [];

  // Secuencial a propósito (nunca `Promise.all`): cada texto que necesita
  // outline crea su PROPIA instancia de `BinaryImageConverter` sobre el
  // MISMO módulo WASM memoizado de `vectortracer` — correr varias
  // conversiones EN SECUENCIA ya está verificado funcionando sin problemas
  // (Etapa 9F: 3 fixtures seguidos contra el mismo motor). Interlevarlas
  // en paralelo (varios `tick()` de conversores distintos alternándose en
  // el mismo instante) es un escenario nuevo, nunca probado, y no puedo
  // verificarlo yo mismo en este entorno — se prefiere la opción
  // conservadora en vez de arriesgar una exportación corrupta.
  const shapesByObject: SvgShapeSpec[][] = [];
  for (const object of objects) {
    if (isTextObject(object)) {
      shapesByObject.push(await shapesForText(object, textPathCounter, fallbackTexts));
    } else {
      shapesByObject.push(shapesForNonTextObject(object));
    }
  }

  return { shapes: shapesByObject.flat(), fontDependentTexts: fallbackTexts };
}

/**
 * Genera el SVG de producción a partir del canvas real. Determinístico
 * dado el estado actual del canvas — no muta nada (nunca agrega/quita
 * objetos, nunca cambia `left`/`top`/`scale`/etc de ningún elemento real).
 * Async desde la Etapa 11 (la conversión de texto a outlines necesita
 * renderizar a un canvas y esperar al motor de vectorización).
 */
export async function exportDesignToSvg(canvas: ExportableCanvas, config: VirolaConfig): Promise<DesignExportResult> {
  const { shapes, fontDependentTexts } = await collectDesignShapes(canvas);

  return {
    svg: buildSvgDocument(shapes, config),
    hasContent: shapes.length > 0,
    fontDependentTexts,
  };
}
