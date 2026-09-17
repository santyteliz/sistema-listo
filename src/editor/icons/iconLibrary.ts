/**
 * Biblioteca propia de íconos del editor (ver docs/PRODUCT.md,
 * "Edición de íconos", y docs/ARCHITECTURE.md — "Los íconos se preparan
 * como SVGs propios/curados"). Son recursos de la propia aplicación, nunca
 * contenido de terceros ni subido por usuarios: se definen acá como datos
 * de trazo (`d` de un `<path>`) y se dibujan siempre a través de Fabric.js
 * (`new Path(...)`) o de JSX (`<path d={...} />`), nunca con `innerHTML` ni
 * insertando SVG ajeno en el DOM (ver docs/ARCHITECTURE.md, "SVG y
 * seguridad").
 *
 * Es un conjunto chico a propósito (no una librería masiva de terceros):
 * pensado para crecer agregando entradas acá, no para cubrir todos los
 * casos de una — cada ícono es una sola figura de línea (sin relleno),
 * simple y limpia, apta para grabado láser.
 *
 * El `viewBox` de referencia de todos los `d` es `0 0 100 100`.
 *
 * PINTADO (Etapa 4 del plan de biblioteca de íconos — corrección de
 * relleno/trazo real): cada ícono declara explícitamente CÓMO debe pintarse
 * (`paintMode`), en vez de que `iconElement.ts` asuma un único estilo fijo
 * para todos. Estos 6 íconos siempre fueron dibujados a mano como una sola
 * línea (sin relleno) — se migran acá con `paintMode: 'stroke'` y
 * `strokeWidth: 8` (el mismo valor que `iconElement.ts` aplicaba antes,
 * como constante universal) para conservar EXACTAMENTE su apariencia
 * actual. `fillRule` no tiene efecto visible en un ícono de trazo (no hay
 * relleno que decidir con nonzero/evenodd), pero es un campo obligatorio
 * del modelo (ver `IconPaintMode`) — se deja en `'nonzero'` por prolijidad,
 * nunca se lee para estos íconos en la práctica.
 */
export type IconPaintMode = 'fill' | 'stroke';

/**
 * Una capa de pintado de un ícono COMPUESTO (Etapa 8E — fidelidad visual
 * de SVG subidos con varias formas/colores). Cada capa es, en sí misma,
 * geometría de relleno normal (un `d` + su propia `fillRule`, para sus
 * propios agujeros internos) — lo único nuevo es `role`, que decide CÓMO
 * se compone sobre lo que ya se pintó antes:
 *
 * - `'ink'`: se pinta encima con el ÚNICO color de tinta del editor
 *   (`DESIGN_INK_COLOR`, igual que cualquier ícono simple) — composición
 *   normal (`source-over`).
 * - `'paper'`: NUNCA introduce un color (nunca blanco real) — significa
 *   "acá se revela lo que sea que haya debajo" (la tinta pintada por una
 *   capa `ink` anterior, o directamente el material de la virola si no
 *   había ninguna). Se implementa con `globalCompositeOperation:
 *   'destination-out'` (ver `iconElement.ts`), que borra el área de esta
 *   capa de todo lo pintado ANTES que ella, sin rasterizar nada — sigue
 *   siendo composición vectorial de Canvas2D/Fabric.
 *
 * El ORDEN del arreglo `layers` en `IconDefinition`/`IconAsset` ES el
 * orden de pintado real — nunca se reordena por color ni por ningún otro
 * criterio.
 */
export interface IconLayer {
  /** Datos de trazo de ESTA capa, ya en el viewBox de referencia compartido `0 0 100 100` (ver `normalizeIconLayers`, `normalizeIconPath.ts` — todas las capas de un mismo ícono comparten la MISMA transformación de normalización, nunca una por capa). */
  d: string;
  role: 'ink' | 'paper';
  /** Regla de relleno propia de ESTA capa — nunca se mezcla ni se promedia con la de otras capas. */
  fillRule: 'nonzero' | 'evenodd';
}

export interface IconDefinition {
  /** ID estable — no cambiar una vez publicado (queda en diseños serializados). */
  id: string;
  /** Nombre visible en el selector. */
  name: string;
  /**
   * Datos de trazo del ícono (uno o más subpaths), en un viewBox 0 0 100
   * 100. Para un ícono COMPUESTO (`layers` presente), este campo sigue
   * poblado como una aproximación best-effort (unión de las capas `ink`,
   * ignorando las `paper`) — solo para cualquier consumidor legacy que
   * todavía no sepa leer `layers`; la representación AUTORITATIVA para
   * renderizar (Fabric, preview) es siempre `layers` cuando está presente,
   * nunca este fallback. Ver el informe de la Etapa 8E.
   */
  svgPath: string;
  /**
   * Cómo debe pintarse este ícono: `'fill'` (silueta rellena — usa
   * `fillRule` para resolver agujeros/compound paths) o `'stroke'` (solo
   * contorno, sin relleno — el modelo de los 6 íconos legacy). Ver
   * `getIconPaintProps` (`iconPaintProps.ts`), la única función que traduce
   * esto a props reales de Fabric/Canvas2D — ni `iconElement.ts` ni el
   * generador de thumbnails deciden esto por su cuenta. Para un ícono
   * compuesto (`layers` presente) siempre vale `'fill'` (`ink`/`paper` es,
   * por definición, un concepto de relleno).
   */
  paintMode: IconPaintMode;
  /** Regla de relleno (`nonzero`/`evenodd`) — solo importa cuando `paintMode === 'fill'`. Para un ícono compuesto, es el valor del fallback `svgPath`, no el de ninguna capa individual (cada capa trae la suya en `layers[].fillRule`). */
  fillRule: 'nonzero' | 'evenodd';
  /** Ancho de trazo — solo tiene sentido cuando `paintMode === 'stroke'`; ausente en un ícono de relleno. */
  strokeWidth?: number;
  /**
   * Presente ÚNICAMENTE en íconos COMPUESTOS (SVG subidos por el usuario
   * con varias formas/colores que necesitan preservar orden de pintado —
   * ver `svgIconExtractor.ts`, Etapa 8E). `undefined` para los 233 íconos
   * del catálogo (PDF) y los 6 legacy — ninguno de esos dos pipelines
   * produce `layers`, así que quedan exactamente como estaban antes de
   * esta etapa. Cuando está presente, tiene prioridad sobre
   * `svgPath`/`paintMode`/`fillRule`/`strokeWidth` para el renderizado
   * real (ver `createIconObject`, `iconElement.ts`).
   */
  layers?: IconLayer[];
}

export const ICON_LIBRARY: readonly IconDefinition[] = [
  {
    id: 'heart',
    name: 'Corazón',
    svgPath:
      'M50,88 C20,65 5,45 5,28 C5,12 18,2 32,2 C42,2 48,8 50,15 ' +
      'C52,8 58,2 68,2 C82,2 95,12 95,28 C95,45 80,65 50,88 Z',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 8,
  },
  {
    id: 'star',
    name: 'Estrella',
    svgPath:
      'M50,5 L60.58,35.44 L92.8,36.09 L67.12,55.56 L76.45,86.41 ' +
      'L50,68 L23.55,86.41 L32.88,55.56 L7.2,36.09 L39.42,35.44 Z',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 8,
  },
  {
    id: 'infinity',
    name: 'Infinito',
    svgPath:
      'M20,50 C20,35 35,35 50,50 C65,65 80,65 80,50 ' +
      'C80,35 65,35 50,50 C35,65 20,65 20,50 Z',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 8,
  },
  {
    id: 'leaf',
    name: 'Hoja',
    svgPath: 'M50,10 C75,25 85,55 50,90 C15,55 25,25 50,10 Z M50,22 L50,78',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 8,
  },
  {
    id: 'mate',
    name: 'Mate',
    svgPath:
      'M30,45 C30,30 40,20 50,20 C60,20 70,30 70,45 C70,65 60,85 50,85 ' +
      'C40,85 30,65 30,45 Z M55,35 L82,12 M89,10 A4,4 0 1,1 81,10 A4,4 0 1,1 89,10',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 8,
  },
  {
    id: 'sun',
    name: 'Sol',
    svgPath:
      'M65,50 A15,15 0 1,1 35,50 A15,15 0 1,1 65,50 ' +
      'M70,50 L82,50 M64.14,64.14 L72.63,72.63 M50,70 L50,82 M35.86,64.14 L27.37,72.63 ' +
      'M30,50 L18,50 M35.86,35.86 L27.37,27.37 M50,30 L50,18 M64.14,35.86 L72.63,27.37',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 8,
  },
] as const;

export function getIconDefinition(id: string): IconDefinition | undefined {
  return ICON_LIBRARY.find((icon) => icon.id === id);
}
