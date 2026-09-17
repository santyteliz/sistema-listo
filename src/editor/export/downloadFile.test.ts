/**
 * Tests de `buildExportFileName` — Etapa 10. `downloadTextFile` en sí
 * necesita `document`/`Blob`/`URL` reales del navegador — se verifica a
 * mano en Chrome (ver el informe de esta etapa), no acá.
 *
 * Correr: `node --test src/editor/export/downloadFile.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportFileName } from './downloadFile.ts';

test('buildExportFileName: formato mateshop-diseno-AAAA-MM-DD.ext', () => {
  const name = buildExportFileName('svg', new Date(2026, 8, 15)); // mes 0-indexado: 8 = septiembre
  assert.equal(name, 'mateshop-diseno-2026-09-15.svg');
});

test('buildExportFileName: rellena con cero mes/día de un solo dígito', () => {
  const name = buildExportFileName('svg', new Date(2026, 0, 5)); // 5 de enero
  assert.equal(name, 'mateshop-diseno-2026-01-05.svg');
});

test('buildExportFileName: respeta la extensión pedida', () => {
  assert.ok(buildExportFileName('pdf', new Date(2026, 8, 15)).endsWith('.pdf'));
});
