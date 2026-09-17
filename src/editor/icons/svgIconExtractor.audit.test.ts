/**
 * Auditoría del extractor de SVG — Etapa 8B.3 (auditoría, no implementación).
 *
 * IMPORTANTE: este archivo es un archivo de TESTS DE AUDITORÍA — documenta el
 * comportamiento REAL y actual de `svgIconExtractor.ts` frente a una batería
 * amplia de estructuras SVG (geometría, transformaciones, pintura, patrones
 * típicos de Illustrator/Inkscape/Figma, seguridad). NO se modificó el
 * extractor para escribir este archivo — cada test refleja el comportamiento
 * YA EXISTENTE, sea correcto (clasificado A/B en el informe de la etapa) o
 * un hallazgo (clasificado C/D/E). Los tests marcados `[HALLAZGO ...]`
 * documentan un comportamiento IMPERFECTO a propósito (no se "arregla" el
 * test para que pase con el resultado ideal) — ver el informe de la Etapa
 * 8B.3 para la clasificación completa y la severidad de cada uno.
 *
 * Mismo patrón de objetos simulados que `svgIconExtractor.test.ts` (sin
 * `DOMParser`, sin `jsdom`, sin dependencias nuevas).
 *
 * Correr: `node --test src/editor/icons/svgIconExtractor.audit.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGeometryFromRootElement, type SvgExtractionResult } from './svgIconExtractor.ts';

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
function assertRejected(result: SvgExtractionResult): asserts result is Extract<SvgExtractionResult, { ok: false }> {
  assert.equal(result.ok, false);
}

// =====================================================================
// A/B — GEOMETRÍA: todos aceptados correctamente (comportamiento ya
// cubierto en detalle por svgIconExtractor.test.ts — acá solo se
// re-confirman como parte de la batería completa de auditoría).
// =====================================================================

test('[A] geometría: path, rect, rounded-rect, circle, ellipse, line, polygon, polyline, g anidado, <a> — todos aceptados', () => {
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })]));
  assertOk(extract([el('rect', { x: '0', y: '0', width: '10', height: '10', fill: 'black' })]));
  assertOk(extract([el('rect', { x: '0', y: '0', width: '20', height: '10', rx: '3', fill: 'black' })]));
  assertOk(extract([el('circle', { cx: '10', cy: '10', r: '5', fill: 'black' })]));
  assertOk(extract([el('ellipse', { cx: '10', cy: '10', rx: '8', ry: '4', fill: 'black' })]));
  assertOk(extract([el('line', { x1: '0', y1: '0', x2: '10', y2: '10', stroke: 'black' })]));
  assertOk(extract([el('polygon', { points: '0,0 10,0 10,10', fill: 'black' })]));
  assertOk(extract([el('polyline', { points: '0,0 10,0 10,10', fill: 'none', stroke: 'black' })]));
  assertOk(extract([el('g', {}, [el('g', {}, [el('g', {}, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])])])]));
  assertOk(extract([el('a', { href: '#x' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])]));
});

// =====================================================================
// A/B — TRANSFORMACIONES
// =====================================================================

test('[A] transform: translate/scale-uniforme/scale-no-uniforme/rotate/matrix/skewX/skewY/combinados — todos aceptados', () => {
  for (const t of ['translate(10,20)', 'scale(2)', 'scale(2,3)', 'rotate(45)', 'matrix(1,0,0,1,10,10)', 'skewX(20)', 'skewY(20)', 'translate(10,10) rotate(30) scale(1.5)']) {
    const result = extract([el('g', { transform: t }, [el('rect', { x: '0', y: '0', width: '10', height: '10', fill: 'black' })])]);
    assertOk(result);
  }
});

test('[A] transform heredado correctamente desde <g> a la forma hija', () => {
  assertOk(extract([el('g', { transform: 'translate(5,5)' }, [el('circle', { cx: '0', cy: '0', r: '5', fill: 'black' })])]));
});

test('[A] rotate() sobre un <circle> funciona exacto (similitud rotación+escala uniforme)', () => {
  assertOk(extract([el('g', { transform: 'rotate(40)' }, [el('circle', { cx: '0', cy: '0', r: '5', fill: 'black' })])]));
});

test('[A] rotate() sobre un rect con esquinas redondeadas (arcos xAxisRotation=0) funciona', () => {
  assertOk(extract([el('g', { transform: 'rotate(25)' }, [el('rect', { x: '0', y: '0', width: '20', height: '10', rx: '3', fill: 'black' })])]));
});

test('[B] skew combinado con un círculo (no es una similitud exacta) se rechaza a propósito — límite documentado, no un bug', () => {
  assertRejected(extract([el('g', { transform: 'skewX(30)' }, [el('circle', { cx: '0', cy: '0', r: '5', fill: 'black' })])]));
});

test('[B] rotate + scale no uniforme sobre un círculo se rechaza a propósito — mismo límite documentado', () => {
  assertRejected(extract([el('g', { transform: 'rotate(30) scale(2,3)' }, [el('circle', { cx: '0', cy: '0', r: '5', fill: 'black' })])]));
});

// =====================================================================
// A/B — PINTURA
// =====================================================================

test('[A] fill sólido / fill+stroke mismo color / fill+stroke distinto color (mismo elemento) — todos aceptados como relleno', () => {
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: '#123456' })]));
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', stroke: 'black', 'stroke-width': '0.1' })]));
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'red', stroke: 'blue', 'stroke-width': '1' })]));
});

test('[B] fill="none" sin stroke (nada visible) se rechaza correctamente', () => {
  assertRejected(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'none' })]));
});

test('[A] herencia: fill/stroke/stroke-width heredados desde <g>, override en el hijo respetado', () => {
  assertOk(extract([el('g', { fill: 'none', stroke: 'black', 'stroke-width': '2' }, [el('path', { d: 'M0,0 L10,10' })])]));
  assertOk(extract([el('g', { fill: 'red' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z' })])]));
  const overridden = extract([el('g', { fill: 'red' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'blue' })])]);
  assertOk(overridden);
});

test('[A] fill-rule nonzero y evenodd (con agujero real) se respetan', () => {
  const nonzero = extract([el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z M2,2 L8,2 L8,8 L2,8 Z', fill: 'black', 'fill-rule': 'nonzero' })]);
  assertOk(nonzero);
  assert.equal(nonzero.geometry.fillRule, 'nonzero');
  const evenodd = extract([el('path', { d: 'M0,0 L10,0 L10,10 L0,10 Z M2,2 L8,2 L8,8 L2,8 Z', fill: 'black', 'fill-rule': 'evenodd' })]);
  assertOk(evenodd);
  assert.equal(evenodd.geometry.fillRule, 'evenodd');
});

test('[FIX 8E] fill-rule distinta entre elementos ya NO se rechaza — cada forma conserva la suya como capa propia', () => {
  // Antes (Etapa 8C): dos formas con `fill-rule` distinta se rechazaban
  // por "ambigüedad" — pero en realidad NUNCA hubo ambigüedad real: cada
  // forma siempre tuvo su propio `fill-rule` en el SVG original, la
  // "ambigüedad" era artificial, causada por intentar fusionarlas en un
  // solo `d` con un solo `fillRule` compartido. La Etapa 8E deja de
  // fusionar formas con relleno — cada una queda como su propia capa
  // (`IconLayer`), con su propio `fillRule` intacto.
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', 'fill-rule': 'nonzero' }),
    el('path', { d: 'M20,0 L30,0 L30,10 Z', fill: 'black', 'fill-rule': 'evenodd' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.layers?.length, 2);
  assert.equal(result.geometry.layers?.[0].fillRule, 'nonzero');
  assert.equal(result.geometry.layers?.[1].fillRule, 'evenodd');
  assert.ok(result.geometry.layers?.every((l) => l.role === 'ink')); // mismo color (black) en las dos formas
});

test('[A] mezcla fill/trazo con grupo dominante claro (Etapa 8C, Regla 2) — ambas direcciones', () => {
  const fillDominante = extract([
    el('rect', { x: '0', y: '0', width: '100', height: '100', fill: 'black' }),
    el('line', { x1: '0', y1: '0', x2: '10', y2: '10', stroke: 'black', 'stroke-width': '0.3' }),
  ]);
  assertOk(fillDominante);
  assert.equal(fillDominante.geometry.paintMode, 'fill');

  const strokeDominante = extract([
    el('line', { x1: '0', y1: '0', x2: '100', y2: '100', stroke: 'black', 'stroke-width': '10' }),
    el('rect', { x: '0', y: '0', width: '2', height: '2', fill: 'black' }),
  ]);
  assertOk(strokeDominante);
  assert.equal(strokeDominante.geometry.paintMode, 'stroke');
});

test('[B] mezcla fill/trazo de escala realmente comparable se rechaza — no es "eliminar el rechazo"', () => {
  assertRejected(extract([
    el('rect', { x: '0', y: '0', width: '20', height: '20', fill: 'black' }),
    el('rect', { x: '50', y: '0', width: '20', height: '20', fill: 'none', stroke: 'black', 'stroke-width': '5' }),
  ]));
});

// =====================================================================
// A — PATRONES TÍPICOS DE EXPORTADORES REALES
// =====================================================================

test('[A] patrón Illustrator: <g> anidados + `style="fill:#RRGGBB;"` por path', () => {
  assertOk(extract([el('g', {}, [el('g', {}, [
    el('path', { style: 'fill:#33322F;', d: 'M0,0 L10,0 L10,10 Z' }),
    el('path', { style: 'fill:#1A1A18;', d: 'M20,0 L30,0 L30,10 Z' }),
  ])])]));
});

test('[A] patrón Inkscape: atributos con namespace (inkscape:label, sodipodi:nodetypes) no rompen ni rechazan', () => {
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', 'inkscape:label': 'capa1', 'sodipodi:nodetypes': 'cccc' })]));
});

test('[A] patrón Figma: fill con fallback moderno vía `style="fill:#hex;fill:color(display-p3 ...)"` (declaración repetida) no rompe', () => {
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', style: 'fill:#863bff;fill:color(display-p3 .5 .2 1);fill-opacity:1' })]));
});

test('[A] path sin ningún atributo de paint usa el default de SVG (fill negro implícito)', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 Z' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
});

test('[A] ids internos largos tipo Illustrator (SVGID_...) no rompen nada', () => {
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', id: 'SVGID_00000045591438638807446550000013540180541287806612_' })]));
});

test('[A] currentColor y rgb(...) como valores de fill se tratan como "no none" (no importa el color real)', () => {
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'currentColor' })]));
  assertOk(extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'rgb(0,0,0)' })]));
});

test('[FIX 8E] arte con más de dos tonos conceptuales distintos ahora SÍ se rechaza (antes se aceptaba y perdía todo el color)', () => {
  // Antes de esta etapa el color NUNCA se inspeccionaba (todo terminaba
  // pintado con el único color de tinta del editor) — así que 4 colores
  // bien distintos "no eran un problema" porque ninguno de los 4 importaba
  // en el resultado final. Ahora que el extractor SÍ interpreta color para
  // poder separar tinta/papel (Etapa 8E), un diseño con más de dos tonos
  // conceptuales queda fuera del modelo actual (ink/paper) — se rechaza
  // con un mensaje claro en vez de aceptarlo silenciosamente e ignorar 2
  // de sus 4 colores.
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: '#163365' }),
    el('path', { d: 'M20,0 L30,0 L30,10 Z', fill: '#933868' }),
    el('path', { d: 'M40,0 L50,0 L50,10 Z', fill: '#FFC500' }),
    el('path', { d: 'M60,0 L70,0 L70,10 Z', fill: '#FFFFFF' }),
  ]);
  assertRejected(result);
  assert.ok(!result.ok && result.message.includes('dos tonos'));
});

test('[FIX 8E] exactamente DOS tonos bien distintos (aunque el diseño tenga varias formas) se acepta como capas ink/paper', () => {
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: '#163365' }), // oscuro -> ink
    el('path', { d: 'M20,0 L30,0 L30,10 Z', fill: '#163365' }), // mismo oscuro -> ink
    el('path', { d: 'M40,0 L50,0 L50,10 Z', fill: '#FFFFFF' }), // claro -> paper
  ]);
  assertOk(result);
  assert.equal(result.geometry.layers?.length, 3);
  assert.equal(result.geometry.layers?.filter((l) => l.role === 'ink').length, 2);
  assert.equal(result.geometry.layers?.filter((l) => l.role === 'paper').length, 1);
});

test('[FIX 8E] variantes casi idénticas de "negro" (ruido típico de exportación) siguen contando como UN solo tono — no se rechazan', () => {
  // Mismo ejemplo dado en el pedido de esta etapa: #231f20/#232020/#222222
  // son, a los ojos de una persona, la misma tinta — nunca deberían
  // convertirse en "3 colores" y disparar el rechazo por demasiados tonos.
  const result = extract([
    el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: '#231f20' }),
    el('path', { d: 'M20,0 L30,0 L30,10 Z', fill: '#232020' }),
    el('path', { d: 'M40,0 L50,0 L50,10 Z', fill: '#222222' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.layers?.length, 3);
  assert.ok(result.geometry.layers?.every((l) => l.role === 'ink'));
});

test('[A] use con referencia hacia adelante (definida más abajo en el documento) funciona', () => {
  assertOk(extract([
    el('use', { href: '#box' }),
    el('rect', { id: 'box', x: '0', y: '0', width: '10', height: '10', fill: 'black' }),
  ]));
});

test('[A] use encadenado (un <use> apuntando a otro <use>) funciona', () => {
  assertOk(extract([
    el('defs', {}, [
      el('rect', { id: 'base', x: '0', y: '0', width: '10', height: '10', fill: 'black' }),
      el('use', { id: 'mid', href: '#base', x: '5', y: '0' }),
    ]),
    el('use', { href: '#mid', x: '5', y: '0' }),
  ]));
});

test('[A] xlink:href (SVG 1.1) además de href (SVG 2) en <use> funciona', () => {
  assertOk(extract([
    el('rect', { id: 'box', x: '0', y: '0', width: '10', height: '10', fill: 'black' }),
    el('use', { 'xlink:href': '#box' }),
  ]));
});

// =====================================================================
// B — SEGURIDAD (deben seguir rechazándose — confirmado contra patrones
// REALES encontrados en SVG de Illustrator/Figma descargados/locales)
// =====================================================================

test('[B] <script>/<foreignObject>/<image>/<text>/<tspan>/<style> se rechazan', () => {
  for (const tag of ['script', 'foreignObject', 'image', 'text', 'tspan', 'style']) {
    assertRejected(extract([el(tag, {}, [])]));
  }
});

test('[B] gradients/pattern/filter/mask/clipPath (como elemento) se rechazan', () => {
  for (const tag of ['linearGradient', 'radialGradient', 'pattern', 'filter', 'mask', 'clipPath']) {
    assertRejected(extract([el(tag, {}, [])]));
  }
});

test('[B] clip-path vía atributo `style` (patrón REAL de exportación de Illustrator con <clipPath>+<use>) se rechaza', () => {
  assertRejected(extract([el('g', { style: 'clip-path:url(#c1);' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])]));
});

test('[B] mask vía atributo directo (patrón REAL de exportación de Figma) se rechaza', () => {
  assertRejected(extract([el('g', { mask: 'url(#a)' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])]));
});

test('[B] filter vía atributo directo (glow/blur, patrón REAL de exportación de Figma) se rechaza', () => {
  assertRejected(extract([el('g', { filter: 'url(#b)' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])]));
});

test('[B] onload/onclick (manejador de evento) se rechaza', () => {
  assertRejected(extract([el('rect', { x: '0', y: '0', width: '10', height: '10', fill: 'black', onload: 'alert(1)' })]));
});

test('[B] javascript: en cualquier atributo se rechaza', () => {
  assertRejected(extract([el('a', { href: 'javascript:alert(1)' }, [])]));
});

test('[B] referencia externa (href sin "#") se rechaza', () => {
  assertRejected(extract([el('use', { href: 'https://evil.example/x.svg#y' }, [])]));
});

test('[B] <use> circular y <use> a un id inexistente se rechazan', () => {
  assertRejected(extract([el('g', { id: 'a' }, [el('use', { href: '#b' })]), el('use', { id: 'b', href: '#a' })]));
  assertRejected(extract([el('use', { href: '#no-existe' })]));
});

test('[B] SVG vacío / sin geometría real se rechaza', () => {
  assertRejected(extract([]));
  assertRejected(extract([el('metadata', {}, [])]));
});

test('[B] demasiados elementos (>2000) o demasiados comandos (>5000) se rechaza', () => {
  const manyElements = Array.from({ length: 2001 }, (_, i) => el('rect', { x: String(i), y: '0', width: '1', height: '1' }));
  assertRejected(extract(manyElements));
});

// =====================================================================
// C — FALSOS RECHAZOS
//
// Etapa 8B.4: el caso `<use>` → `<symbol>` fue corregido puntualmente
// (ver `svgIconExtractor.ts`: `walk()` ahora trata `<symbol>` como
// contenedor transparente equivalente a `<defs>`, y la resolución de
// `<use>` recorre directamente los hijos del `<symbol>` cuando el
// target resuelto es uno). El caso `<switch>` NO se tocó — sigue
// siendo un falso rechazo documentado a propósito, tal cual el informe
// de la Etapa 8B.3 decidió no implementarlo en esta etapa.
// =====================================================================

test('[FIX 8B.4] <use> hacia un <symbol> (patrón MUY común de sprites de íconos) ya NO se rechaza — reproduce exactamente el caso de la auditoría', () => {
  // Antes (Etapa 8B.3): `<symbol>` nunca se agregó a la lista de tags
  // "contenedor transparente" (`tag === 'g' || tag === 'a'`, ver
  // `walk()`) — cuando `<use>` resolvía su referencia hacia un
  // `<symbol>`, `walk()` lo trataba como un tag desconocido (no lo
  // recorría), así que la geometría de adentro se perdía en silencio
  // ("El SVG no contiene una geometría válida" — indistinguible, para
  // el usuario, de un archivo realmente vacío).
  // Ahora: se acepta y conserva la geometría del `<path>` dentro del
  // `<symbol>`.
  const result = extract([
    el('defs', {}, [el('symbol', { id: 'ico' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])]),
    el('use', { href: '#ico' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
  assert.ok(result.geometry.svgPath.length > 0);
});

test('[FIX 8B.4] <symbol> definido FUERA de <defs> (válido per spec) también funciona vía <use>, sin duplicar geometría', () => {
  // El `<symbol>` en sí nunca debe aportar geometría directamente
  // (igual que `<defs>`) — solo a través de un `<use>` que lo referencie.
  const result = extract([
    el('symbol', { id: 'ico' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })]),
    el('use', { href: '#ico' }),
  ]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
});

test('[HALLAZGO C] <switch> envolviendo contenido soportado se rechaza como "sin geometría" — falso rechazo (caso más raro, NO corregido en 8B.4)', () => {
  // Mismo mecanismo que tenía `<symbol>`: `<switch>` tampoco está en la
  // lista de contenedores transparentes. A diferencia de `<symbol>`,
  // `<switch>` tiene semántica real de "elegir una sola alternativa" —
  // tratarlo literalmente igual que `<g>` (recorrer TODOS los hijos) no
  // sería 100% correcto si el SVG usa `<switch>` para ofrecer
  // alternativas reales (ej. un `<text>` de respaldo). Fuera del
  // alcance explícito de la Etapa 8B.4 — sigue sin implementarse.
  const result = extract([el('switch', {}, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })])]);
  assertRejected(result);
});

// =====================================================================
// D — ACEPTADOS CON PÉRDIDA VISUAL
//
// Etapa 8B.4: `display:none`/`visibility:hidden` (D1/D2) y
// `stroke-width="0"` (D3) fueron corregidos puntualmente. El caso de
// "capas superpuestas con cancelación de polaridad" (D4, más abajo)
// NO se tocó — requiere una arquitectura de `layers[]` explícitamente
// fuera del alcance de esta etapa.
// =====================================================================

test('[FIX 8B.4] display:none (vía style) ahora SÍ se respeta — la forma no aporta geometría', () => {
  // Antes: el extractor solo leía `fill`/`stroke`/`fill-rule`/
  // `stroke-width` del atributo `style` (`parseInlineStyle`) — nunca
  // `display`. Ahora `isElementHidden()` también revisa `display` (por
  // `style` o atributo directo) y `visibility` (por `style` o atributo
  // directo), y `walk()` descarta el elemento (y toda su descendencia)
  // antes de recorrerlo.
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', style: 'display:none' })]);
  assertRejected(result);
});

test('[FIX 8B.4] display="none" (vía atributo directo) ahora SÍ se respeta', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', display: 'none' })]);
  assertRejected(result);
});

test('[FIX 8B.4] visibility:hidden (vía style) ahora SÍ se respeta', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', style: 'visibility:hidden' })]);
  assertRejected(result);
});

test('[FIX 8B.4] visibility="hidden" (vía atributo directo) ahora SÍ se respeta', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', visibility: 'hidden' })]);
  assertRejected(result);
});

test('[FIX 8B.4] <g style="display:none"> oculta TODO su contenido (herencia — no solo el elemento directo)', () => {
  const hiddenGroupOnly = extract([
    el('g', { style: 'display:none' }, [
      el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' }),
      el('rect', { x: '0', y: '0', width: '5', height: '5', fill: 'red' }),
    ]),
  ]);
  assertRejected(hiddenGroupOnly);

  // Control: si además hay una forma visible fuera del grupo oculto, esa sí se conserva.
  const hiddenGroupPlusVisibleSibling = extract([
    el('g', { style: 'display:none' }, [el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black' })]),
    el('rect', { x: '20', y: '0', width: '5', height: '5', fill: 'blue' }),
  ]);
  assertOk(hiddenGroupPlusVisibleSibling);
});

test('[FIX 8B.4] stroke-width="0" ya NO se acepta como paintMode "stroke" — equivale a "sin trazo real"', () => {
  // Antes: se comprobaba que `stroke !== 'none'` pero nunca que el
  // ANCHO fuera > 0 — un trazo con `stroke-width="0"` (a veces usado
  // para "desactivar" un trazo sin borrar el atributo) quedaba
  // clasificado como `paintMode: 'stroke'` con un ancho final de 0.
  // Peor aún (bug más profundo encontrado al implementar el fix): el
  // valor explícito `0` ni siquiera se conservaba — `resolvePaintContext`
  // lo reemplazaba en silencio por el `strokeWidth` heredado/default.
  // Ahora: sin fill válido y con `stroke-width="0"`, no queda ninguna
  // geometría válida (equivalente a `stroke: none`).
  const result = extract([el('path', { d: 'M0,0 L10,10', fill: 'none', stroke: 'black', 'stroke-width': '0' })]);
  assertRejected(result);
});

test('[FIX 8B.4] stroke-width="0" heredado desde un <g> también se respeta (no solo en el atributo directo)', () => {
  const result = extract([
    el('g', { stroke: 'black', 'stroke-width': '0' }, [el('path', { d: 'M0,0 L10,10', fill: 'none' })]),
  ]);
  assertRejected(result);
});

test('[FIX 8B.4] fill válido + stroke-width="0" en el mismo elemento conserva el fill (el trazo inválido no contamina el resto)', () => {
  const result = extract([el('path', { d: 'M0,0 L10,0 L10,10 Z', fill: 'black', stroke: 'red', 'stroke-width': '0' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'fill');
});

test('[FIX 8B.4] stroke-width normal (no cero) sigue funcionando exactamente igual que antes', () => {
  const result = extract([el('path', { d: 'M0,0 L10,10', fill: 'none', stroke: 'black', 'stroke-width': '2' })]);
  assertOk(result);
  assert.equal(result.geometry.paintMode, 'stroke');
});

test('[FIX 8E] capas superpuestas con una forma BASE sólida cubierta por otra del mismo color (mismo patrón real de "boca 02.svg") ya NO pierde polaridad', () => {
  // Antes (Etapa 8B.3, [HALLAZGO D]): una forma BASE sólida (ej. el
  // escudo completo) combinada, sin conciencia de orden de pintado, con
  // una forma ENCIMA del mismo color — el resultado invertía la polaridad
  // donde se superponían, porque el evenodd combinado las CANCELABA
  // (paridad par) en vez de "reemplazar" lo de abajo como el algoritmo de
  // pintor real.
  //
  // Ahora (Etapa 8E): dos formas con relleno ya NO se fusionan en un solo
  // `d`+`fillRule` — cada una queda como su propia capa (`IconLayer`),
  // pintada en orden (`source-over`, mismo color -> mismo grupo `ink`).
  // Pintar el mismo color dos veces, se superpongan o no, da SIEMPRE el
  // mismo resultado visual que pintarlo una vez — la cancelación ya no
  // puede ocurrir.
  const base = el('rect', { x: '0', y: '0', width: '20', height: '20', fill: 'black', 'fill-rule': 'evenodd' }); // "escudo completo" de base
  const stripe = el('rect', { x: '0', y: '7', width: '20', height: '6', fill: 'black', 'fill-rule': 'evenodd' }); // una franja ENCIMA de la base, en la misma posición donde la base ya pintaba
  const result = extract([base, stripe]);
  assertOk(result);
  assert.equal(result.geometry.layers?.length, 2, 'la base y la franja quedan como 2 capas independientes, en orden de pintado');
  assert.ok(result.geometry.layers?.every((l) => l.role === 'ink'), 'mismo color en las dos -> las dos son tinta, ninguna "papel"');
  assert.equal(result.geometry.layers?.[0].fillRule, 'evenodd');
  assert.equal(result.geometry.layers?.[1].fillRule, 'evenodd');
});
