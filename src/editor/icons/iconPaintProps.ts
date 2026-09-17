// Extensión ".ts" explícita en las dos importaciones — igual que
// `iconCatalog.ts` (Etapa 1) — para que este archivo pueda cargarse tanto
// desde Vite (navegador, `iconElement.ts`) como desde el test runner nativo
// de Node (`iconPaintProps.test.ts`, y transitivamente desde los scripts de
// `scripts/icon-import/`), sin que Node native type-stripping falle al
// resolver un import sin extensión (`allowImportingTsExtensions` en
// `tsconfig.app.json` hace que esto sea válido también para Vite/`tsc -b`).
import { DESIGN_INK_COLOR } from '../canvas/designColors.ts';
import type { IconPaintMode, IconLayer } from './iconLibrary.ts';

/**
 * Única fuente de verdad de "cómo se pinta un ícono" (Etapa 4 del plan de
 * biblioteca de íconos — corrección de relleno/trazo real). Antes de esta
 * etapa, `iconElement.ts` (Fabric, navegador) y `runImport.ts`
 * (`renderThumbnail`, Node) tenían cada uno su propia decisión hardcodeada
 * — la causa raíz de que el thumbnail y el ícono en Fabric pudieran verse
 * distintos entre sí. Esta función es la única que decide `fill`/`stroke`/
 * `fillRule`/`strokeWidth` a partir de un `IconAsset`/`IconDefinition`;
 * ambos consumidores (navegador y Node) la llaman igual y solo difieren en
 * el adaptador final de API (props de `fabric.Path` vs. llamadas directas a
 * un `CanvasRenderingContext2D`) — ver el comentario de cada consumidor.
 *
 * Deliberadamente en `src/editor/icons/` (no en `scripts/`): es lógica de
 * PRODUCTO (qué significa `paintMode: 'fill'`/`'stroke'` para este editor),
 * no una herramienta de build offline — y así puede importarse sin
 * extensión `.ts` desde el navegador (`iconElement.ts`) igual que cualquier
 * otro módulo de `src/`, y con extensión `.ts` explícita desde los scripts
 * de Node (mismo patrón ya usado por `classifyIcon.ts` al importar
 * `normalizeIconPath.ts`) — no tiene ninguna dependencia de DOM/Fabric
 * (`designColors.ts` es una constante pura), así que funciona igual en los
 * dos entornos sin ninguna condición especial.
 */

/** Ancho de trazo de respaldo — solo se usa si, por algún motivo, un ícono con `paintMode: 'stroke'` no trae su propio `strokeWidth` (no debería pasar tras esta etapa: todo ícono de trazo — legacy o importado — lo trae explícito). Es una red de seguridad, no una decisión de diseño. */
const FALLBACK_STROKE_WIDTH = 8;

export interface IconPaintProps {
  /** Color de relleno, o `null` si este ícono no debe rellenarse (`paintMode: 'stroke'`). */
  fill: string | null;
  /** Color de trazo, o `null` si este ícono no debe trazarse (`paintMode: 'fill'`). */
  stroke: string | null;
  /** Regla de relleno real — solo tiene efecto visible cuando `fill` no es `null`. */
  fillRule: 'nonzero' | 'evenodd';
  /** Ancho de trazo real — solo tiene efecto visible cuando `stroke` no es `null`. */
  strokeWidth: number;
}

/**
 * Traduce el modelo de datos del catálogo (`paintMode`/`fillRule`/
 * `strokeWidth`) a las props de pintado reales que necesita cualquier
 * consumidor (Fabric.js o un `CanvasRenderingContext2D` directo). Nunca
 * produce fill Y stroke a la vez (ver el informe de la Etapa 4 — "Caso B":
 * cuando el PDF trae `fillStroke`/`eoFillStroke`, o un `stroke` redundante
 * con su `fill`, la geometría ya se resuelve a un solo `paintMode` durante
 * la composición en el importador — acá no hay ninguna decisión nueva que
 * tomar, solo traducir el modelo ya resuelto).
 */
export function getIconPaintProps(
  iconDef: { paintMode: IconPaintMode; fillRule: 'nonzero' | 'evenodd'; strokeWidth?: number },
): IconPaintProps {
  if (iconDef.paintMode === 'fill') {
    return { fill: DESIGN_INK_COLOR, stroke: null, fillRule: iconDef.fillRule, strokeWidth: 0 };
  }
  return { fill: null, stroke: DESIGN_INK_COLOR, fillRule: iconDef.fillRule, strokeWidth: iconDef.strokeWidth ?? FALLBACK_STROKE_WIDTH };
}

/** Props de pintado (Canvas2D/Fabric) para UNA capa de un ícono compuesto (Etapa 8E — ver `IconLayer`, `iconLibrary.ts`). */
export interface IconLayerPaintProps {
  /** Siempre `DESIGN_INK_COLOR` (mismo color único que cualquier ícono simple) para `role: 'ink'` — el valor es irrelevante para `role: 'paper'` (`destination-out` solo usa la forma/alfa de la capa, nunca su color), pero se deja igual un color real por prolijidad/debug. */
  fill: string;
  /** `'source-over'` (pintado normal) para `ink`; `'destination-out'` (revela lo pintado antes, nunca introduce blanco real) para `paper`. */
  globalCompositeOperation: GlobalCompositeOperation;
}

/**
 * Traduce una `IconLayer` a las props de pintado reales que necesita
 * Fabric/Canvas2D — misma idea que `getIconPaintProps`, pero para una
 * capa individual de un ícono compuesto. Única fuente de verdad de "qué
 * significa `role: 'ink'`/`'paper'` en términos de pintado real" — tanto
 * `iconElement.ts` (Fabric) como cualquier preview (`IconLibraryDrawer.tsx`,
 * `IconEditorPanel.tsx`) la usan, para no duplicar esta decisión.
 */
export function getIconLayerPaintProps(layer: Pick<IconLayer, 'role'>): IconLayerPaintProps {
  return {
    fill: DESIGN_INK_COLOR,
    globalCompositeOperation: layer.role === 'paper' ? 'destination-out' : 'source-over',
  };
}
