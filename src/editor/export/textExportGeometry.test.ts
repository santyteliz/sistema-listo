/**
 * Tests de `textExportGeometry.ts` — Etapa 10. Solo la parte PURA (lectura
 * de propiedades + transformación de la geometría del arco guía) — NUNCA
 * llama `.toSVG()`/`calcTextWidth()` (lo único de `IText` que necesita un
 * contexto 2D real, ver el comentario grande del módulo).
 *
 * Correr: `npx tsx --test src/editor/export/textExportGeometry.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IText, Path } from 'fabric';
import { extractTextExportInfo } from './textExportGeometry.ts';

function makeCurvedText(overrides: Partial<{ left: number; top: number; pathSide: 'left' | 'right'; pathStartOffset: number }> = {}) {
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  return new IText('HOLA MUNDO', {
    left: overrides.left ?? 200,
    top: overrides.top ?? 200,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Poppins',
    fill: '#1a1a1a',
    fontSize: 24,
    path: arcPath,
    pathAlign: 'center',
    pathSide: overrides.pathSide ?? 'left',
    pathStartOffset: overrides.pathStartOffset ?? 0,
  });
}

test('extractTextExportInfo: expone contenido/tipografía/tamaño/color tal cual', () => {
  const text = makeCurvedText();
  const info = extractTextExportInfo(text);
  assert.equal(info.content, 'HOLA MUNDO');
  assert.equal(info.fontFamily, 'Poppins');
  assert.equal(info.fontSize, 24);
  assert.equal(info.fill, '#1a1a1a');
});

test('extractTextExportInfo: pathD no está vacío y describe un arco (contiene comandos M y C — Fabric convierte A a C al parsear)', () => {
  const text = makeCurvedText();
  const info = extractTextExportInfo(text);
  assert.ok(info.pathD.startsWith('M'));
  assert.ok(info.pathD.includes('C'));
});

test('extractTextExportInfo: pathD refleja la posición real del texto (left/top), no coordenadas locales del arco', () => {
  const centered = extractTextExportInfo(makeCurvedText({ left: 200, top: 200 }));
  const moved = extractTextExportInfo(makeCurvedText({ left: 500, top: 500 }));
  assert.notEqual(centered.pathD, moved.pathD, 'mover el texto debe cambiar la geometría absoluta exportada del arco');
});

test('extractTextExportInfo: side refleja pathSide ("invertir texto")', () => {
  assert.equal(extractTextExportInfo(makeCurvedText({ pathSide: 'left' })).side, 'left');
  assert.equal(extractTextExportInfo(makeCurvedText({ pathSide: 'right' })).side, 'right');
});

test('extractTextExportInfo: startOffset refleja pathStartOffset', () => {
  const info = extractTextExportInfo(makeCurvedText({ pathStartOffset: 42 }));
  assert.equal(info.startOffset, 42);
});
