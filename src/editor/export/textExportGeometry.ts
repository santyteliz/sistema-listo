/**
 * Convierte un texto curvo real del canvas (Fabric `IText` con `path`, ver
 * `curvedText.ts`) a la información necesaria para exportarlo como
 * `<text><textPath>` nativo de SVG — Etapa 10 (exportación vectorial,
 * primera versión).
 *
 * IMPORTANTE — alcance de esta primera versión (ver el informe de esta
 * etapa, Paso C): esto NO convierte el texto a curvas/outlines
 * independientes de la fuente todavía — usa `<textPath>` nativo, que sigue
 * dependiendo de que la tipografía esté disponible en la aplicación que
 * abra el archivo (Illustrator/CorelDRAW). Es una decisión deliberada de
 * alcance: la conversión a outlines (investigada y propuesta en el informe:
 * reusar `vectortracer`, sin dependencias nuevas) necesita verificación
 * visual real en un navegador para confirmar la calidad de curva, que no
 * puedo hacer yo mismo en este entorno — se deja para una etapa siguiente,
 * en vez de implementarla sin poder verificarla.
 *
 * Extraer la geometría del ARCO (el `path` asignado al texto, nunca los
 * glifos en sí) SÍ es puro y testeable en Node — no requiere medir texto
 * (lo único que necesita un contexto 2D real, ver el informe de esta
 * etapa: construir/leer propiedades de un `IText` funciona en Node sin
 * ningún shim, solo `.toSVG()`/`calcTextWidth()` lo necesitan).
 */
import type { IText, Path } from 'fabric';
import {
  transformFabricPathCommands,
  serializeFabricPathCommands,
  type FabricPathCommand,
} from './exportPathGeometry';

export interface TextExportInfo {
  content: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  /** `d` del arco guía, ya en coordenadas ABSOLUTAS del canvas (mismo espacio que `iconExportGeometry.ts`/`circularLineExportGeometry.ts`). */
  pathD: string;
  /**
   * SVG `<textPath>` usa `side="right"` para invertir de qué lado del
   * trazo cuelgan las letras — mismo concepto que `pathSide` de Fabric
   * ('left'/'right' ya coinciden 1 a 1 con los valores que acepta SVG2 acá,
   * ver `curvedText.ts`: "invertir texto" cambia justamente esta
   * propiedad).
   */
  side: 'left' | 'right';
  startOffset: number;
}

/** Geometría absoluta (canvas px) del `path` guía de un texto curvo — el mismo tipo de transformación que ya usa `iconExportGeometry.ts` para un `Path` cualquiera, aplicada acá con la matriz del TEXTO (no la del arco en sí, que nunca se agrega al canvas ni tiene su propia posición). */
function absoluteArcPathD(textObj: IText): string {
  const arc = textObj.path as Path | undefined;
  if (!arc) return '';
  const raw = (arc.path ?? []) as unknown as FabricPathCommand[];
  const matrix = textObj.calcTransformMatrix();
  const transformed = transformFabricPathCommands(raw, arc.pathOffset, matrix);
  return serializeFabricPathCommands(transformed);
}

/** Punto de entrada — extrae todo lo necesario para armar un `<text><textPath>` a partir de un texto curvo real del canvas. */
export function extractTextExportInfo(textObj: IText): TextExportInfo {
  return {
    content: textObj.text,
    fontFamily: textObj.fontFamily,
    fontSize: textObj.fontSize,
    fill: typeof textObj.fill === 'string' ? textObj.fill : '#000000',
    pathD: absoluteArcPathD(textObj),
    side: textObj.pathSide === 'right' ? 'right' : 'left',
    startOffset: textObj.pathStartOffset ?? 0,
  };
}
