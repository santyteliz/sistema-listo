/**
 * Agrupamiento de color para SVG compuestos — Etapa 8E (fidelidad visual
 * de SVG subidos). Un SVG real casi nunca usa un único valor hexadecimal
 * exacto para "la tinta": exportadores distintos (Inkscape/Illustrator) y
 * redondeos de color dejan variantes como `#231f20`/`#232020`/`#222222`
 * que representan, a los ojos de una persona, EL MISMO tono. Este módulo
 * decide, de forma determinista, cuántos "tonos conceptuales" hay en un
 * conjunto de colores — nunca cuenta valores hexadecimales distintos a lo
 * bruto.
 *
 * Importante (pedido explícito de esta etapa): el resultado NUNCA es "usar
 * este color real" — es solo CUÁNTOS grupos hay y, para el caso de 2
 * grupos, cuál es más oscuro. `svgIconExtractor.ts` es quien decide qué
 * significa cada grupo (`ink`/`paper`) — acá no hay ningún concepto de
 * pintado, solo aritmética de color.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Distancia euclídea máxima (en espacio RGB 0–255) entre dos colores para considerarlos "la misma tinta". Elegido para absorber el ruido típico de exportación (ej. `#231f20` vs `#232020` vs `#222222`, todos a menos de 5 unidades entre sí) sin fusionar dos tonos genuinamente distintos (ej. un gris medio real vs. negro — normalmente muy por encima de este umbral). Determinista y documentado, no "ajustado a mano" por archivo. */
export const COLOR_GROUP_DISTANCE_THRESHOLD = 24;

/** Máximo de grupos de color conceptuales que el modelo actual (tinta/papel) puede representar. Más de esto se rechaza — ver `groupColors`. */
export const MAX_SUPPORTED_COLOR_GROUPS = 2;

const NAMED_COLORS: Record<string, RgbColor> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
};

/**
 * Intenta resolver un valor de color CSS (ya en minúsculas y recortado,
 * mismo criterio que el resto del extractor) a RGB. Deliberadamente
 * acotado a las formas que un SVG real usa para pintado sólido — nunca
 * evalúa CSS real ni resuelve `currentColor`/variables (ver `groupColors`:
 * un color no resoluble queda en su propio grupo irreducible, nunca se
 * "adivina" a qué grupo pertenece).
 */
export function parseColorToRgb(value: string): RgbColor | null {
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];

  const hex6 = /^#([0-9a-f]{6})$/.exec(v);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const hex3 = /^#([0-9a-f]{3})$/.exec(v);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const rgbFn = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*[\d.]+\s*)?\)$/.exec(v);
  if (rgbFn) {
    const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
    return { r: clamp(Number(rgbFn[1])), g: clamp(Number(rgbFn[2])), b: clamp(Number(rgbFn[3])) };
  }
  return null;
}

/** Luminancia relativa estándar (coeficientes Rec. 709/sRGB, sin corrección gamma — suficiente para ORDENAR colores de más oscuro a más claro, no se usa para nada fotométrico). */
export function relativeLuminance(color: RgbColor): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function distance(a: RgbColor, b: RgbColor): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export interface ColorGroup {
  /** Todos los colores originales (strings tal cual llegaron) que caen en este grupo. */
  members: string[];
  /** Luminancia relativa del PRIMER color del grupo (el más oscuro que lo abrió) — solo para ordenar/clasificar, nunca se usa como "el color real". */
  luminance: number;
}

export type ColorGroupingResult =
  | { ok: true; groups: ColorGroup[] }
  | { ok: false; reason: 'unresolvable-color' | 'too-many-groups' };

/**
 * Agrupa una lista de colores (strings CSS ya resueltos por
 * `resolvePaintContext`) en "tonos conceptuales", de forma determinista:
 *
 * 1. Cada color DISTINTO (por string exacto) se resuelve a RGB. Si alguno
 *    no se puede resolver (`currentColor`, una palabra clave no soportada,
 *    etc.), se rechaza de entrada — nunca se adivina en qué grupo cae.
 * 2. Se ordenan de más oscuro a más claro por luminancia relativa.
 * 3. Se recorren en ese orden: un color abre un grupo nuevo si su
 *    distancia euclídea en RGB al color que abrió el grupo ACTUAL supera
 *    `COLOR_GROUP_DISTANCE_THRESHOLD`; si no, se suma a ese mismo grupo.
 *    (Comparar siempre contra el que ABRIÓ el grupo, no contra el último
 *    agregado, evita que una cadena larga de variantes cercanas entre sí
 *    "camine" hasta un tono claramente distinto sin que ninguna distancia
 *    individual dispare el corte.)
 *
 * Si el resultado tiene más de `MAX_SUPPORTED_COLOR_GROUPS` grupos, se
 * rechaza — el modelo actual (tinta/papel) solo puede representar dos.
 */
export function groupColors(colors: readonly string[]): ColorGroupingResult {
  const distinct = [...new Set(colors)];
  const resolved: { value: string; rgb: RgbColor; luminance: number }[] = [];
  for (const value of distinct) {
    const rgb = parseColorToRgb(value);
    if (!rgb) {
      return { ok: false, reason: 'unresolvable-color' };
    }
    resolved.push({ value, rgb, luminance: relativeLuminance(rgb) });
  }
  resolved.sort((a, b) => a.luminance - b.luminance);

  const groups: (ColorGroup & { anchor: RgbColor })[] = [];
  for (const color of resolved) {
    const current = groups[groups.length - 1];
    if (current && distance(current.anchor, color.rgb) <= COLOR_GROUP_DISTANCE_THRESHOLD) {
      current.members.push(color.value);
    } else {
      groups.push({ members: [color.value], luminance: color.luminance, anchor: color.rgb });
    }
  }

  if (groups.length > MAX_SUPPORTED_COLOR_GROUPS) {
    return { ok: false, reason: 'too-many-groups' };
  }
  return { ok: true, groups: groups.map(({ members, luminance }) => ({ members, luminance })) };
}
