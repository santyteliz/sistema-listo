/**
 * Composición de geometría — Etapa 4 del plan de biblioteca de íconos.
 *
 * Toma los `PaintedPathGroup[]` que expone `pdfToPaths.ts` (cada uno con su
 * paint type REAL, ver ese archivo) y decide, de forma auditable y sin
 * inventar nada, qué termina siendo la geometría final del ícono: si se
 * pinta con relleno o con trazo, con qué fill-rule/ancho, y qué grupos se
 * descartan por redundantes. Es la pieza nueva que faltaba entre la
 * extracción (que ya sabe el paint type real de cada path) y la
 * normalización (que sigue operando, sin cambios, sobre la geometría YA
 * resuelta — ver `normalizeIconPath.ts`).
 *
 * Reglas (acordadas explícitamente en el diseño técnico de esta etapa,
 * "Paso 4" — nunca una decisión visual arbitraria):
 *
 * - Caso A (`fill`/`eoFill`): se conserva, define `paintMode: 'fill'` y su
 *   `fillRule` real.
 * - Caso B (`fillStroke`/`eoFillStroke` — una sola geometría que pinta
 *   relleno Y trazo A LA VEZ): se conserva su geometría UNA sola vez y se
 *   la trata como relleno (mismo criterio que el Caso C: cuando una misma
 *   forma tiene relleno y trazo disponibles, se prioriza el relleno — es
 *   la representación visualmente más fiel de una silueta, y el modelo de
 *   datos aprobado para esta etapa es un único `paintMode` por ícono, no
 *   fill+stroke simultáneos). No se pierde geometría: es la MISMA forma,
 *   una vez.
 * - Caso C (`stroke` "gemelo" de un `fill`/`eoFill`): si un grupo de trazo
 *   puro comparte bounding box y cantidad de comandos (con tolerancia) con
 *   un grupo de relleno CERCANO en el stream, se considera el mismo
 *   contorno dibujado dos veces (confirmado empíricamente en la Etapa 4 —
 *   ver el informe de la prueba mínima, 3/3 archivos) — se descarta el
 *   trazo, se conserva el relleno.
 * - Caso D (`stroke` puro, sin ningún relleno en todo el ícono): el diseño
 *   depende genuinamente del trazo — se conserva como `paintMode:
 *   'stroke'`, con un ancho derivado de `OPS.setLineWidth` real (nunca un
 *   valor fijo universal). Si los distintos anchos de trazo del archivo son
 *   demasiado inconsistentes entre sí como para elegir uno con confianza,
 *   `manual-review` — nunca se inventa un promedio de valores muy dispares.
 * - Caso E (`stroke` que NO es gemelo de ningún `fill`, en un ícono que SÍ
 *   tiene rellenos): ambiguo a propósito — no se decide si es redundante,
 *   un detalle real, o ruido — `manual-review`.
 * - Caso F (Etapa 6A — deduplicación `fill` vs `fill`): dos grupos de
 *   relleno pueden quedar en pie de igualdad como duplicados COMPLETOS del
 *   mismo diseño (ej. un PDF que dibuja el mismo ícono dos veces enteras —
 *   confirmado en `RANDOM_04.pdf`: dos pares trazo+relleno idénticos, uno
 *   al lado del otro). El Caso C ya descarta cada trazo redundante contra
 *   su propio relleno gemelo, pero no comparaba los DOS rellenos entre sí
 *   — dos `eoFill` geométricamente idénticos, superpuestos exactamente,
 *   se CANCELAN entre sí bajo la regla evenodd (paridad par = no
 *   relleno), dejando el ícono en blanco aunque cada paso previo haya
 *   actuado correctamente. Acá se detecta y descarta el duplicado exacto
 *   — nunca un componente distinto, un agujero, o un detalle chico
 *   parecido pero no idéntico (ver `areFillDuplicates` para el criterio
 *   exacto, deliberadamente estricto).
 */
import type { BoundingBox } from '../../src/editor/icons/normalizeIconPath.ts';
import { isFillPaintType, fillRuleOfPaintType, type EmittedCommand, type PaintedPathGroup } from './pdfToPaths.ts';

/**
 * Tolerancia relativa (respecto de la diagonal del bounding box más grande
 * de los dos) para considerar que un grupo de trazo y uno de relleno son
 * "el mismo contorno dibujado dos veces". Deliberadamente MUY más estricta
 * que `PROXIMITY_RATIO` de `spatialClustering.ts` (0.15, pensado para
 * agrupar detalles DISTINTOS de un mismo ícono): acá se busca casi-igualdad
 * geométrica, no cercanía — calibrado contra la evidencia real de la Etapa
 * 4 (bounding box IDÉNTICO en los 3 archivos de la prueba mínima), dejando
 * un margen chico solo por redondeo de punto flotante.
 */
const TWIN_BBOX_TOLERANCE_RATIO = 0.02;

/**
 * Cuánto puede tener DE MÁS la versión de trazo de un grupo respecto de su
 * posible gemelo de relleno, como proporción del relleno (nunca de menos:
 * un `eoFill` nunca necesita más `closePath` que su trazo gemelo). Un
 * `closePath` extra por SUBPATH es la diferencia esperada (el trazo cierra
 * cada subpath explícitamente; el relleno lo cierra implícitamente al
 * pintar) — para una forma con muchos subpaths (ej. un escudo con
 * decenas de detalles internos) esa diferencia crece con la cantidad de
 * subpaths, no es un número fijo. Calibrado contra un escaneo real de los
 * 307 PDFs (Etapa 4): la diferencia observada en pares gemelos reales fue
 * de hasta ~20% más comandos en la versión de trazo (nunca más) — 50% de
 * margen es generoso a propósito, para no perder pares gemelos legítimos
 * por una forma con muchos detalles, sin dejar de ser un criterio
 * proporcional (no absoluto, que fue lo que falló en la primera versión de
 * este archivo contra formas complejas reales).
 */
const TWIN_COMMAND_COUNT_MAX_RATIO = 1.5;

/** Ventana de búsqueda de "adyacencia" (en índice del stream original) para considerar que un trazo y un relleno pueden ser gemelos — evita emparejar por coincidencia de tamaño a dos formas completamente distintas y lejanas dentro del mismo ícono. Reutilizada tal cual (mismo criterio, mismo valor) por la deduplicación fill-vs-fill del Caso F — dos copias completas de un mismo diseño, en la práctica, siempre aparecen una al lado de la otra en el stream (ver `RANDOM_04.pdf`), nunca separadas por decenas de otros paths. */
const ADJACENCY_WINDOW = 4;

/**
 * Tolerancia ABSOLUTA (en unidades de página del PDF, el mismo espacio que
 * `PaintedPathGroup.boundingBox`/`subpaths`) para considerar que dos
 * coordenadas de comandos son "el mismo punto" al comparar geometría
 * punto por punto (Caso F, deduplicación fill-vs-fill) — cubre solo ruido
 * de punto flotante entre dos trazados que deberían ser idénticos, nunca
 * una diferencia de diseño real (que en la práctica es varios órdenes de
 * magnitud más grande que esto).
 */
const DUPLICATE_FILL_POINT_TOLERANCE = 0.01;

/** Si los distintos anchos de trazo detectados en un ícono `stroke`-only difieren más que esto (proporción del mayor sobre el menor), se considera que no hay un ancho confiable único — `manual-review` en vez de promediar valores muy dispares. */
const MAX_STROKE_WIDTH_RATIO = 2.5;

function boxDiagonal(b: BoundingBox): number {
  return Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
}

function boxGap(a: BoundingBox, b: BoundingBox): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.hypot(dx, dy);
}

/**
 * ¿Tienen, con tolerancia relativa a su propio tamaño, la MISMA posición y
 * el MISMO ancho/alto? Extraído como pieza compartida entre `areTwins`
 * (Caso C, trazo vs relleno) y `areFillDuplicates` (Caso F, relleno vs
 * relleno) — es el mismo criterio geométrico de "casi-igualdad de
 * bounding box" en los dos casos, calibrado contra la misma evidencia real
 * (ver `TWIN_BBOX_TOLERANCE_RATIO`).
 */
function boundingBoxesNearlyEqual(a: BoundingBox, b: BoundingBox, toleranceRatio: number): boolean {
  const diag = Math.max(boxDiagonal(a), boxDiagonal(b));
  const tolerance = Math.max(diag * toleranceRatio, 1e-6);
  if (boxGap(a, b) > tolerance) {
    return false;
  }
  const widthDiff = Math.abs((a.maxX - a.minX) - (b.maxX - b.minX));
  const heightDiff = Math.abs((a.maxY - a.minY) - (b.maxY - b.minY));
  return widthDiff <= tolerance && heightDiff <= tolerance;
}

/**
 * ¿Son, con tolerancia, el mismo contorno? Compara posición/tamaño de
 * bounding box (`boundingBoxesNearlyEqual`) y cantidad de comandos — el
 * orden de los parámetros importa para el chequeo de comandos:
 * `strokeGroup` nunca debería tener MENOS comandos que `fillGroup` (un
 * relleno no agrega `closePath` de más), y puede tener hasta
 * `TWIN_COMMAND_COUNT_MAX_RATIO` veces más (ver esa constante).
 */
function areTwins(strokeGroup: PaintedPathGroup, fillGroup: PaintedPathGroup): boolean {
  if (!boundingBoxesNearlyEqual(strokeGroup.boundingBox, fillGroup.boundingBox, TWIN_BBOX_TOLERANCE_RATIO)) {
    return false;
  }
  if (strokeGroup.commandCount < fillGroup.commandCount) {
    return false;
  }
  return strokeGroup.commandCount <= fillGroup.commandCount * TWIN_COMMAND_COUNT_MAX_RATIO;
}

/** ¿Es este un valor numérico presente en el comando (ej. `x`, `x1`), dentro de la tolerancia de punto? Los distintos códigos de comando (`M`/`L`/`C`/`Q`/`Z`) no comparten todos los mismos campos — se comparan solo los que existen en ambos (ya se validó antes que ambos comandos tienen el mismo `code`). */
function commandsMatch(a: EmittedCommand, b: EmittedCommand): boolean {
  if (a.code !== b.code) {
    return false;
  }
  switch (a.code) {
    case 'Z':
      return true;
    case 'M':
    case 'L': {
      const other = b as Extract<EmittedCommand, { code: 'M' | 'L' }>;
      return Math.abs(a.x - other.x) <= DUPLICATE_FILL_POINT_TOLERANCE && Math.abs(a.y - other.y) <= DUPLICATE_FILL_POINT_TOLERANCE;
    }
    case 'C': {
      const other = b as Extract<EmittedCommand, { code: 'C' }>;
      return Math.abs(a.x1 - other.x1) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.y1 - other.y1) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.x2 - other.x2) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.y2 - other.y2) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.x - other.x) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.y - other.y) <= DUPLICATE_FILL_POINT_TOLERANCE;
    }
    case 'Q': {
      const other = b as Extract<EmittedCommand, { code: 'Q' }>;
      return Math.abs(a.x1 - other.x1) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.y1 - other.y1) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.x - other.x) <= DUPLICATE_FILL_POINT_TOLERANCE
        && Math.abs(a.y - other.y) <= DUPLICATE_FILL_POINT_TOLERANCE;
    }
  }
}

/**
 * ¿Son estos dos conjuntos de subpaths geométricamente IDÉNTICOS (dentro
 * de tolerancia de punto flotante)? Comparación estricta, punto por punto,
 * en el MISMO orden — exactamente lo que produce una redibujada completa
 * del mismo diseño (ver `RANDOM_04.pdf`), y exactamente lo que NUNCA
 * produce un agujero, un detalle interno legítimo, o una forma distinta
 * que solo coincide en bounding box por casualidad (esos tienen una
 * secuencia de comandos distinta, aunque el tamaño/posición general
 * coincida). Es deliberadamente más estricta que `areTwins` (que solo
 * compara bounding box + cantidad de comandos): acá se está a punto de
 * DESCARTAR geometría de relleno completa, no un trazo ya sabido
 * redundante, así que la barra de evidencia es más alta.
 */
function subpathsAreIdentical(a: readonly EmittedCommand[][], b: readonly EmittedCommand[][]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const subpathA = a[i];
    const subpathB = b[i];
    if (subpathA.length !== subpathB.length) {
      return false;
    }
    for (let j = 0; j < subpathA.length; j++) {
      if (!commandsMatch(subpathA[j], subpathB[j])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * ¿Son estos dos grupos de RELLENO duplicados completos del mismo diseño
 * (Caso F)? Cuatro condiciones, TODAS necesarias — conservador a
 * propósito, para nunca confundir un agujero/detalle/componente distinto
 * con una redibujada duplicada:
 *  1. misma regla de relleno (`fillRuleOfPaintType` igual) — dos formas
 *     con reglas distintas nunca son "la misma redibujada";
 *  2. bounding box casi idéntico (`boundingBoxesNearlyEqual`, mismo
 *     criterio que el Caso C) — descarta de entrada cualquier par que ni
 *     siquiera ocupe el mismo lugar/tamaño;
 *  3. misma cantidad de comandos EXACTA — a diferencia del Caso C (donde
 *     el trazo puede tener más `closePath` que el relleno), acá los dos
 *     grupos son del mismo tipo de operación de pintado, así que una
 *     redibujada real no debería diferir en absoluto;
 *  4. geometría punto por punto idéntica (`subpathsAreIdentical`) — la
 *     condición decisiva: un agujero interior, aunque comparta bounding
 *     box exterior por coincidencia, tiene una secuencia de puntos
 *     completamente distinta a la del contorno que lo contiene.
 */
function areFillDuplicates(a: PaintedPathGroup, b: PaintedPathGroup): boolean {
  const ruleA = fillRuleOfPaintType(a.paintType);
  const ruleB = fillRuleOfPaintType(b.paintType);
  if (!ruleA || !ruleB || ruleA !== ruleB) {
    return false;
  }
  if (!boundingBoxesNearlyEqual(a.boundingBox, b.boundingBox, TWIN_BBOX_TOLERANCE_RATIO)) {
    return false;
  }
  if (a.commandCount !== b.commandCount) {
    return false;
  }
  return subpathsAreIdentical(a.subpaths, b.subpaths);
}

export type IconGeometryComposition =
  | {
    status: 'ok';
    paintMode: 'fill';
    fillRule: 'nonzero' | 'evenodd';
    subpaths: EmittedCommand[][];
    /** Cuántos grupos de trazo se descartaron por ser redundantes con un relleno gemelo — informativo/auditoría. */
    discardedRedundantStrokeCount: number;
    /** Cuántos grupos de RELLENO se descartaron por ser duplicados geométricos completos de otro relleno del mismo ícono (Caso F, Etapa 6A) — informativo/auditoría, 0 si no aplicó. */
    discardedDuplicateFillCount: number;
  }
  | {
    status: 'ok';
    paintMode: 'stroke';
    /** Ancho de trazo real derivado del PDF (espacio de página, TODAVÍA sin pasar por el factor de escala de `normalizeIconPath` — ver `classifyIcon.ts`, que multiplica esto por `normalized.scale`). */
    strokeWidth: number;
    subpaths: EmittedCommand[][];
  }
  | { status: 'manual-review'; reason: string };

/** Índice ORIGINAL (posición dentro de `paintGroups`, antes de particionar) de cada grupo — necesario para el criterio de adyacencia. */
interface IndexedGroup {
  group: PaintedPathGroup;
  originalIndex: number;
}

export function composeIconGeometry(paintGroups: readonly PaintedPathGroup[]): IconGeometryComposition {
  const indexed: IndexedGroup[] = paintGroups.map((group, originalIndex) => ({ group, originalIndex }));

  const fillEntries = indexed.filter((e) => isFillPaintType(e.group.paintType));
  const pureStrokeEntries = indexed.filter((e) => e.group.paintType === 'stroke' || e.group.paintType === 'closeStroke');

  if (fillEntries.length === 0 && pureStrokeEntries.length === 0) {
    return { status: 'manual-review', reason: 'no se encontró geometría pintada real (ni relleno ni trazo) tras descartar los paths no pintados.' };
  }

  // --- Emparejamiento trazo/relleno (Caso C) ---
  const matchedFillIndices = new Set<number>(); // índice dentro de fillEntries
  let discardedRedundantStrokeCount = 0;
  const orphanStrokeEntries: IndexedGroup[] = [];

  for (const strokeEntry of pureStrokeEntries) {
    let bestMatch: { fillEntryIndex: number; distance: number } | null = null;
    for (let f = 0; f < fillEntries.length; f++) {
      if (matchedFillIndices.has(f)) continue;
      const fillEntry = fillEntries[f];
      const distance = Math.abs(fillEntry.originalIndex - strokeEntry.originalIndex);
      if (distance > ADJACENCY_WINDOW) continue;
      if (!areTwins(strokeEntry.group, fillEntry.group)) continue;
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { fillEntryIndex: f, distance };
      }
    }
    if (bestMatch) {
      matchedFillIndices.add(bestMatch.fillEntryIndex);
      discardedRedundantStrokeCount++;
    } else {
      orphanStrokeEntries.push(strokeEntry);
    }
  }

  // --- Caso A/B: hay relleno ---
  if (fillEntries.length > 0) {
    if (orphanStrokeEntries.length > 0) {
      return {
        status: 'manual-review',
        reason: `se detectó geometría de trazo (${orphanStrokeEntries.length} grupo(s)) que no corresponde a ningún relleno cercano — podría ser un detalle real del diseño o ruido; no se decide automáticamente (Caso E).`,
      };
    }

    // --- Deduplicación fill-vs-fill (Caso F) — ver `areFillDuplicates` ---
    // Recorre pares DENTRO de la ventana de adyacencia (mismo criterio que
    // el Caso C) y descarta el segundo miembro de cada par que resulte ser
    // un duplicado geométrico completo del primero. Nunca descarta más de
    // un miembro por par (así que un agujero/detalle real, que por
    // definición NO pasa `areFillDuplicates` contra el contorno que lo
    // contiene, nunca puede perderse acá).
    const discardedFillIndices = new Set<number>(); // índice dentro de fillEntries
    let discardedDuplicateFillCount = 0;
    for (let i = 0; i < fillEntries.length; i++) {
      if (discardedFillIndices.has(i)) continue;
      for (let j = i + 1; j < fillEntries.length; j++) {
        if (discardedFillIndices.has(j)) continue;
        const distance = Math.abs(fillEntries[j].originalIndex - fillEntries[i].originalIndex);
        if (distance > ADJACENCY_WINDOW) continue;
        if (areFillDuplicates(fillEntries[i].group, fillEntries[j].group)) {
          discardedFillIndices.add(j);
          discardedDuplicateFillCount++;
        }
      }
    }
    const dedupedFillEntries = fillEntries.filter((_, index) => !discardedFillIndices.has(index));

    const fillRules = new Set<'nonzero' | 'evenodd'>();
    for (const entry of dedupedFillEntries) {
      const rule = fillRuleOfPaintType(entry.group.paintType);
      if (rule) fillRules.add(rule);
    }
    if (fillRules.size > 1) {
      return {
        status: 'manual-review',
        reason: `el diseño combina reglas de relleno distintas entre sus propias formas (${[...fillRules].join(' y ')}) — no se puede resolver con un único fillRule sin una decisión arbitraria.`,
      };
    }

    const fillRule = [...fillRules][0] ?? 'nonzero';
    const subpaths = dedupedFillEntries.flatMap((entry) => entry.group.subpaths);
    return { status: 'ok', paintMode: 'fill', fillRule, subpaths, discardedRedundantStrokeCount, discardedDuplicateFillCount };
  }

  // --- Caso D: solo trazo, sin ningún relleno en todo el ícono ---
  const strokeWidths = pureStrokeEntries.map((e) => e.group.effectiveLineWidth).filter((w) => Number.isFinite(w) && w > 0);
  if (strokeWidths.length === 0) {
    return { status: 'manual-review', reason: 'el ícono depende del trazo pero no se pudo determinar ningún ancho de línea real desde el PDF — no se inventa un valor.' };
  }
  const minWidth = Math.min(...strokeWidths);
  const maxWidth = Math.max(...strokeWidths);
  if (maxWidth / minWidth > MAX_STROKE_WIDTH_RATIO) {
    return {
      status: 'manual-review',
      reason: `los anchos de trazo detectados son demasiado inconsistentes entre sí (de ${minWidth.toFixed(3)} a ${maxWidth.toFixed(3)}, proporción ${(maxWidth / minWidth).toFixed(1)}x) como para elegir uno confiable sin arbitrariedad.`,
    };
  }
  const strokeWidth = strokeWidths.reduce((a, b) => a + b, 0) / strokeWidths.length;
  const subpaths = pureStrokeEntries.flatMap((entry) => entry.group.subpaths);
  return { status: 'ok', paintMode: 'stroke', strokeWidth, subpaths };
}
