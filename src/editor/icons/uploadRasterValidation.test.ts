/**
 * Tests de `uploadRasterValidation.ts` — Etapa 9E. Mismo criterio que
 * `uploadIconValidation.test.ts`: `File` es un global estándar disponible
 * nativamente en esta versión de Node.
 *
 * Correr: `node --test src/editor/icons/uploadRasterValidation.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUploadedRasterFile, MAX_RASTER_UPLOAD_FILE_SIZE_BYTES } from './uploadRasterValidation.ts';

function makeFile(name: string, byteLength: number, type: string): File {
  return new File([new Uint8Array(byteLength)], name, { type });
}

test('acepta un .png con MIME correcto', () => {
  const result = validateUploadedRasterFile(makeFile('logo.png', 100, 'image/png'));
  assert.equal(result.ok, true);
});

test('acepta un .webp con MIME correcto', () => {
  const result = validateUploadedRasterFile(makeFile('logo.webp', 100, 'image/webp'));
  assert.equal(result.ok, true);
});

test('acepta un .png con MIME vacío (común en Windows sin asociación de tipo)', () => {
  const result = validateUploadedRasterFile(makeFile('logo.png', 100, ''));
  assert.equal(result.ok, true);
});

test('rechaza un .png con MIME claramente inconsistente (ej. image/jpeg)', () => {
  const result = validateUploadedRasterFile(makeFile('logo.png', 100, 'image/jpeg'));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes('PNG'));
});

test('rechaza .svg — el cargador público de esta etapa ya no acepta SVG', () => {
  const result = validateUploadedRasterFile(makeFile('icono.svg', 100, 'image/svg+xml'));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes('PNG'));
});

test('rechaza .jpg', () => {
  const result = validateUploadedRasterFile(makeFile('foto.jpg', 100, 'image/jpeg'));
  assert.equal(result.ok, false);
});

test('rechaza .jpeg', () => {
  const result = validateUploadedRasterFile(makeFile('foto.jpeg', 100, 'image/jpeg'));
  assert.equal(result.ok, false);
});

test('rechaza .gif', () => {
  const result = validateUploadedRasterFile(makeFile('animacion.gif', 100, 'image/gif'));
  assert.equal(result.ok, false);
});

test('rechaza un archivo vacío', () => {
  const result = validateUploadedRasterFile(makeFile('logo.png', 0, 'image/png'));
  assert.equal(result.ok, false);
});

test('rechaza un archivo más grande que el máximo permitido (10 MB), con el número concreto en el mensaje', () => {
  const result = validateUploadedRasterFile(makeFile('logo.png', MAX_RASTER_UPLOAD_FILE_SIZE_BYTES + 1, 'image/png'));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes('10 MB'), 'el mensaje debe ser autocontenido, sin depender del hint estático de la UI (Etapa 9G)');
});

test('acepta un archivo justo en el límite de tamaño', () => {
  const result = validateUploadedRasterFile(makeFile('logo.png', MAX_RASTER_UPLOAD_FILE_SIZE_BYTES, 'image/png'));
  assert.equal(result.ok, true);
});
