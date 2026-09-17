/**
 * Tests de `svgTransform.ts` — Etapa 8B. Mismo nivel de rigor que
 * `scripts/icon-import/pdfMatrixComposition.test.ts` (Etapa 7B/7C): cada
 * caso se verifica contra un punto de control calculado A MANO, nunca
 * comparando la función contra sí misma — precisamente para no repetir el
 * bug de orden de composición que tuvo el módulo de matrices del PDF.
 *
 * Correr: `node --test src/editor/icons/svgTransform.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compose,
  applyToPoint,
  translateMatrix,
  scaleMatrix,
  rotateMatrix,
  parseTransformAttribute,
  isSimilarity,
  similarityScale,
  isAxisAligned,
  IDENTITY_MATRIX,
  type Matrix,
} from './svgTransform.ts';

function assertPointClose(actual: { x: number; y: number }, expected: { x: number; y: number }, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual.x - expected.x) <= tolerance, `x: actual=${actual.x} esperado=${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= tolerance, `y: actual=${actual.y} esperado=${expected.y}`);
}

test('compose: traslación + traslación conmuta (control manual)', () => {
  const t1 = translateMatrix(10, 20);
  const t2 = translateMatrix(5, 7);
  const combined = compose(t1, t2); // t1 primero, t2 después
  assertPointClose(applyToPoint(combined, 0, 0), { x: 15, y: 27 });
});

test('compose: escala luego traslación — el orden importa (control manual)', () => {
  // base = escala x2, m = traslada (10,0). compose(base, m) = escalar PRIMERO, trasladar DESPUÉS.
  // (1,0) -> escala x2 -> (2,0) -> trasladar (+10,0) -> (12,0).
  const scale = scaleMatrix(2, 2);
  const translate = translateMatrix(10, 0);
  const combined = compose(scale, translate);
  assertPointClose(applyToPoint(combined, 1, 0), { x: 12, y: 0 });
  // El orden contrario (trasladar primero, escalar después) da un resultado DISTINTO:
  // (1,0) -> trasladar -> (11,0) -> escalar x2 -> (22,0).
  const reversed = compose(translate, scale);
  assertPointClose(applyToPoint(reversed, 1, 0), { x: 22, y: 0 });
  assert.notDeepEqual(combined, reversed);
});

test('compose: rotación 90° luego traslación — control manual', () => {
  const rotate90 = rotateMatrix(90);
  const translate = translateMatrix(1, 0);
  const combined = compose(rotate90, translate);
  // (1,0) -> rotar 90° (sentido horario, y hacia abajo: x'=x*cos-y*sin... con nuestra convención b=sin,c=-sin) -> (0,1) -> trasladar (+1,0) -> (1,1).
  const p = applyToPoint(combined, 1, 0);
  assert.equal(Math.round(p.x), 1);
  assert.equal(Math.round(p.y), 1);
});

test('parseTransformAttribute: null/vacío da la identidad', () => {
  assert.deepEqual(parseTransformAttribute(null), IDENTITY_MATRIX);
  assert.deepEqual(parseTransformAttribute(''), IDENTITY_MATRIX);
  assert.deepEqual(parseTransformAttribute('   '), IDENTITY_MATRIX);
});

test('parseTransformAttribute: "translate(10,0) scale(2)" escala PRIMERO, trasladra DESPUÉS (control manual, orden SVG: derecha a izquierda)', () => {
  const m = parseTransformAttribute('translate(10,0) scale(2)');
  // (1,0) -> scale(2) [se aplica primero, es la última función listada] -> (2,0) -> translate(10,0) -> (12,0).
  assertPointClose(applyToPoint(m, 1, 0), { x: 12, y: 0 });
});

test('parseTransformAttribute: "scale(2) translate(10,0)" da el orden CONTRARIO (control manual)', () => {
  const m = parseTransformAttribute('scale(2) translate(10,0)');
  // translate(10,0) es la última función listada -> se aplica primero: (1,0) -> (11,0) -> scale(2) -> (22,0).
  assertPointClose(applyToPoint(m, 1, 0), { x: 22, y: 0 });
});

test('parseTransformAttribute: matrix(a,b,c,d,e,f) se toma tal cual, sin reordenar', () => {
  const m = parseTransformAttribute('matrix(2,0,0,3,10,20)');
  assert.deepEqual(m, [2, 0, 0, 3, 10, 20]);
  assertPointClose(applyToPoint(m, 1, 1), { x: 12, y: 23 });
});

test('parseTransformAttribute: rotate(deg, cx, cy) rota alrededor del punto dado', () => {
  const m = parseTransformAttribute('rotate(180, 10, 10)');
  // Rotar 180° alrededor de (10,10): el punto (10,0) (a distancia 10 "arriba" del centro) termina en (10,20).
  assertPointClose(applyToPoint(m, 10, 0), { x: 10, y: 20 }, 1e-6);
});

test('parseTransformAttribute: función no reconocida tira Error (rechazar, no adivinar)', () => {
  assert.throws(() => parseTransformAttribute('foobar(1,2)'));
});

test('parseTransformAttribute: aridad inválida tira Error', () => {
  assert.throws(() => parseTransformAttribute('translate(1,2,3,4)'));
  assert.throws(() => parseTransformAttribute('matrix(1,2,3)'));
});

test('parseTransformAttribute: contenido sobrante no reconocido tira Error', () => {
  assert.throws(() => parseTransformAttribute('translate(1,2) algoRaro'));
});

test('isSimilarity: identidad y rotación pura son similitudes; escala no-uniforme no lo es', () => {
  assert.equal(isSimilarity(IDENTITY_MATRIX), true);
  assert.equal(isSimilarity(rotateMatrix(37)), true);
  assert.equal(isSimilarity(scaleMatrix(2, 3)), false);
});

test('similarityScale: para una rotación pura da 1; para rotación+escala uniforme da el factor de escala', () => {
  assert.ok(Math.abs(similarityScale(rotateMatrix(45)) - 1) < 1e-9);
  const rotateAndScale = compose(rotateMatrix(30), scaleMatrix(3, 3));
  assert.ok(Math.abs(similarityScale(rotateAndScale) - 3) < 1e-6);
});

test('isAxisAligned: escala no-uniforme sin rotación es axis-aligned; con rotación no lo es', () => {
  assert.equal(isAxisAligned(scaleMatrix(2, 5)), true);
  assert.equal(isAxisAligned(rotateMatrix(10)), false);
});

test('compose es asociativa (identidad de control, no autoreferencial): compose(compose(A,B),C) == compose(A,compose(B,C))', () => {
  const a: Matrix = [1, 0.2, -0.1, 1.3, 4, -2];
  const b: Matrix = [0.9, -0.3, 0.4, 1.1, -3, 5];
  const c: Matrix = translateMatrix(7, -8);
  const left = compose(compose(a, b), c);
  const right = compose(a, compose(b, c));
  for (let i = 0; i < 6; i++) {
    assert.ok(Math.abs(left[i] - right[i]) < 1e-9, `componente ${i} difiere`);
  }
});
