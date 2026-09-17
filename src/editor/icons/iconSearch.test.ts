/**
 * Pruebas de `iconSearch.ts` — Etapa 3 (drawer + catálogo real).
 * Mismo test runner nativo de Node que el resto del proyecto — cero
 * dependencias nuevas.
 *
 * Correr: `node --test src/editor/icons/iconSearch.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForSearch, searchIconsByName, groupIconsByCategory } from './iconSearch.ts';
import type { IconAsset } from './iconCatalog.ts';

function makeIcon(overrides: Partial<IconAsset>): IconAsset {
  const now = new Date().toISOString();
  return {
    id: 'test-id',
    name: 'Test',
    categoryId: 'animales',
    svgPath: 'M0,0 L10,10 L10,0 Z',
    order: 0,
    active: true,
    source: 'library',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('normalizeForSearch — ignora mayúsculas/minúsculas y acentos', () => {
  assert.equal(normalizeForSearch('Avión'), normalizeForSearch('avion'));
  assert.equal(normalizeForSearch('PERRO'), normalizeForSearch('perro'));
  assert.equal(normalizeForSearch('  Fútbol  '), 'futbol');
});

test('searchIconsByName — query vacía o solo espacios devuelve todos los íconos sin filtrar', () => {
  const icons = [makeIcon({ id: 'a', name: 'Perro' }), makeIcon({ id: 'b', name: 'Gato' })];
  assert.equal(searchIconsByName(icons, '').length, 2);
  assert.equal(searchIconsByName(icons, '   ').length, 2);
});

test('searchIconsByName — filtra por nombre insensible a mayúsculas y acentos', () => {
  const icons = [
    makeIcon({ id: 'a', name: 'Avión' }),
    makeIcon({ id: 'b', name: 'Corazón' }),
    makeIcon({ id: 'c', name: 'Escudo' }),
  ];
  assert.deepEqual(searchIconsByName(icons, 'avion').map((i) => i.id), ['a']);
  assert.deepEqual(searchIconsByName(icons, 'CORAZON').map((i) => i.id), ['b']);
  assert.deepEqual(searchIconsByName(icons, 'zzz').map((i) => i.id), []);
});

test('searchIconsByName — busca globalmente entre categorías distintas', () => {
  const icons = [
    makeIcon({ id: 'a', name: 'Perro', categoryId: 'animales' }),
    makeIcon({ id: 'b', name: 'Perro club', categoryId: 'futbol' }),
  ];
  assert.deepEqual(searchIconsByName(icons, 'perro').map((i) => i.id).sort(), ['a', 'b']);
});

test('groupIconsByCategory — agrupa por categoryId y ordena cada grupo por order', () => {
  const icons = [
    makeIcon({ id: 'a', categoryId: 'animales', order: 2 }),
    makeIcon({ id: 'b', categoryId: 'animales', order: 0 }),
    makeIcon({ id: 'c', categoryId: 'escudos', order: 1 }),
  ];
  const grouped = groupIconsByCategory(icons);
  assert.deepEqual(grouped.get('animales')?.map((i) => i.id), ['b', 'a']);
  assert.deepEqual(grouped.get('escudos')?.map((i) => i.id), ['c']);
  assert.equal(grouped.get('futbol'), undefined);
});
