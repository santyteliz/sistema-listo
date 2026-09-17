/**
 * Convierte un ícono real del canvas (Fabric `Path` simple o `Group`
 * compuesto — ver `IconObject`, `iconElement.ts`) a geometría exportable
 * (`d` + `fill-rule`), en coordenadas ABSOLUTAS del canvas — Etapa 10
 * (exportación vectorial).
 *
 * HALLAZGO CLAVE de esta etapa (ver el informe): `Group.toSVG()` de
 * Fabric.js 6.0.2 NO traduce `globalCompositeOperation: 'destination-out'`
 * a ningún mecanismo real de SVG — un ícono compuesto con una capa `paper`
 * exportado así mostraría un cuadrado sólido donde debería haber un
 * agujero (verificado empíricamente). Por eso este módulo nunca usa
 * `.toSVG()` para íconos compuestos: en cambio, combina los `d` de cada
 * capa hija en un ÚNICO path con `fill-rule: nonzero`, invirtiendo el
 * bobinado de las capas `paper` cuando haga falta para que funcionen como
 * agujero real — mismo principio geométrico (bobinado opuesto = agujero
 * bajo `nonzero`) ya verificado contra la salida real de `vectortracer` en
 * la Etapa 9D.1, aplicado acá en la dirección inversa (nosotros ELEGIMOS
 * el bobinado, en vez de solo leerlo).
 */
import { Group, Path } from 'fabric';
import type { IconObject } from '../canvas/iconElement';
import {
  transformFabricPathCommands,
  serializeFabricPathCommands,
  splitIntoSubpaths,
  signedSubpathArea,
  reverseSubpathWinding,
  type FabricPathCommand,
} from './exportPathGeometry';

export interface ExportShape {
  /** `d` de SVG, ya en coordenadas absolutas del canvas (todavía sin convertir a mm — eso lo hace `svgDocument.ts`). */
  d: string;
  fillRule: 'nonzero' | 'evenodd';
}

/** Comandos absolutos (canvas px) de UN `Path` de Fabric, aplicando su propia matriz de transformación (que ya compone automáticamente cualquier `Group` contenedor). */
function absoluteCommandsOf(path: Path): FabricPathCommand[] {
  const raw = (path.path ?? []) as unknown as FabricPathCommand[];
  const matrix = path.calcTransformMatrix();
  return transformFabricPathCommands(raw, path.pathOffset, matrix);
}

/** Ícono simple (un solo `Path`, catálogo/legacy/SVG subido de una forma) — se exporta tal cual, sin necesitar ninguna corrección de bobinado. */
function extractSimpleIconShapes(icon: Path): ExportShape[] {
  const commands = absoluteCommandsOf(icon);
  if (commands.length === 0) return [];
  return [{ d: serializeFabricPathCommands(commands), fillRule: icon.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' }];
}

/**
 * Ícono compuesto (`Group` de `Path`, Etapa 8E — capas `ink`/`paper`).
 * Combina TODAS las capas en un único `d`: primero se calcula el signo del
 * área (shoelace) de cada subtrazo de cada capa; se elige el signo de la
 * PRIMERA capa `ink` como referencia, y cualquier subtrazo `ink` con el
 * signo contrario se deja tal cual (dos formas de tinta que no se
 * superponen dan igual bajo `nonzero`, sea cual sea su bobinado relativo —
 * ver el razonamiento en `rasterIconExtractor.ts`), mientras que cada
 * subtrazo `paper` se fuerza al signo OPUESTO al de referencia (invirtiendo
 * su bobinado si hace falta) — así SIEMPRE funciona como agujero bajo
 * `nonzero`, sin importar cómo lo haya dejado el editor.
 */
function extractCompoundIconShapes(icon: Group): ExportShape[] {
  const children = icon.getObjects() as Path[];
  let referenceSign: number | null = null;
  const allCommands: FabricPathCommand[] = [];

  for (const child of children) {
    const isPaper = child.globalCompositeOperation === 'destination-out';
    const commands = absoluteCommandsOf(child);
    const subpaths = splitIntoSubpaths(commands);
    for (const subpath of subpaths) {
      const area = signedSubpathArea(subpath);
      if (area === 0) continue; // subtrazo degenerado, sin área — no aporta nada
      const sign = Math.sign(area);
      if (referenceSign === null && !isPaper) {
        referenceSign = sign;
      }
      const wantsOppositeSign = isPaper && referenceSign !== null;
      const needsFlip = wantsOppositeSign ? sign === referenceSign : false;
      allCommands.push(...(needsFlip ? reverseSubpathWinding(subpath) : subpath));
    }
  }

  if (allCommands.length === 0) return [];
  return [{ d: serializeFabricPathCommands(allCommands), fillRule: 'nonzero' }];
}

/** Punto de entrada — `Path` simple o `Group` compuesto, mismo resultado (`ExportShape[]`) para ambos casos. */
export function extractIconExportShapes(icon: IconObject): ExportShape[] {
  if (icon instanceof Group) {
    return extractCompoundIconShapes(icon);
  }
  return extractSimpleIconShapes(icon);
}
