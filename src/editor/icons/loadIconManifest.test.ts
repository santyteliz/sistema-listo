/**
 * Pruebas de `loadIconManifest.ts` — Etapa 3. Se prueba la validación de
 * forma (`isValidManifestShape`) y la convención de URL de thumbnail
 * (`getIconThumbnailUrl`) de forma aislada, sin mockear `fetch`: el
 * comportamiento de red (una sola petición, cacheada) se verifica
 * manualmente en el navegador (ver el informe de esta etapa) — cubrirlo acá
 * exigiría reproducir el módulo por test para resetear la cache en memoria,
 * complejidad que no aporta nada que la prueba manual no confirme ya.
 *
 * Correr: `node --test src/editor/icons/loadIconManifest.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIconThumbnailUrl, isValidManifestShape } from './loadIconManifest.ts';
import type { IconAsset } from './iconCatalog.ts';

test('getIconThumbnailUrl — sigue la convención del importador (${icon.id}.png)', () => {
  const icon = { id: 'animales-animales-02' } as IconAsset;
  assert.equal(getIconThumbnailUrl(icon), '/icons/thumbnails/animales-animales-02.png');
});

test('isValidManifestShape — acepta un manifest bien formado', () => {
  const manifest = {
    categories: [{ id: 'animales', name: 'Animales', order: 0, active: true }],
    icons: [{ id: 'animales-x', name: 'X', categoryId: 'animales', svgPath: 'M0,0 Z', order: 0, active: true, source: 'library' }],
  };
  assert.equal(isValidManifestShape(manifest), true);
});

test('isValidManifestShape — rechaza valores que no son objetos', () => {
  assert.equal(isValidManifestShape(null), false);
  assert.equal(isValidManifestShape(undefined), false);
  assert.equal(isValidManifestShape('not-json'), false);
  assert.equal(isValidManifestShape([]), false);
});

test('isValidManifestShape — rechaza si faltan los arrays esperados', () => {
  assert.equal(isValidManifestShape({}), false);
  assert.equal(isValidManifestShape({ categories: [] }), false);
  assert.equal(isValidManifestShape({ icons: [] }), false);
});

test('isValidManifestShape — rechaza categorías o íconos sin los campos mínimos', () => {
  assert.equal(
    isValidManifestShape({ categories: [{ id: 'x' }], icons: [] }),
    false,
    'categoría sin name',
  );
  assert.equal(
    isValidManifestShape({ categories: [], icons: [{ id: 'x', svgPath: 'M0,0' }] }),
    false,
    'ícono sin categoryId',
  );
});

test('isValidManifestShape — acepta arrays vacíos (categoría/catálogo vacío es una forma válida, aunque no deseable en producción)', () => {
  assert.equal(isValidManifestShape({ categories: [], icons: [] }), true);
});
