/**
 * Clasificador "¿es esto un único ícono simple y limpio?" — Etapa 2,
 * ajuste de criterio pedido por el usuario: NO importar automáticamente
 * todo lo que sea vectorial, solo lo que claramente sea un único diseño
 * coherente. Ante cualquier duda razonable, `manual-review` — nunca se
 * intenta "arreglar" (elegir un diseño de varios, recortar, fusionar,
 * inventar una interpretación): eso queda para una persona.
 *
 * Etapa 4 (corrección de relleno/trazo real): además de decidir si el PDF
 * es "un solo diseño", ahora también decide CÓMO se pinta ese diseño
 * (`paintMode`/`fillRule`/`strokeWidth`) — vía `composeIconGeometry.ts`,
 * que resuelve el paint type real de cada `constructPath` (ver
 * `pdfToPaths.ts`) antes de que la geometría llegue a `normalizeIconPath`.
 * El orden importa: SIEMPRE se compone/filtra primero, y recién con la
 * geometría ya resuelta se normaliza — así `normalizeIconPath` (sin
 * cambios en su lógica interna) nunca ve trazos redundantes, clipping, ni
 * geometría no pintada.
 *
 * No es un clasificador de Machine Learning ni una heurística "de caja
 * negra" — cada `reason` que produce es una frase concreta atada a una
 * métrica auditable (ver `metrics` en el resultado), para que revisar por
 * qué algo cayó en `manual-review` sea tan simple como leer un número.
 */
import { normalizeIconPath, computeBoundingBox, type AbsCommand } from '../../src/editor/icons/normalizeIconPath.ts';
import type { PdfExtractionResult, EmittedCommand } from './pdfToPaths.ts';
import { composeIconGeometry } from './composeIconGeometry.ts';
import { clusterBoundingBoxes, countSignificantClusters } from './spatialClustering.ts';

export type IconClassificationStatus = 'valid' | 'manual-review';

export interface IconClassificationMetrics {
  numPages: number;
  subpathCount: number;
  commandCount: number;
  /** Cantidad TOTAL de grupos espacialmente independientes (crudo, antes de filtrar por tamaño) — informativo/auditoría, ver `rawClusterCount` vs `significantClusterCount`. */
  rawClusterCount: number;
  /** Cantidad de grupos lo bastante grandes como para contar como "un diseño real" (ver `countSignificantClusters`, `spatialClustering.ts`) — ESTA es la señal que decide "¿un solo ícono o varios?", no `rawClusterCount` (que puede ser alto incluso en un ícono legítimo con muchos detalles chicos). */
  significantClusterCount: number;
  /** Área del grupo más grande, como fracción del área combinada de TODOS los grupos — 1.0 si hay un solo grupo. */
  largestClusterAreaShare: number;
  /** Cuántas unidades² de página ocupa la tinta real (suma de las áreas de cada grupo) contra el área del bounding box combinado de todo — "densidad de tinta"; bajo puede indicar elementos dispersos tipo lámina/composición, no un solo ícono compacto. Informativo — no decide por sí solo. */
  inkDensity: number;
  hasRasterImage: boolean;
  hasLiveText: boolean;
  warningCount: number;
  /** Cómo se resolvió el pintado del ícono (Etapa 4) — `null` si nunca se llegó a resolver (algún otro motivo de `manual-review` ya cortó antes, o `composeIconGeometry` no pudo decidir). */
  paintMode: 'fill' | 'stroke' | null;
  /** Cuántos grupos de trazo se descartaron por ser redundantes con un relleno gemelo (Caso C del diseño técnico) — informativo/auditoría, 0 si no aplicó. */
  discardedRedundantStrokeCount: number;
}

export interface IconClassification {
  status: IconClassificationStatus;
  /** Motivo(s) — vacío si `status === 'valid'`. Puede haber más de uno. */
  reasons: string[];
  metrics: IconClassificationMetrics;
  /** Presente solo si `status === 'valid'` — el resultado ya normalizado, listo para convertirse en `IconAsset`. */
  normalizedD?: string;
  /** Presente solo si `status === 'valid'` — ver `IconAsset.paintMode`. */
  paintMode?: 'fill' | 'stroke';
  /** Presente solo si `status === 'valid'` — ver `IconAsset.fillRule`. Significativo solo si `paintMode === 'fill'`. */
  fillRule?: 'nonzero' | 'evenodd';
  /** Presente solo si `status === 'valid' && paintMode === 'stroke'` — YA multiplicado por el factor de escala de `normalizeIconPath` (ver `NormalizedIconPath.scale`), listo para usar tal cual en el viewBox `0 0 100 100`. */
  strokeWidth?: number;
}

/**
 * Techo de complejidad — NO es "más de X subpaths = inválido" (eso es
 * exactammente lo que se pidió evitar): un ícono con muchos subpaths
 * legítimos y AGRUPADOS (`clusterCount === 1`) sigue pasando sin importar
 * cuántos sean — el pug de prueba tiene 63 subpaths y 1136 comandos y es
 * `valid`. Esto es solo una red de seguridad final contra geometría
 * desproporcionadamente compleja para lo que puede ser un ícono simple de
 * grabado (muy por debajo de `MAX_COMMANDS=20000`, que es la defensa dura
 * del normalizador) — un archivo real de engranajes de la muestra llegó a
 * 5518 y se ve razonable considerarlo válido si además pasa como 1 solo
 * grupo; el número exacto es una decisión de producto, no una ciencia
 * exacta — ajustable después de ver el piloto.
 *
 * Se mide sobre la geometría YA COMPUESTA (Etapa 4) — nunca sobre el total
 * crudo de `constructPath` del PDF, que hoy puede incluir trazos
 * redundantes descartados (ver `composeIconGeometry.ts`, Caso C) y que
 * inflarían la complejidad medida sin representar geometría real del
 * ícono final.
 */
const COMPLEXITY_WARNING_THRESHOLD = 8000;

function toAbsCommands(subpaths: readonly EmittedCommand[][]): AbsCommand[][] {
  // `EmittedCommand` (pdfToPaths.ts) es un subconjunto estructural exacto de
  // `AbsCommand` (normalizeIconPath.ts) — mismas variantes M/L/C/Q/Z, sin
  // `A` (PDF no tiene arcos nativos, ver pdfToPaths.ts) — así que no hace
  // falta convertir nada dato por dato, solo tipar la lista para poder
  // reusar `computeBoundingBox` sin duplicar esa lógica acá.
  return subpaths as unknown as AbsCommand[][];
}

function serializeForNormalize(subpaths: readonly EmittedCommand[][]): string {
  function round(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
  return subpaths
    .flat()
    .map((c) => {
      switch (c.code) {
        case 'M': return `M${round(c.x)},${round(c.y)}`;
        case 'L': return `L${round(c.x)},${round(c.y)}`;
        case 'C': return `C${round(c.x1)},${round(c.y1)} ${round(c.x2)},${round(c.y2)} ${round(c.x)},${round(c.y)}`;
        case 'Q': return `Q${round(c.x1)},${round(c.y1)} ${round(c.x)},${round(c.y)}`;
        case 'Z': return 'Z';
      }
    })
    .join(' ');
}

function safeNormalize(d: string): { d: string; scale: number } | { error: string } {
  try {
    const result = normalizeIconPath(d);
    return { d: result.d, scale: result.scale };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function classifyIcon(extraction: PdfExtractionResult): IconClassification {
  const reasons: string[] = [];

  if (extraction.numPages !== 1) {
    reasons.push(`el PDF tiene ${extraction.numPages} páginas (se espera exactamente 1).`);
  }
  if (extraction.hasRasterImage) {
    reasons.push('contiene al menos una imagen rasterizada.');
  }
  if (extraction.hasLiveText) {
    reasons.push('contiene texto pintado directamente (no convertido a trazos).');
  }

  // Composición de geometría (Etapa 4) — SIEMPRE antes de medir clusters/
  // complejidad/normalizar: decide qué paths son relleno real, cuáles son
  // trazo redundante a descartar, cuáles quedan como trazo puro, y cuáles
  // son ambiguos (ver `composeIconGeometry.ts`). Se ejecuta aunque ya haya
  // motivos de `manual-review` de las banderas de arriba, para que las
  // métricas de auditoría (subpathCount, clusters, etc.) sigan siendo
  // informativas incluso en un archivo que ya se sabe que no va a
  // importarse por otro motivo.
  const composition = composeIconGeometry(extraction.paintGroups);
  if (composition.status === 'manual-review') {
    reasons.push(composition.reason);
  }

  const finalSubpaths = composition.status === 'ok' ? composition.subpaths : extraction.paintGroups.flatMap((g) => g.subpaths);
  const subpathCount = finalSubpaths.length;
  const commandCount = finalSubpaths.reduce((sum, sp) => sum + sp.length, 0);

  if (subpathCount === 0) {
    reasons.push('no se encontró geometría vectorial pintada (ni relleno ni trazo).');
  }

  const subpathBoundingBoxes = toAbsCommands(finalSubpaths).map((sp) => computeBoundingBox(sp));
  const clusters = clusterBoundingBoxes(subpathBoundingBoxes);
  const rawClusterCount = clusters.length;
  const significantClusterCount = countSignificantClusters(clusters);
  const totalClusterArea = clusters.reduce((sum, c) => sum + c.area, 0);
  const largestClusterAreaShare = rawClusterCount > 0 ? clusters[0].area / totalClusterArea : 0;
  const combinedBox = subpathBoundingBoxes.length > 0
    ? subpathBoundingBoxes.reduce((a, b) => ({
      minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
    }))
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const combinedArea = Math.max(0, combinedBox.maxX - combinedBox.minX) * Math.max(0, combinedBox.maxY - combinedBox.minY);
  const inkDensity = combinedArea > 0 ? totalClusterArea / combinedArea : 0;

  if (significantClusterCount >= 2) {
    const areas = clusters.map((c) => Math.round(c.area)).join(', ');
    reasons.push(`se detectaron ${significantClusterCount} grupos de tamaño comparable (posibles varios diseños en la misma página) — áreas de cada grupo: [${areas}].`);
  }

  if (commandCount > COMPLEXITY_WARNING_THRESHOLD) {
    reasons.push(`geometría muy compleja para un ícono simple (${commandCount} comandos, por encima del umbral de ${COMPLEXITY_WARNING_THRESHOLD}).`);
  }

  const metrics: IconClassificationMetrics = {
    numPages: extraction.numPages,
    subpathCount,
    commandCount,
    rawClusterCount,
    significantClusterCount,
    largestClusterAreaShare,
    inkDensity,
    hasRasterImage: extraction.hasRasterImage,
    hasLiveText: extraction.hasLiveText,
    warningCount: extraction.warnings.length,
    paintMode: composition.status === 'ok' ? composition.paintMode : null,
    discardedRedundantStrokeCount: composition.status === 'ok' && composition.paintMode === 'fill' ? composition.discardedRedundantStrokeCount : 0,
  };

  // Ya hay motivo de manual-review por alguna de las señales de arriba —
  // ni siquiera se intenta normalizar (no tiene sentido gastar ese trabajo
  // en algo que ya sabemos que no se va a importar).
  if (reasons.length > 0 || composition.status !== 'ok') {
    return { status: 'manual-review', reasons, metrics };
  }

  const rawD = serializeForNormalize(composition.subpaths);
  const normalized = safeNormalize(rawD);
  if ('error' in normalized) {
    return {
      status: 'manual-review',
      reasons: [`no se pudo normalizar de forma segura: ${normalized.error}`],
      metrics,
    };
  }

  if (composition.paintMode === 'fill') {
    return {
      status: 'valid',
      reasons: [],
      metrics,
      normalizedD: normalized.d,
      paintMode: 'fill',
      fillRule: composition.fillRule,
    };
  }

  return {
    status: 'valid',
    reasons: [],
    metrics,
    normalizedD: normalized.d,
    paintMode: 'stroke',
    fillRule: 'nonzero',
    // Ancho de trazo real del PDF (espacio de página) escalado por el MISMO
    // factor uniforme que `normalizeIconPath` acaba de aplicar a la
    // geometría (`NormalizedIconPath.scale`, campo aditivo de esta etapa) —
    // así el trazo queda proporcionalmente correcto en el viewBox `0 0 100
    // 100`, nunca un valor fijo universal (ver el diseño técnico, Caso D).
    strokeWidth: composition.strokeWidth * normalized.scale,
  };
}
