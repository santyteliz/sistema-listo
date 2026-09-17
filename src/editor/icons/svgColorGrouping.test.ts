import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColorToRgb, relativeLuminance, groupColors } from './svgColorGrouping.ts';

test('parseColorToRgb: hex de 6 y 3 dígitos', () => {
  assert.deepEqual(parseColorToRgb('#231f20'), { r: 0x23, g: 0x1f, b: 0x20 });
  assert.deepEqual(parseColorToRgb('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColorToRgb('#000'), { r: 0, g: 0, b: 0 });
});

test('parseColorToRgb: rgb()/rgba() con espacios o comas', () => {
  assert.deepEqual(parseColorToRgb('rgb(35,31,32)'), { r: 35, g: 31, b: 32 });
  assert.deepEqual(parseColorToRgb('rgb(35 31 32)'), { r: 35, g: 31, b: 32 });
  assert.deepEqual(parseColorToRgb('rgba(0,0,0,0.5)'), { r: 0, g: 0, b: 0 });
});

test('parseColorToRgb: palabras clave black/white', () => {
  assert.deepEqual(parseColorToRgb('black'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColorToRgb('white'), { r: 255, g: 255, b: 255 });
});

test('parseColorToRgb: valor no resoluble da null (currentColor, palabra clave no soportada)', () => {
  assert.equal(parseColorToRgb('currentcolor'), null);
  assert.equal(parseColorToRgb('cornflowerblue'), null);
});

test('relativeLuminance: negro < gris < blanco', () => {
  const black = relativeLuminance({ r: 0, g: 0, b: 0 });
  const gray = relativeLuminance({ r: 128, g: 128, b: 128 });
  const white = relativeLuminance({ r: 255, g: 255, b: 255 });
  assert.ok(black < gray);
  assert.ok(gray < white);
});

// =====================================================================
// groupColors — el caso concreto pedido en el pedido de esta etapa
// =====================================================================

test('groupColors: variantes casi idénticas de negro (#231f20/#232020/#222222) forman UN solo grupo', () => {
  const result = groupColors(['#231f20', '#232020', '#222222']);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].members.length, 3);
  }
});

test('groupColors: negro y blanco forman DOS grupos (tinta vs. papel)', () => {
  const result = groupColors(['#231f20', '#ffffff']);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.groups.length, 2);
    // El primer grupo devuelto es siempre el más oscuro (ver la doc de groupColors).
    assert.ok(result.groups[0].luminance < result.groups[1].luminance);
  }
});

test('groupColors: un solo color repetido muchas veces sigue siendo UN grupo', () => {
  const result = groupColors(['black', 'black', 'black', 'black']);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groups.length, 1);
});

test('groupColors: tres tonos genuinamente distintos (negro/gris medio/blanco) se rechaza — más de 2 grupos', () => {
  const result = groupColors(['#000000', '#808080', '#ffffff']);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'too-many-groups');
});

test('groupColors: un color no resoluble (currentColor) se rechaza sin adivinar a qué grupo pertenece', () => {
  const result = groupColors(['#231f20', 'currentcolor']);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'unresolvable-color');
});

test('groupColors: dos tonos de gris con distancia por encima del umbral dan 2 grupos válidos (no un rechazo — 2 grupos está permitido)', () => {
  const result = groupColors(['#000000', '#181818']);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groups.length, 2);
});

test('groupColors: lista vacía da un único resultado sin grupos (caso borde, no debería llegar a llamarse así en la práctica)', () => {
  const result = groupColors([]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groups.length, 0);
});
