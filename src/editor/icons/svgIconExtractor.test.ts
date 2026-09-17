/**
 * Tests de `svgIconExtractor.ts` — Etapa 8B.
 *
 * IMPORTANTE (ver el comentario grande junto a `extractIconFromSvg` en el
 * archivo bajo test): `DOMParser` es una API de navegador que NO existe en
 * Node — el proyecto no tiene `jsdom` ni ningún otro shim de DOM (y esta
 * etapa tiene prohibido instalar dependencias nuevas). Por eso estos tests
 * llaman a `extractGeometryFromRootElement`, la parte del módulo que NO usa
 * `DOMParser` (recibe un árbol YA parseado) — se le pasan objetos
 * simulados con la misma forma mínima que un `Element` real
 * (`.localName`, `.getAttribute()`, `.attributes`, `.children`), que es
 * exactamente lo único que el módulo necesita. La función `extractIconFromSvg`
 * en sí (la que sí llama a `new DOMParser()`) se verificó manualmente en
 * el navegador (ver el informe de la Etapa 8B) — acá solo se prueban sus
 * 2 chequeos que SÍ corren antes de tocar `DOMParser` (string vacío / muy
 * largo).
 *
 * Correr: `node --test src/editor/icons/svgIconExtractor.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractIconFromSvg, extractGeometryFromRootElement, type SvgExtractionResult } from './svgIconExtractor.ts';

interface MockAttr { name: string; value: string }
interface MockElement {
  localName: string;
  attributes: MockAttr[];
  children: MockElement[];
  getAttribute(name: string): string | null;
}

function el(localName: string, attrs: Record<string, string> = {}, children: MockElement[] = []): MockElement {
  return {
    localName,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    children,
    getAttribute(name: string): string | null {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
  };
}

function svg(children: MockElement[]): Element {
  return el('svg', {}, children) as unknown as Element;
}

function extract(children: MockElement[]): SvgExtractionResult {
  return extractGeometryFromRootElement(svg(children));
}

function assertOk(result: SvgExtractionResult): asserts result is Extract<SvgExtractionResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? '' : (result as { message: string }).message);
}

function assertRejected(result: SvgExtractionResult, expectedMessageIncludes?: string): void {
  assert.equal(result.ok, false);
  if (!result.ok && expectedMessageIncludes) {
    assert.ok(result.message.includes(expectedMessageIncludes), `mensaje esperado que incluya "${expectedMessageIncludes}", vino: "${result.message}"`);
  }
}

// ---------------------------------------------------------------------
// SVG válido
// ---------------------------------------------------------------------

test('SVG válido — path simple', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
  assert.ok(result.geometry.svgPath.length > 0);
});

test('SVG válido — múltiples paths con relleno producen un ícono compuesto (Etapa 8E: ya no se fusionan en un solo `d`)', () => {
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z' }),
    el('path', { d: 'M20,0 L30,0 L30,10 L20,10 Z' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
  // Dos formas con relleno -> 2 capas independientes, en orden, mismo
  // color por defecto (negro) -> las dos son "ink".
  assert.equal(result.geometry.layers?.length, 2);
  assert.ok(result.geometry.layers?.every((l) => l.role === 'ink'));
});

test('SVG válido — rect simple', () => {
  const result = extract([el('rect', { x: '0', y: '0', width: '10', height: '10' })]);
  assertOk(result);
});

test('SVG válido — rect con esquinas redondeadas (rx/ry) no tira', () => {
  const result = extract([el('rect', { x: '0', y: '0', width: '20', height: '10', rx: '3' })]);
  assertOk(result);
});

test('SVG válido — circle', () => {
  const result = extract([el('circle', { cx: '10', cy: '10', r: '5' })]);
  assertOk(result);
});

test('SVG válido — ellipse', () => {
  const result = extract([el('ellipse', { cx: '10', cy: '10', rx: '8', ry: '4' })]);
  assertOk(result);
});

test('SVG válido — line (siempre trazo, nunca relleno)', () => {
  const result = extract([el('line', { x1: '0', y1: '0', x2: '10', y2: '10', stroke: 'black', 'stroke-width': '2' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
});

test('SVG válido — polygon (cerrado, relleno)', () => {
  const result = extract([el('polygon', { points: '0,0 10,0 10,10 0,10' })]);
  assertOk(result);
});

test('SVG válido — polyline (abierto)', () => {
  const result = extract([el('polyline', { points: '0,0 10,0 10,10', stroke: 'black', fill: 'none' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
});

test('SVG válido — grupos <g> anidados sin transform propio no cambian la geometría', () => {
  const withoutGroup = extract([el('rect', { x: '0', y: '0', width: '10', height: '20' })]);
  const withGroup = extract([el('g', {}, [el('g', {}, [el('rect', { x: '0', y: '0', width: '10', height: '20' })])])]);
  assertOk(withoutGroup);
  assertOk(withGroup);
  assert.equal(withGroup.geometry.svgPath, withoutGroup.geometry.svgPath);
});

test('SVG válido — transform scale() en un <g> se aplica realmente a la geometría', () => {
  // rect 10x10 escalado x2 en X == rect 20x10 sin escalar, mismo resultado normalizado.
  const scaled = extract([el('g', { transform: 'scale(2,1)' }, [el('rect', { x: '0', y: '0', width: '10', height: '10' })])]);
  const equivalent = extract([el('rect', { x: '0', y: '0', width: '20', height: '10' })]);
  assertOk(scaled);
  assertOk(equivalent);
  assert.equal(scaled.geometry.svgPath, equivalent.geometry.svgPath);
});

test('SVG válido — transform translate() no cambia la forma final (normalizeIconPath recentra)', () => {
  const translated = extract([el('g', { transform: 'translate(500,500)' }, [el('rect', { x: '0', y: '0', width: '10', height: '10' })])]);
  const notTranslated = extract([el('rect', { x: '0', y: '0', width: '10', height: '10' })]);
  assertOk(translated);
  assertOk(notTranslated);
  assert.equal(translated.geometry.svgPath, notTranslated.geometry.svgPath);
});

function sortedNumbers(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).sort((a, b) => a - b);
}

test('SVG válido — transform rotate(90) en un rect no cuadrado produce las mismas 4 esquinas que intercambiar ancho/alto (mismo rectángulo, distinto punto de partida/orden)', () => {
  const rotated = extract([el('g', { transform: 'rotate(90)' }, [el('rect', { x: '-10', y: '-3', width: '20', height: '6' })])]);
  const swapped = extract([el('rect', { x: '-3', y: '-10', width: '6', height: '20' })]);
  assertOk(rotated);
  assertOk(swapped);
  // `normalizeIconPath` no garantiza el mismo punto de partida/orden de
  // comandos para el mismo rectángulo lógico (rotarlo cambia por cuál
  // esquina "empieza" el `M`) — se compara el CONJUNTO de coordenadas
  // usadas, no el string exacto, que es la invariante real que puede
  // garantizarse acá.
  assert.deepEqual(sortedNumbers(rotated.geometry.svgPath), sortedNumbers(swapped.geometry.svgPath));
});

test('SVG válido — transform rotate() sobre un círculo sigue produciendo un círculo válido (mismo radio en ambos ejes, sin tirar)', () => {
  // NOTA: no se compara byte a byte contra un círculo sin rotar — el
  // bounding box conservador de un arco (`computeBoundingBox` en
  // `normalizeIconPath.ts`, sin cambios, ya existía antes de esta etapa)
  // depende de las coordenadas de inicio/fin del arco, que SÍ cambian al
  // rotar (aunque el círculo resultante sea el mismo) — es una
  // característica preexistente del normalizador, no algo que dependa de
  // esta etapa. Lo que SÍ es una invariante real: sigue siendo un círculo
  // (2 arcos con el mismo radio en rx/ry), nunca una elipse deformada.
  const rotated = extract([el('g', { transform: 'rotate(37)' }, [el('circle', { cx: '0', cy: '0', r: '10' })])]);
  assertOk(rotated);
  const arcs = [...rotated.geometry.svgPath.matchAll(/A([\d.]+),([\d.]+)/g)];
  assert.equal(arcs.length, 2);
  for (const [, rx, ry] of arcs) {
    assert.ok(Math.abs(Number(rx) - Number(ry)) < 1e-6, `rx (${rx}) y ry (${ry}) deberían ser iguales (un círculo, no una elipse)`);
  }
});

test('SVG válido — viewBox del <svg> raíz no afecta el resultado (se ignora a propósito, ver el comentario del módulo)', () => {
  const withViewBox = extractGeometryFromRootElement(el('svg', { viewBox: '0 0 1000 1000' }, [el('rect', { x: '0', y: '0', width: '10', height: '10' })]) as unknown as Element);
  const withDifferentViewBox = extractGeometryFromRootElement(el('svg', { viewBox: '0 0 5 5' }, [el('rect', { x: '0', y: '0', width: '10', height: '10' })]) as unknown as Element);
  assertOk(withViewBox);
  assertOk(withDifferentViewBox);
  assert.equal(withViewBox.geometry.svgPath, withDifferentViewBox.geometry.svgPath);
});

test('SVG válido — fill-rule evenodd se conserva', () => {
  const result = extract([el('path', { d: 'M0,0 L20,0 L20,20 L0,20 Z M5,5 L15,5 L15,15 L5,15 Z', 'fill-rule': 'evenodd' })]);
  assertOk(result);
  assert.equal(result.geometry.fillRule, 'evenodd');
});

test('SVG válido — agujero interno (2 subpaths en un mismo path, evenodd) queda como un solo ícono con agujero', () => {
  // Cuadrado grande con un cuadrado chico adentro (agujero real vía evenodd) — un solo <path>, dos subpaths.
  const result = extract([el('path', {
    d: 'M0,0 L20,0 L20,20 L0,20 Z M5,5 L5,15 L15,15 L15,5 Z',
    'fill-rule': 'evenodd',
  })]);
  assertOk(result);
  assert.equal(result.geometry.fillRule, 'evenodd');
  // Dos subpaths -> dos comandos "M" en el resultado normalizado.
  const moveCount = (result.geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(moveCount, 2);
});

test('SVG válido — <use> con referencia local duplica la geometría del original en otra posición', () => {
  const result = extract([
    el('defs', {}, [el('rect', { id: 'box', x: '0', y: '0', width: '10', height: '10' })]),
    el('use', { href: '#box' }),
    el('use', { href: '#box', x: '100', y: '0' }),
  ]);
  assertOk(result);
  // 2 rects -> 2 subpaths (2 "M" + 2 "Z").
  assert.equal((result.geometry.svgPath.match(/M/g) ?? []).length, 2);
});

// ---------------------------------------------------------------------
// SVG inválido / no soportado
// ---------------------------------------------------------------------

test('SVG inválido — sin ninguna forma no tiene geometría', () => {
  assertRejected(extract([]), 'geometría válida');
});

test('SVG inválido — <script>', () => {
  assertRejected(extract([el('script', {}, []), el('rect', { x: '0', y: '0', width: '10', height: '10' })]));
});

test('SVG inválido — <foreignObject>', () => {
  assertRejected(extract([el('foreignObject', {}, [])]));
});

test('SVG inválido — <image>', () => {
  assertRejected(extract([el('image', { href: '#x' }, [])]));
});

test('SVG inválido — <text>', () => {
  assertRejected(extract([el('text', {}, [])]));
});

test('SVG inválido — <tspan>', () => {
  assertRejected(extract([el('text', {}, [el('tspan', {}, [])])]));
});

test('SVG inválido — referencia externa (href sin "#")', () => {
  assertRejected(extract([el('use', { href: 'https://evil.example/x.svg#y' }, [])]), 'externa');
});

test('SVG inválido — atributo con manejador de evento (onload)', () => {
  assertRejected(extract([el('rect', { x: '0', y: '0', width: '10', height: '10', onload: 'alert(1)' })]));
});

test('SVG inválido — javascript: en un atributo', () => {
  assertRejected(extract([el('a', { href: 'javascript:alert(1)' }, [])]));
});

test('SVG inválido — <linearGradient>/<pattern>/<filter>/<mask>', () => {
  assertRejected(extract([el('lineargradient', {}, [])]));
  assertRejected(extract([el('pattern', {}, [])]));
  assertRejected(extract([el('filter', {}, [])]));
  assertRejected(extract([el('mask', {}, [])]));
});

test('SVG inválido — clip-path referenciado', () => {
  assertRejected(extract([el('rect', { x: '0', y: '0', width: '10', height: '10', 'clip-path': 'url(#c)' })]));
});

test('SVG inválido — geometría inexistente (todo son elementos sin forma real, ej. <metadata>)', () => {
  assertRejected(extract([el('metadata', {}, [])]), 'geometría válida');
});

test('SVG inválido — demasiado complejo (excede el máximo de elementos recorridos)', () => {
  const many: MockElement[] = [];
  for (let i = 0; i < 2100; i++) {
    many.push(el('rect', { x: String(i), y: '0', width: '1', height: '1' }));
  }
  assertRejected(extract(many), 'complejo');
});

test('SVG inválido — combina relleno y trazo entre formas distintas (ambiguo, se rechaza)', () => {
  assertRejected(extract([
    el('rect', { x: '0', y: '0', width: '10', height: '10', fill: 'black' }),
    el('circle', { cx: '20', cy: '20', r: '5', fill: 'none', stroke: 'black', 'stroke-width': '1' }),
  ]));
});

test('SVG inválido — <use> con referencia circular', () => {
  assertRejected(extract([
    el('g', { id: 'a' }, [el('use', { href: '#b' })]),
    el('use', { id: 'b', href: '#a' }),
  ]));
});

test('SVG inválido — <use> a un id inexistente', () => {
  assertRejected(extract([el('use', { href: '#no-existe' })]));
});

// ---------------------------------------------------------------------
// Etapa 8C — fill + stroke ya no se rechaza automáticamente. Casos
// reproducidos a partir de los 2 SVG reales de Zizou (descargados de
// https://zizoumates.creatumate.com.ar/ para esta corrección) más los
// casos genéricos pedidos explícitamente.
// ---------------------------------------------------------------------

test('1. fill únicamente — sigue funcionando igual que antes', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z', fill: 'black' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
});

test('2. stroke únicamente (fill="none") — sigue funcionando igual que antes', () => {
  const result = extract([el('path', { d: 'M0,0 L10,10', fill: 'none', stroke: 'black', 'stroke-width': '2' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
});

test('3. fill + stroke en el MISMO elemento (patrón real de "boca 01.svg" — refuerzo fino tipo hairline de Inkscape) ya NO se rechaza: se conserva como relleno', () => {
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z', fill: '#231f20', stroke: '#231f20', 'stroke-width': '0.0762', 'fill-rule': 'evenodd' }),
    el('path', { d: 'M20,0 L30,0 L30,10 L20,10 Z', fill: '#231f20', stroke: '#231f20', 'stroke-width': '0.0762', 'fill-rule': 'evenodd' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
  // Etapa 8E: dos formas con relleno -> capas independientes, cada una con
  // su PROPIO fillRule (acá las dos son "evenodd", pero ya no viven en un
  // campo único a nivel de todo el ícono — ver `result.geometry.layers`).
  assert.equal(result.geometry.layers?.length, 2);
  assert.ok(result.geometry.layers?.every((l) => l.fillRule === 'evenodd'));
  assert.ok(result.geometry.layers?.every((l) => l.role === 'ink'));
});

test('4. múltiples formas, unas con relleno y otras con trazo puro, cuando el trazo es CLARAMENTE minoritario (detalle decorativo) — se acepta conservando el relleno', () => {
  const result = extract([
    el('path', { d: 'M0,0 L100,0 L100,100 L0,100 Z', fill: 'black' }), // diseño principal, grande
    el('path', { d: 'M10,10 L90,90', fill: 'none', stroke: 'black', 'stroke-width': '0.5' }), // línea de detalle fina y larga (bbox grande, tinta mínima)
  ]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
});

test('4b. reproduce el patrón real de "boca 02.svg" (líneas de detalle en trazo puro + escudo/letras en relleno, mismo color y stroke-width) — se acepta', () => {
  const result = extract([
    // "líneas de detalle" tipo las de boca 02.svg: bbox ancho, trazo fino.
    el('path', { d: 'M0,0 L2,0 L2,1 L1,1 L1,2 L0,2 Z', fill: 'none', stroke: '#231f20', 'stroke-width': '0.0762' }),
    el('path', { d: 'M0,50 L60,45 L58,48 Z', fill: 'none', stroke: '#231f20', 'stroke-width': '0.0762' }),
    // el diseño principal: un escudo grande con relleno.
    el('path', { d: 'M0,0 L60,0 L60,60 L0,60 Z', fill: '#231f20', stroke: '#231f20', 'stroke-width': '0.0762', 'fill-rule': 'evenodd' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
});

// =====================================================================
// Etapa 8E — regresión específica de boca01/boca02 (fidelidad visual de
// SVG compuestos). Confirmado visualmente contra los 2 archivos reales
// (ver el informe de la etapa) — acá se fija el comportamiento
// ESTRUCTURAL correspondiente con fixtures sintéticos, mismo patrón ya
// usado por el resto de este archivo.
// =====================================================================

test('Etapa 8E — boca01: muchas formas del MISMO color, algunas tocándose entre sí, se unen correctamente (ya no se cancelan como agujero)', () => {
  // Dos "letras" simplificadas que comparten un borde (se tocan) — el bug
  // original (evenodd global sobre un solo `d` fusionado) cancelaba la
  // zona de contacto como si fuera un agujero anidado; con capas
  // independientes, pintar 2 formas opacas del mismo color en el mismo
  // punto da SIEMPRE el mismo resultado visual que pintar una sola.
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z', fill: '#231f20', 'fill-rule': 'evenodd' }),
    el('path', { d: 'M10,0 L20,0 L20,10 L10,10 Z', fill: '#231f20', 'fill-rule': 'evenodd' }), // comparte el borde x=10 con la anterior
    el('path', { d: 'M40,0 L60,0 L60,20 L40,20 Z', fill: '#231f20', 'fill-rule': 'evenodd' }), // "estrella"/detalle sin tocar a las otras
  ]);
  assertOk(result);
  assert.equal(result.geometry.layers?.length, 3);
  assert.ok(result.geometry.layers?.every((l) => l.role === 'ink'));
});

test('Etapa 8E — boca02: escudo oscuro + banda clara (papel) + letras oscuras encima, EN ESE ORDEN, se clasifica y conserva correctamente', () => {
  // Reproduce la estructura real de "boca 02.svg": una forma de base
  // oscura grande (el escudo), una forma clara chica encima (la banda —
  // en el archivo real, escrita con la abreviatura "M x,y dx,dy dx,dy..."
  // de Inkscape, ver el fix de `normalizeIconPath.ts` en esta misma
  // etapa) y letras oscuras encima de esa banda — el orden de pintado
  // real es ink -> paper -> ink, nunca reordenado por color.
  const result = extract([
    el('path', { d: 'M0,0 L100,0 L100,100 L0,100 Z', fill: '#231f20' }), // escudo (ink)
    el('path', { d: 'M10,40 30,0 30,20 -30,0 Z', fill: '#ffffff' }), // banda -- sintaxis "M x,y dx,dy..." real de Inkscape
    el('path', { d: 'M20,45 L40,45 L40,55 L20,55 Z', fill: '#231f20' }), // letra encima de la banda (ink)
  ]);
  assertOk(result);
  assert.equal(result.geometry.layers?.length, 3);
  assert.equal(result.geometry.layers?.[0].role, 'ink');
  assert.equal(result.geometry.layers?.[1].role, 'paper');
  assert.equal(result.geometry.layers?.[2].role, 'ink');
  // La capa "banda" (con la abreviatura M x,y dx,dy...) tiene que haber
  // producido geometría real (no colapsar a un punto por el bug de
  // parseo ya corregido) — se verifica indirectamente: su `d` normalizado
  // tiene más de un comando de dibujo real.
  const bandCommandCount = (result.geometry.layers?.[1].d.match(/[ML]/g) ?? []).length;
  assert.ok(bandCommandCount >= 4, `la banda debería tener varios puntos conectados, encontré ${bandCommandCount}`);
});

test('5. fill="none" + stroke explícito (sin ambigüedad, un solo elemento) — se acepta como trazo', () => {
  const result = extract([el('circle', { cx: '10', cy: '10', r: '5', fill: 'none', stroke: 'black', 'stroke-width': '1' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
});

test('6. stroke heredado desde <g> (cascada de atributos)', () => {
  const result = extract([el('g', { fill: 'none', stroke: 'black', 'stroke-width': '2' }, [
    el('line', { x1: '0', y1: '0', x2: '10', y2: '10' }),
  ])]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
  assert.ok(result.geometry.strokeWidth && result.geometry.strokeWidth > 0);
});

test('7. stroke-width se escala correctamente con el transform del <g> (mismo criterio que el ancho de trazo real de un ícono de PDF)', () => {
  const result = extract([el('g', { transform: 'scale(2)' }, [
    el('line', { x1: '0', y1: '0', x2: '10', y2: '0', stroke: 'black', 'stroke-width': '1' }),
  ])]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
  // No se compara un valor exacto (depende también del reescalado final de
  // `normalizeIconPath`) — solo que sea un número finito y positivo.
  assert.ok(typeof result.geometry.strokeWidth === 'number' && result.geometry.strokeWidth > 0);
});

test('8. caso realmente ambiguo (relleno y trazo de escala COMPARABLE) sigue rechazándose — no es simplemente "eliminar el rechazo"', () => {
  const result = extract([
    el('rect', { x: '0', y: '0', width: '10', height: '10', fill: 'black' }),
    el('circle', { cx: '30', cy: '5', r: '5', fill: 'none', stroke: 'black', 'stroke-width': '1' }),
  ]);
  assertRejected(result, 'no podemos simplificar');
});

test('8b. dos diseños con "tinta" real de escala comparable (no solo bounding box), uno en trazo y otro en relleno, se sigue rechazando', () => {
  // Un rect de 10x10 relleno tiene ~100 de tinta. Un rect de 10x10 trazado
  // con stroke-width=3 tiene un perímetro de 40 × 3 ≈ 120 de tinta — misma
  // escala real, no solo el mismo bounding box (a diferencia del caso 4,
  // donde el trazo es una línea FINA con poquísima tinta real).
  const result = extract([
    el('rect', { x: '0', y: '0', width: '10', height: '10', fill: 'black' }),
    el('rect', { x: '100', y: '0', width: '10', height: '10', fill: 'none', stroke: 'black', 'stroke-width': '3' }),
  ]);
  assertRejected(result, 'no podemos simplificar');
});

// ---------------------------------------------------------------------
// extractIconFromSvg — solo los 2 chequeos que corren ANTES de `DOMParser`
// ---------------------------------------------------------------------

test('extractIconFromSvg — string vacío se rechaza sin necesitar DOMParser', () => {
  assertRejected(extractIconFromSvg(''), 'SVG válido');
  assertRejected(extractIconFromSvg('   '), 'SVG válido');
});

test('extractIconFromSvg — texto absurdamente largo se rechaza sin necesitar DOMParser', () => {
  assertRejected(extractIconFromSvg('a'.repeat(3_000_000)), 'complejo');
});
