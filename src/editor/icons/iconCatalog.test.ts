/**
 * Pruebas de `iconCatalog.ts` — Etapa 1 del plan de biblioteca de íconos.
 * Mismo test runner nativo de Node que `normalizeIconPath.test.ts` (ver el
 * comentario grande ahí) — cero dependencias nuevas.
 *
 * Correr: `node --test src/editor/icons/iconCatalog.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLegacyIconCatalog, LEGACY_ICON_CATEGORY, type IconAsset } from './iconCatalog.ts';
import { ICON_LIBRARY } from './iconLibrary.ts';
import { normalizeIconPath } from './normalizeIconPath.ts';

test('Caso F — los datos de catálogo (id, name, categoryId, etc.) se conservan correctamente', () => {
  const { category, icons } = getLegacyIconCatalog();

  assert.equal(category.id, LEGACY_ICON_CATEGORY.id);
  assert.equal(category.active, true);

  assert.equal(icons.length, ICON_LIBRARY.length);

  icons.forEach((asset: IconAsset, index: number) => {
    const source = ICON_LIBRARY[index];
    assert.equal(asset.id, source.id, `id debe coincidir con IconDefinition.id (${source.id})`);
    assert.equal(asset.name, source.name, `name debe coincidir con IconDefinition.name (${source.name})`);
    assert.equal(asset.svgPath, source.svgPath, 'svgPath no debe alterarse — el adaptador no duplica ni transforma los datos originales');
    assert.equal(asset.paintMode, 'stroke', 'los 6 íconos legacy deben migrar explícitamente a paintMode: stroke (Etapa 4)');
    assert.equal(asset.paintMode, source.paintMode, 'paintMode debe copiarse del IconDefinition original, no reinventarse');
    assert.equal(asset.fillRule, source.fillRule);
    assert.equal(asset.strokeWidth, source.strokeWidth);
    assert.equal(asset.strokeWidth, 8, 'debe conservar el ancho de trazo universal actual (8) para no cambiar su apariencia');
    assert.equal(asset.categoryId, LEGACY_ICON_CATEGORY.id);
    assert.equal(asset.order, index);
    assert.equal(asset.active, true);
    assert.equal(asset.source, 'library');
    assert.equal(typeof asset.createdAt, 'string');
    assert.equal(typeof asset.updatedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(asset.createdAt)), 'createdAt debe ser una fecha ISO válida');
  });
});

test('Caso F (bis) — ids únicos: ningún IconAsset del catálogo legacy repite id', () => {
  const { icons } = getLegacyIconCatalog();
  const ids = icons.map((icon) => icon.id);
  assert.equal(new Set(ids).size, ids.length, 'no debe haber ids duplicados');
});

test('Caso G — los 6 íconos actuales de ICON_LIBRARY siguen representándose y utilizándose sin cambios', () => {
  // "Siguen pudiendo construirse": ICON_LIBRARY no se modificó (mismo
  // origen de siempre para iconElement.ts/createIconObject, ver el informe
  // de esta etapa) — acá se verifica que la cantidad y el contenido siguen
  // intactos y que el adaptador nuevo los representa 1:1.
  assert.equal(ICON_LIBRARY.length, 6, 'la biblioteca actual debe seguir teniendo sus 6 íconos');
  const expectedIds = ['heart', 'star', 'infinity', 'leaf', 'mate', 'sun'];
  assert.deepEqual(ICON_LIBRARY.map((i) => i.id), expectedIds);

  // "Siguen pudiendo utilizarse": cada svgPath real de la biblioteca actual
  // es compatible con el normalizador nuevo (no tira, produce un `d`
  // válido) — demuestra que la Etapa 2 va a poder tratar estos 6 íconos
  // igual que cualquier ícono importado de un PDF, sin caso especial.
  for (const icon of ICON_LIBRARY) {
    const result = normalizeIconPath(icon.svgPath);
    assert.ok(result.d.length > 0, `normalizeIconPath no debería fallar con el svgPath real de "${icon.id}"`);
  }
});
