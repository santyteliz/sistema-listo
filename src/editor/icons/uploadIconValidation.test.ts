/**
 * Tests de `uploadIconValidation.ts` — Etapa 8B. `File`/`Blob` son
 * globales estándar disponibles nativamente en esta versión de Node (sin
 * necesitar ningún shim de navegador) — a diferencia de `DOMParser`, ver
 * `svgIconExtractor.test.ts`.
 *
 * Correr: `node --test src/editor/icons/uploadIconValidation.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUploadedIconFile, MAX_SVG_FILE_SIZE_BYTES } from './uploadIconValidation.ts';

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type });
}

test('acepta un .svg con MIME correcto', () => {
  const result = validateUploadedIconFile(makeFile('icono.svg', '<svg></svg>', 'image/svg+xml'));
  assert.equal(result.ok, true);
});

test('acepta un .svg con MIME vacío (común en Windows sin asociación de tipo)', () => {
  const result = validateUploadedIconFile(makeFile('icono.svg', '<svg></svg>', ''));
  assert.equal(result.ok, true);
});

test('acepta un .svg con MIME inconsistente pero extensión correcta (prioriza la extensión, el contenido decide después)', () => {
  const result = validateUploadedIconFile(makeFile('icono.svg', '<svg></svg>', 'application/octet-stream'));
  assert.equal(result.ok, true);
});

test('rechaza un archivo sin extensión .svg ni MIME plausible', () => {
  const result = validateUploadedIconFile(makeFile('foto.png', 'no importa', 'image/png'));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes('SVG'));
});

test('rechaza un archivo vacío', () => {
  const result = validateUploadedIconFile(makeFile('icono.svg', '', 'image/svg+xml'));
  assert.equal(result.ok, false);
});

test('rechaza un archivo más grande que el máximo permitido', () => {
  const bigContent = 'a'.repeat(MAX_SVG_FILE_SIZE_BYTES + 1);
  const result = validateUploadedIconFile(makeFile('icono.svg', bigContent, 'image/svg+xml'));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes('grande'));
});

test('acepta un archivo justo en el límite de tamaño', () => {
  const content = 'a'.repeat(MAX_SVG_FILE_SIZE_BYTES);
  const result = validateUploadedIconFile(makeFile('icono.svg', content, 'image/svg+xml'));
  assert.equal(result.ok, true);
});
