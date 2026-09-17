/**
 * Tests de `pdfPathAdapter.ts` — Etapa 12B. Puro, sin Fabric/DOM.
 * Correr: `npx tsx --test src/editor/export/pdfPathAdapter.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absCommandsToJsPdfOps } from './pdfPathAdapter.ts';
import { IDENTITY_MATRIX, type Matrix } from '../icons/svgTransform.ts';
import type { AbsCommand } from '../icons/normalizeIconPath.ts';

test('absCommandsToJsPdfOps: M -> {op:"m", c:[x,y]}', () => {
  const ops = absCommandsToJsPdfOps([{ code: 'M', x: 10, y: 20 }], IDENTITY_MATRIX);
  assert.deepEqual(ops, [{ op: 'm', c: [10, 20] }]);
});

test('absCommandsToJsPdfOps: L -> {op:"l", c:[x,y]}', () => {
  const ops = absCommandsToJsPdfOps(
    [{ code: 'M', x: 0, y: 0 }, { code: 'L', x: 5, y: 7 }],
    IDENTITY_MATRIX,
  );
  assert.deepEqual(ops[1], { op: 'l', c: [5, 7] });
});

test('absCommandsToJsPdfOps: C -> {op:"c", c:[x1,y1,x2,y2,x,y]}, sin alterar los puntos de control', () => {
  const commands: AbsCommand[] = [
    { code: 'M', x: 0, y: 0 },
    { code: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
  ];
  const ops = absCommandsToJsPdfOps(commands, IDENTITY_MATRIX);
  assert.deepEqual(ops[1], { op: 'c', c: [1, 2, 3, 4, 5, 6] });
});

test('absCommandsToJsPdfOps: Z -> {op:"h"}', () => {
  const ops = absCommandsToJsPdfOps(
    [{ code: 'M', x: 0, y: 0 }, { code: 'L', x: 1, y: 1 }, { code: 'Z' }],
    IDENTITY_MATRIX,
  );
  assert.deepEqual(ops[2], { op: 'h' });
});

test('absCommandsToJsPdfOps: conserva el orden y la cantidad de comandos en un path con varios subtrazos', () => {
  const commands: AbsCommand[] = [
    { code: 'M', x: 0, y: 0 }, { code: 'L', x: 10, y: 0 }, { code: 'L', x: 10, y: 10 }, { code: 'Z' },
    { code: 'M', x: 3, y: 3 }, { code: 'L', x: 7, y: 3 }, { code: 'L', x: 7, y: 7 }, { code: 'Z' },
  ];
  const ops = absCommandsToJsPdfOps(commands, IDENTITY_MATRIX);
  assert.equal(ops.length, 8);
  assert.deepEqual(ops.map((o) => o.op), ['m', 'l', 'l', 'h', 'm', 'l', 'l', 'h']);
});

test('absCommandsToJsPdfOps: Q -> C, conversión cuadrática->cúbica estándar (puntos de control a 2/3 del camino)', () => {
  // Q desde (0,0), control (10,10), hasta (20,0) — puntos de control
  // cúbicos esperados: c1 = P0 + 2/3*(Qc-P0) = (6.667, 6.667);
  // c2 = P2 + 2/3*(Qc-P2) = (13.333, 6.667) — fórmula estándar de
  // conversión exacta cuadrática->cúbica.
  const commands: AbsCommand[] = [
    { code: 'M', x: 0, y: 0 },
    { code: 'Q', x1: 10, y1: 10, x: 20, y: 0 },
  ];
  const ops = absCommandsToJsPdfOps(commands, IDENTITY_MATRIX);
  assert.equal(ops[1].op, 'c');
  const [c1x, c1y, c2x, c2y, x, y] = (ops[1] as { c: number[] }).c;
  assert.ok(Math.abs(c1x - 20 / 3) < 1e-9);
  assert.ok(Math.abs(c1y - 20 / 3) < 1e-9);
  assert.ok(Math.abs(c2x - 40 / 3) < 1e-9);
  assert.ok(Math.abs(c2y - 20 / 3) < 1e-9);
  assert.equal(x, 20);
  assert.equal(y, 0);
});

test('absCommandsToJsPdfOps: Q usa el punto ANTERIOR real como origen (no siempre 0,0)', () => {
  const commands: AbsCommand[] = [
    { code: 'M', x: 100, y: 100 },
    { code: 'L', x: 110, y: 100 },
    { code: 'Q', x1: 120, y1: 120, x: 130, y: 100 },
  ];
  const ops = absCommandsToJsPdfOps(commands, IDENTITY_MATRIX);
  const [c1x] = (ops[2] as { c: number[] }).c;
  // c1 = from(110,100) + 2/3*(control(120,120) - from) -> x: 110 + 2/3*10 = 116.667
  assert.ok(Math.abs(c1x - (110 + (2 / 3) * 10)) < 1e-9);
});

test('absCommandsToJsPdfOps: aplica la matriz de transformación a TODOS los puntos, incluidos los de control', () => {
  const scaleAndTranslate: Matrix = [2, 0, 0, 2, 5, 5]; // x' = 2x+5, y' = 2y+5
  const commands: AbsCommand[] = [
    { code: 'M', x: 1, y: 1 },
    { code: 'C', x1: 2, y1: 2, x2: 3, y2: 3, x: 4, y: 4 },
  ];
  const ops = absCommandsToJsPdfOps(commands, scaleAndTranslate);
  assert.deepEqual(ops[0], { op: 'm', c: [7, 7] }); // 2*1+5
  assert.deepEqual(ops[1], { op: 'c', c: [9, 9, 11, 11, 13, 13] }); // 2*2+5, 2*3+5, 2*4+5
});

test('absCommandsToJsPdfOps: comando A (arco) tira un error explícito — nunca dibuja silenciosamente mal', () => {
  assert.throws(
    () => absCommandsToJsPdfOps([{ code: 'A', rx: 5, ry: 5, xAxisRotation: 0, largeArcFlag: 0, sweepFlag: 1, x: 10, y: 10 }], IDENTITY_MATRIX),
    /comando de arco/,
  );
});
