/**
 * Pruebas de `iconPaintProps.ts` — Etapa 4 (corrección de relleno/trazo).
 * Correr: `node --test src/editor/icons/iconPaintProps.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIconPaintProps } from './iconPaintProps.ts';
import { DESIGN_INK_COLOR } from '../canvas/designColors.ts';

test('paintMode: fill — rellena con DESIGN_INK_COLOR, sin trazo, respeta fillRule', () => {
  const props = getIconPaintProps({ paintMode: 'fill', fillRule: 'evenodd' });
  assert.equal(props.fill, DESIGN_INK_COLOR);
  assert.equal(props.stroke, null);
  assert.equal(props.fillRule, 'evenodd');
});

test('paintMode: fill con nonzero — respeta la regla nonzero', () => {
  const props = getIconPaintProps({ paintMode: 'fill', fillRule: 'nonzero' });
  assert.equal(props.fillRule, 'nonzero');
});

test('paintMode: stroke — traza con DESIGN_INK_COLOR, sin relleno, usa el strokeWidth dado', () => {
  const props = getIconPaintProps({ paintMode: 'stroke', fillRule: 'nonzero', strokeWidth: 3.5 });
  assert.equal(props.fill, null);
  assert.equal(props.stroke, DESIGN_INK_COLOR);
  assert.equal(props.strokeWidth, 3.5);
});

test('paintMode: stroke sin strokeWidth explícito — usa el valor de respaldo (8), nunca undefined/NaN', () => {
  const props = getIconPaintProps({ paintMode: 'stroke', fillRule: 'nonzero' });
  assert.equal(props.strokeWidth, 8);
});

test('nunca produce fill Y stroke no-nulos al mismo tiempo', () => {
  const fillProps = getIconPaintProps({ paintMode: 'fill', fillRule: 'nonzero' });
  const strokeProps = getIconPaintProps({ paintMode: 'stroke', fillRule: 'nonzero', strokeWidth: 2 });
  assert.ok(fillProps.fill !== null && fillProps.stroke === null);
  assert.ok(strokeProps.stroke !== null && strokeProps.fill === null);
});
