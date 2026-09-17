/**
 * Pruebas de `composeIconGeometry.ts` — Etapa 4 (corrección de relleno/
 * trazo real). Construye `PaintedPathGroup[]` sintéticos (no requiere abrir
 * ningún PDF real) para probar cada caso del diseño técnico acordado.
 *
 * Correr: `node --test scripts/icon-import/composeIconGeometry.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeIconGeometry } from './composeIconGeometry.ts';
import type { PaintedPathGroup, PdfPaintType, EmittedCommand } from './pdfToPaths.ts';
import type { BoundingBox } from '../../src/editor/icons/normalizeIconPath.ts';

function box(minX: number, minY: number, maxX: number, maxY: number): BoundingBox {
  return { minX, minY, maxX, maxY };
}

function subpath(n: number): EmittedCommand[] {
  // Cantidad de comandos arbitraria pero controlada — solo importa el
  // largo para el criterio de "comandos equivalentes" de composeIconGeometry.
  const commands: EmittedCommand[] = [{ code: 'M', x: 0, y: 0 }];
  for (let i = 1; i < n; i++) commands.push({ code: 'L', x: i, y: i });
  return commands;
}

/** Como `subpath`, pero con una geometría DISTINTA de la misma longitud — para simular una forma distinta que coincide en bounding box/cantidad de comandos por coincidencia, no por ser la misma redibujada (Etapa 6A, Caso F). */
function differentSubpath(n: number): EmittedCommand[] {
  const commands: EmittedCommand[] = [{ code: 'M', x: 0, y: 10 }];
  for (let i = 1; i < n; i++) commands.push({ code: 'L', x: i, y: 10 - i });
  return commands;
}

/** Grupo de relleno con subpaths explícitos (en vez del genérico de `group()`) — para los casos de la Etapa 6A donde la geometría EXACTA importa (duplicados vs. agujeros/detalles distintos). */
function fillGroupWithSubpaths(paintType: PdfPaintType, boundingBox: BoundingBox, subpaths: EmittedCommand[][]): PaintedPathGroup {
  return {
    paintType,
    subpaths,
    boundingBox,
    commandCount: subpaths.reduce((sum, sp) => sum + sp.length, 0),
    effectiveLineWidth: 1,
  };
}

function group(paintType: PdfPaintType, opts: { boundingBox: BoundingBox; commandCount: number; effectiveLineWidth?: number }): PaintedPathGroup {
  return {
    paintType,
    subpaths: [subpath(opts.commandCount)],
    boundingBox: opts.boundingBox,
    commandCount: opts.commandCount,
    effectiveLineWidth: opts.effectiveLineWidth ?? 1,
  };
}

test('Caso A — fill puro -> paintMode: fill, fillRule: nonzero', () => {
  const result = composeIconGeometry([group('fill', { boundingBox: box(0, 0, 10, 10), commandCount: 5 })]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.paintMode, 'fill');
    if (result.paintMode === 'fill') assert.equal(result.fillRule, 'nonzero');
  }
});

test('Caso A — eoFill puro -> paintMode: fill, fillRule: evenodd', () => {
  const result = composeIconGeometry([group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 5 })]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.fillRule, 'evenodd');
  }
});

test('Caso D — stroke puro (sin ningún fill en el ícono) -> paintMode: stroke, con ancho derivado (no fijo)', () => {
  const result = composeIconGeometry([group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 5, effectiveLineWidth: 2.5 })]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.paintMode, 'stroke');
    if (result.paintMode === 'stroke') assert.equal(result.strokeWidth, 2.5);
  }
});

test('Caso C — stroke + eoFill "gemelos" (mismo bbox, comandos casi iguales, adyacentes) -> el stroke redundante se descarta, se conserva el fill', () => {
  const strokeGroup = group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 6 });
  const fillGroup = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 5 }); // 1 comando menos, igual que en la evidencia real
  const result = composeIconGeometry([strokeGroup, fillGroup]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.paintMode, 'fill');
    if (result.paintMode === 'fill') {
      assert.equal(result.fillRule, 'evenodd');
      assert.equal(result.discardedRedundantStrokeCount, 1);
      // La geometría final debe ser SOLO la del fill (1 subpath), no las dos.
      assert.equal(result.subpaths.length, 1);
    }
  }
});

test('Caso C (compound complejo) — un gemelo con muchas más formas internas puede diferir en varios comandos (no solo 1) y sigue reconociéndose como gemelo — encontrado escaneando los 307 PDFs reales (Escudo_07.pdf: un par difería en 28 comandos, no en 1)', () => {
  const strokeGroup = group('stroke', { boundingBox: box(0, 0, 65.9, 46.3), commandCount: 338 });
  const fillGroup = group('eoFill', { boundingBox: box(0, 0, 65.9, 46.3), commandCount: 310 });
  const result = composeIconGeometry([strokeGroup, fillGroup]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.discardedRedundantStrokeCount, 1);
  }
});

test('un trazo con MENOS comandos que su posible gemelo de relleno nunca se considera gemelo (un relleno nunca "ahorra" closePath respecto de su trazo)', () => {
  const strokeGroup = group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 3 });
  const fillGroup = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 20 });
  const result = composeIconGeometry([strokeGroup, fillGroup]);
  // No debe emparejarse (el trazo tiene menos comandos que el fill, algo
  // que nunca pasa entre gemelos reales) -> el trazo queda huérfano.
  assert.equal(result.status, 'manual-review');
});

test('Caso B — fillStroke (una sola geometría que pinta relleno y trazo a la vez) -> se conserva una sola vez como fill', () => {
  const result = composeIconGeometry([group('fillStroke', { boundingBox: box(0, 0, 10, 10), commandCount: 8 })]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.paintMode, 'fill');
    if (result.paintMode === 'fill') {
      assert.equal(result.fillRule, 'nonzero');
      assert.equal(result.subpaths.length, 1, 'la geometría no debe duplicarse');
    }
  }
});

test('Caso E — stroke que NO es gemelo de ningún fill (bbox distinto, ícono con relleno) -> manual-review, no se decide arbitrariamente', () => {
  const fillGroup = group('fill', { boundingBox: box(0, 0, 10, 10), commandCount: 5 });
  const orphanStroke = group('stroke', { boundingBox: box(50, 50, 60, 60), commandCount: 4 }); // lejos, tamaño distinto
  const result = composeIconGeometry([fillGroup, orphanStroke]);
  assert.equal(result.status, 'manual-review');
  if (result.status === 'manual-review') {
    assert.match(result.reason, /trazo/i);
  }
});

test('compound path (evenodd, múltiples subpaths en el mismo grupo) se conserva intacto', () => {
  const g: PaintedPathGroup = {
    paintType: 'eoFill',
    subpaths: [subpath(4), subpath(4)], // contorno exterior + agujero interior, mismo eoFill
    boundingBox: box(0, 0, 10, 10),
    commandCount: 8,
    effectiveLineWidth: 1,
  };
  const result = composeIconGeometry([g]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.fillRule, 'evenodd');
    assert.equal(result.subpaths.length, 2, 'los dos subpaths (exterior + agujero) deben preservarse juntos');
  }
});

test('mezcla de fill-rules distintas dentro del mismo ícono -> manual-review (no se elige uno arbitrariamente)', () => {
  const a = group('fill', { boundingBox: box(0, 0, 10, 10), commandCount: 5 });
  const b = group('eoFill', { boundingBox: box(20, 20, 30, 30), commandCount: 5 });
  const result = composeIconGeometry([a, b]);
  assert.equal(result.status, 'manual-review');
});

test('anchos de trazo muy inconsistentes en un ícono stroke-only -> manual-review (no se promedia arbitrariamente)', () => {
  const a = group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 5, effectiveLineWidth: 1 });
  const b = group('stroke', { boundingBox: box(20, 20, 30, 30), commandCount: 5, effectiveLineWidth: 10 });
  const result = composeIconGeometry([a, b]);
  assert.equal(result.status, 'manual-review');
});

test('sin ninguna geometría pintada (todo descartado antes de llegar acá) -> manual-review', () => {
  const result = composeIconGeometry([]);
  assert.equal(result.status, 'manual-review');
});

// ---------------------------------------------------------------------
// Caso F (Etapa 6A) — deduplicación fill-vs-fill.
// ---------------------------------------------------------------------

test('Caso F — dos fills geométricamente IDÉNTICOS (mismo bbox, misma geometría punto por punto) -> se descarta el duplicado, queda uno solo', () => {
  const a = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 7 });
  const b = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 7 }); // mismo commandCount -> subpath() genera EXACTAMENTE los mismos comandos
  const result = composeIconGeometry([a, b]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.subpaths.length, 1, 'debe quedar un solo subpath, no dos copias superpuestas');
    assert.equal(result.discardedDuplicateFillCount, 1);
  }
});

test('Caso F — dos fills claramente DIFERENTES (bounding box lejano) -> quedan ambos, nada se descarta', () => {
  const a = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 7 });
  const b = group('eoFill', { boundingBox: box(200, 200, 210, 210), commandCount: 7 });
  const result = composeIconGeometry([a, b]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.subpaths.length, 2, 'dos diseños distintos y lejanos deben conservarse los dos');
    assert.equal(result.discardedDuplicateFillCount, 0);
  }
});

test('Caso F — fills CERCANOS (uno al lado del otro, tamaño distinto) -> quedan ambos, no se confunde cercanía con duplicación', () => {
  const a = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 7 });
  // Al lado (sin superponerse) y de otro tamaño — ni el gap ni el ancho/alto
  // pasan la tolerancia de `boundingBoxesNearlyEqual`, así que ni siquiera
  // llega a compararse la geometría punto por punto.
  const b = group('eoFill', { boundingBox: box(15, 0, 20, 5), commandCount: 7 });
  const result = composeIconGeometry([a, b]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.subpaths.length, 2, 'formas cercanas pero de otro tamaño/posición deben conservarse las dos');
    assert.equal(result.discardedDuplicateFillCount, 0);
  }
});

test('Caso F — mismo bounding box EXTERIOR pero geometría distinta (ej. un agujero interior real) -> NO se elimina nada', () => {
  // Mismo bbox exterior y misma cantidad de comandos que un posible
  // "duplicado", pero la secuencia de puntos es otra — como pasaría con
  // un agujero interior o un detalle distinto que coincide en tamaño por
  // casualidad. La condición decisiva (`subpathsAreIdentical`) debe
  // rechazar este par.
  const a = fillGroupWithSubpaths('eoFill', box(0, 0, 10, 10), [subpath(7)]);
  const b = fillGroupWithSubpaths('eoFill', box(0, 0, 10, 10), [differentSubpath(7)]);
  const result = composeIconGeometry([a, b]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.subpaths.length, 2, 'geometría distinta con bbox coincidente no debe tratarse como duplicado');
    assert.equal(result.discardedDuplicateFillCount, 0);
  }
});

test('Caso F — un fill compuesto (contorno exterior + agujero interior, mismo grupo) no pierde su agujero aunque haya OTRO fill distinto cerca', () => {
  const compound = fillGroupWithSubpaths('eoFill', box(0, 0, 10, 10), [subpath(7), differentSubpath(4)]); // exterior + agujero
  const otherNearby = group('eoFill', { boundingBox: box(1, 1, 11, 11), commandCount: 5 }); // cercano, pero distinto
  const result = composeIconGeometry([compound, otherNearby]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    // 2 subpaths del compuesto (exterior + agujero) + 1 del otro grupo = 3.
    assert.equal(result.subpaths.length, 3, 'el agujero interno y el otro diseño cercano deben conservarse todos');
    assert.equal(result.discardedDuplicateFillCount, 0);
  }
});

test('Caso F — fixture que reproduce RANDOM_04.pdf: dos pares stroke+eoFill IDÉNTICOS (el mismo ícono dibujado dos veces enteras) -> el resultado final es UN solo diseño, no queda en blanco', () => {
  // Mismo patrón real encontrado en RANDOM_04.pdf: stroke, eoFill, stroke,
  // eoFill — dos copias completas, cada trazo emparejado con su propio
  // relleno (Caso C ya lo resolvía bien), pero los DOS rellenos entre sí
  // también son duplicados exactos (lo que antes de esta corrección
  // producía una cancelación por paridad par bajo evenodd al pintar dos
  // copias idénticas superpuestas).
  const strokeA = group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 8 });
  const fillA = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 7 });
  const strokeB = group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 8 });
  const fillB = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 7 });
  const result = composeIconGeometry([strokeA, fillA, strokeB, fillB]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.paintMode, 'fill');
    if (result.paintMode === 'fill') {
      assert.equal(result.discardedRedundantStrokeCount, 2, 'los dos trazos redundantes se descartan (Caso C, sin cambios)');
      assert.equal(result.discardedDuplicateFillCount, 1, 'uno de los dos rellenos idénticos se descarta (Caso F, nuevo)');
      assert.equal(result.subpaths.length, 1, 'debe quedar geometría real — nunca dos copias superpuestas que se cancelen');
    }
  }
});

test('Caso F no rompe la deduplicación stroke-vs-fill existente (Caso C): sigue reportando discardedDuplicateFillCount: 0 cuando no hay fills duplicados', () => {
  const strokeGroup = group('stroke', { boundingBox: box(0, 0, 10, 10), commandCount: 6 });
  const fillGroup = group('eoFill', { boundingBox: box(0, 0, 10, 10), commandCount: 5 });
  const result = composeIconGeometry([strokeGroup, fillGroup]);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok' && result.paintMode === 'fill') {
    assert.equal(result.discardedRedundantStrokeCount, 1);
    assert.equal(result.discardedDuplicateFillCount, 0);
    assert.equal(result.subpaths.length, 1);
  }
});
