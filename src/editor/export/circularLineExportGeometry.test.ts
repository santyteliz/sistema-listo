/**
 * Tests de `circularLineExportGeometry.ts` — Etapa 10.
 * Correr: `npx tsx --test src/editor/export/circularLineExportGeometry.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path } from 'fabric';
import { extractCircularLineExportShape } from './circularLineExportGeometry.ts';

test('extractCircularLineExportShape: produce un d no vacío y el strokeWidth real', () => {
  const line = new Path('M 150 100 A 100 100 0 1 1 350 100', { fill: '', stroke: '#1a1a1a', strokeWidth: 2 });
  const shape = extractCircularLineExportShape(line);
  assert.ok(shape);
  assert.ok(shape.d.startsWith('M'));
  assert.equal(shape.strokeWidth, 2);
});

test('extractCircularLineExportShape: refleja la posición real (left/top) del Path, no coordenadas locales', () => {
  const a = new Path('M 0 0 L 10 10', { left: 0, top: 0, stroke: '#000', strokeWidth: 1 });
  const b = new Path('M 0 0 L 10 10', { left: 300, top: 300, stroke: '#000', strokeWidth: 1 });
  assert.notEqual(extractCircularLineExportShape(a)?.d, extractCircularLineExportShape(b)?.d);
});

test('extractCircularLineExportShape: null para un Path sin ningún comando (defensivo)', () => {
  const empty = new Path('', { stroke: '#000' });
  const shape = extractCircularLineExportShape(empty);
  assert.equal(shape, null);
});
