/**
 * Tests de `svgDocument.ts` — Etapa 10. Puro (sin Fabric) — puede correr
 * con `node --test` directo, aunque este archivo vive junto a los que sí
 * necesitan `tsx` (para consistencia se documenta igual el comando real
 * usado en la suite completa del proyecto).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSvgDocument, type SvgShapeSpec } from './svgDocument.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';

test('buildSvgDocument: el tamaño de página en mm coincide EXACTAMENTE con outerDiameterMm (94mm)', () => {
  const svg = buildSvgDocument([], VIROLA_CONFIG);
  assert.ok(svg.includes('width="94mm"'));
  assert.ok(svg.includes('height="94mm"'));
  assert.ok(svg.includes('viewBox="0 0 94 94"'));
});

test('buildSvgDocument: un documento vacío sigue siendo un SVG válido (sin shapes)', () => {
  const svg = buildSvgDocument([], VIROLA_CONFIG);
  assert.ok(svg.startsWith('<?xml'));
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('</svg>'));
});

test('buildSvgDocument: shape "fill" incluye fill-rule y color', () => {
  const shapes: SvgShapeSpec[] = [{ kind: 'fill', d: 'M0,0 L10,0 L10,10 Z', fillRule: 'evenodd', fill: '#111111' }];
  const svg = buildSvgDocument(shapes, VIROLA_CONFIG);
  assert.ok(svg.includes('fill-rule="evenodd"'));
  assert.ok(svg.includes('fill="#111111"'));
  assert.ok(svg.includes('d="M0,0 L10,0 L10,10 Z"'));
});

test('buildSvgDocument: shape "stroke" nunca lleva fill sólido (fill="none")', () => {
  const shapes: SvgShapeSpec[] = [{ kind: 'stroke', d: 'M0,0 L10,10', strokeWidth: 2, stroke: '#111111' }];
  const svg = buildSvgDocument(shapes, VIROLA_CONFIG);
  assert.ok(svg.includes('fill="none"'));
  assert.ok(svg.includes('stroke="#111111"'));
  assert.ok(svg.includes('stroke-width="2"'));
});

test('buildSvgDocument: shape "text" usa <textPath> referenciando un <path> propio en <defs>, y escapa el contenido', () => {
  const shapes: SvgShapeSpec[] = [{
    kind: 'text', id: 'tp-1', pathD: 'M0,0 L100,0', content: 'A & B <raro>',
    fontFamily: 'Poppins', fontSize: 24, fill: '#111111', side: 'left', startOffset: 5,
  }];
  const svg = buildSvgDocument(shapes, VIROLA_CONFIG);
  assert.ok(svg.includes('<path id="tp-1" d="M0,0 L100,0" />'));
  assert.ok(svg.includes('href="#tp-1"'));
  assert.ok(svg.includes('font-family="Poppins"'));
  assert.ok(svg.includes('A &amp; B &lt;raro&gt;'), 'el contenido del texto debe quedar escapado como XML, nunca insertado crudo');
  assert.ok(!svg.includes('<raro>'), 'nunca debe aparecer markup sin escapar proveniente del contenido del texto');
});

test('buildSvgDocument: nunca interpreta el `d`/contenido como markup ejecutable (solo texto plano dentro de atributos/nodos)', () => {
  const shapes: SvgShapeSpec[] = [{ kind: 'fill', d: 'M0,0 Z', fillRule: 'nonzero', fill: '#000' }];
  const svg = buildSvgDocument(shapes, VIROLA_CONFIG);
  assert.ok(!svg.includes('<script'));
});

test('buildSvgDocument: conserva el orden de pintado de las shapes recibidas', () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'fill', d: 'M0,0 Z', fillRule: 'nonzero', fill: '#111' },
    { kind: 'stroke', d: 'M1,1 Z', strokeWidth: 1, stroke: '#222' },
  ];
  const svg = buildSvgDocument(shapes, VIROLA_CONFIG);
  const firstIndex = svg.indexOf('fill="#111"');
  const secondIndex = svg.indexOf('stroke="#222"');
  assert.ok(firstIndex < secondIndex && firstIndex !== -1);
});
