/**
 * Pruebas de regresión sobre el manifest REAL publicado
 * (`public/icons/manifest.json`). Escrito originalmente en la Etapa 3
 * (sección 20 del pedido: "manifest válido; 5 categorías; N assets; IDs
 * únicos; referencias de categoría válidas; diseños no aparece") contra
 * los 235 íconos de esa etapa — el catálogo promovido en la Etapa 6C
 * (187 íconos, tras la corrección de paint type de la Etapa 4 y la
 * curación visual de la Etapa 6B) es el que rige ahora; el número exacto
 * de assets se actualiza acá cada vez que se aprueba y promueve un
 * catálogo nuevo (ver `scripts/icon-import/runImport*.ts`).
 *
 * Lee el archivo directamente del disco (no hace `fetch`, no depende de un
 * servidor corriendo) — si alguna vez se vuelve a correr el importador y
 * cambia el contenido, esta prueba es la que avisa si algo se rompió.
 *
 * Correr: `node --test src/editor/icons/manifest.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isValidManifestShape } from './loadIconManifest.ts';

const MANIFEST_PATH = fileURLToPath(new URL('../../../public/icons/manifest.json', import.meta.url));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

test('el manifest tiene una forma válida', () => {
  assert.equal(isValidManifestShape(manifest), true);
});

test('hay exactamente 5 categorías, y ninguna es "diseños"/"disenos"', () => {
  assert.equal(manifest.categories.length, 5);
  const ids = manifest.categories.map((c: { id: string }) => c.id);
  assert.deepEqual(
    [...ids].sort(),
    ['animales', 'escudos', 'futbol', 'random', 'signos'],
  );
  assert.ok(!ids.some((id: string) => /dise[nñ]os/i.test(id)), '"diseños" no debe existir como categoría');
});

test('hay exactamente 233 IconAsset válidos (catálogo promovido en la Etapa 6C)', () => {
  assert.equal(manifest.icons.length, 233);
});

test('ningún icon.id se repite', () => {
  const ids = manifest.icons.map((i: { id: string }) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('todo icon.categoryId referencia una categoría real del manifest', () => {
  const validCategoryIds = new Set(manifest.categories.map((c: { id: string }) => c.id));
  for (const icon of manifest.icons) {
    assert.ok(validCategoryIds.has(icon.categoryId), `categoryId inválido en ${icon.id}: ${icon.categoryId}`);
  }
});

test('ningún nombre de ícono ni ruta menciona "diseños"/"disenos"', () => {
  for (const icon of manifest.icons) {
    assert.ok(!/dise[nñ]os/i.test(icon.name), `nombre sospechoso en ${icon.id}: ${icon.name}`);
  }
});

test('todas las coordenadas de svgPath están dentro del viewBox 0-100', () => {
  for (const icon of manifest.icons) {
    const numbers = (icon.svgPath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    assert.ok(numbers.length > 0, `${icon.id} no tiene geometría`);
    for (const n of numbers) {
      assert.ok(n >= -0.01 && n <= 100.01, `${icon.id} tiene una coordenada fuera de 0-100: ${n}`);
    }
  }
});
