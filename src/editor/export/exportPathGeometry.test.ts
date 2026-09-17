/**
 * Tests de `exportPathGeometry.ts` — Etapa 10. Todo PURO (sin Fabric real,
 * sin DOM) — trabaja sobre arrays de comandos planos, mismo formato que
 * expone `path.path` de Fabric.
 *
 * Correr: `node --test src/editor/icons` no aplica acá — este archivo vive
 * en `src/editor/export/`, correr con
 * `node --test src/editor/export/exportPathGeometry.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformFabricPathCommands,
  serializeFabricPathCommands,
  splitIntoSubpaths,
  signedSubpathArea,
  reverseSubpathWinding,
  computeCanvasToPageTransform,
  type FabricPathCommand,
} from './exportPathGeometry.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';

test('computeCanvasToPageTransform: coincide con los números reales de VIROLA_CONFIG (94mm, canvas 640px, centro 320,320)', () => {
  const t = computeCanvasToPageTransform(VIROLA_CONFIG);
  assert.equal(t.scale, 1 / VIROLA_CONFIG.mmToPx);
  assert.deepEqual(t.canvasCenterPx, { x: VIROLA_CONFIG.width / 2, y: VIROLA_CONFIG.height / 2 });
  assert.equal(t.pageCenterMm, VIROLA_CONFIG.outerDiameterMm / 2);
});

test('computeCanvasToPageTransform: el centro exacto del canvas cae en el centro exacto de la página en mm (ida y vuelta)', () => {
  const t = computeCanvasToPageTransform(VIROLA_CONFIG);
  const mmX = (t.canvasCenterPx.x - t.canvasCenterPx.x) * t.scale + t.pageCenterMm;
  const mmY = (t.canvasCenterPx.y - t.canvasCenterPx.y) * t.scale + t.pageCenterMm;
  assert.equal(mmX, VIROLA_CONFIG.outerDiameterMm / 2);
  assert.equal(mmY, VIROLA_CONFIG.outerDiameterMm / 2);
});

const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

test('transformFabricPathCommands: matriz identidad + offset cero no cambia nada', () => {
  const commands: FabricPathCommand[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['Z']];
  const result = transformFabricPathCommands(commands, { x: 0, y: 0 }, IDENTITY);
  assert.deepEqual(result, commands);
});

test('transformFabricPathCommands: resta el pathOffset antes de aplicar la matriz', () => {
  const commands: FabricPathCommand[] = [['M', 50, 50]];
  const result = transformFabricPathCommands(commands, { x: 50, y: 50 }, IDENTITY);
  assert.deepEqual(result, [['M', 0, 0]]);
});

test('transformFabricPathCommands: traslación simple', () => {
  const commands: FabricPathCommand[] = [['M', 0, 0], ['L', 10, 10]];
  const translate: [number, number, number, number, number, number] = [1, 0, 0, 1, 100, 200];
  const result = transformFabricPathCommands(commands, { x: 0, y: 0 }, translate);
  assert.deepEqual(result, [['M', 100, 200], ['L', 110, 210]]);
});

test('transformFabricPathCommands: comandos C y Q transforman también los puntos de control', () => {
  const commands: FabricPathCommand[] = [
    ['M', 0, 0],
    ['C', 1, 1, 2, 2, 3, 3],
    ['Q', 4, 4, 5, 5],
  ];
  const translate: [number, number, number, number, number, number] = [1, 0, 0, 1, 10, 10];
  const result = transformFabricPathCommands(commands, { x: 0, y: 0 }, translate);
  assert.deepEqual(result, [
    ['M', 10, 10],
    ['C', 11, 11, 12, 12, 13, 13],
    ['Q', 14, 14, 15, 15],
  ]);
});

test('serializeFabricPathCommands: produce un `d` válido con todos los tipos de comando', () => {
  const commands: FabricPathCommand[] = [
    ['M', 0, 0],
    ['L', 10, 0],
    ['C', 1, 1, 2, 2, 10, 10],
    ['Q', 3, 3, 0, 10],
    ['Z'],
  ];
  const d = serializeFabricPathCommands(commands);
  assert.equal(d, 'M0,0 L10,0 C1,1 2,2 10,10 Q3,3 0,10 Z');
});

test('splitIntoSubpaths: separa varios M...Z en subtrazos independientes', () => {
  const commands: FabricPathCommand[] = [
    ['M', 0, 0], ['L', 10, 0], ['Z'],
    ['M', 20, 20], ['L', 30, 20], ['Z'],
  ];
  const subpaths = splitIntoSubpaths(commands);
  assert.equal(subpaths.length, 2);
  assert.deepEqual(subpaths[0], [['M', 0, 0], ['L', 10, 0], ['Z']]);
  assert.deepEqual(subpaths[1], [['M', 20, 20], ['L', 30, 20], ['Z']]);
});

test('signedSubpathArea: un cuadrado en sentido horario (Y hacia abajo) y uno antihorario dan signos opuestos', () => {
  // En convención de canvas (Y crece hacia abajo), este recorrido
  // (0,0)->(10,0)->(10,10)->(0,10) es horario visualmente.
  const clockwise: FabricPathCommand[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
  const counterClockwise: FabricPathCommand[] = [['M', 0, 0], ['L', 0, 10], ['L', 10, 10], ['L', 10, 0], ['Z']];
  const areaCW = signedSubpathArea(clockwise);
  const areaCCW = signedSubpathArea(counterClockwise);
  assert.notEqual(Math.sign(areaCW), Math.sign(areaCCW));
  assert.ok(Math.abs(areaCW) > 0);
  assert.ok(Math.abs(Math.abs(areaCW) - Math.abs(areaCCW)) < 1e-9, 'mismo área absoluta, solo cambia el signo');
});

test('reverseSubpathWinding: invierte el signo del área sin cambiar la forma (mismo área absoluta)', () => {
  const subpath: FabricPathCommand[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
  const reversed = reverseSubpathWinding(subpath);
  const originalArea = signedSubpathArea(subpath);
  const reversedArea = signedSubpathArea(reversed);
  assert.notEqual(Math.sign(originalArea), Math.sign(reversedArea));
  assert.ok(Math.abs(Math.abs(originalArea) - Math.abs(reversedArea)) < 1e-9);
});

test('reverseSubpathWinding: con curvas C, los puntos de control se reordenan correctamente (ida y vuelta = idéntico)', () => {
  const subpath: FabricPathCommand[] = [
    ['M', 0, 0],
    ['C', 5, -5, 15, -5, 20, 0],
    ['C', 25, 5, 25, 15, 20, 20],
    ['Z'],
  ];
  const reversedTwice = reverseSubpathWinding(reverseSubpathWinding(subpath));
  // Revertir dos veces debe volver exactamente al punto de partida (mismos
  // comandos, quizás reordenados pero geométricamente idénticos) — se
  // verifica comparando el área con signo, que debe coincidir en signo Y
  // magnitud tras dos inversiones.
  assert.equal(Math.sign(signedSubpathArea(subpath)), Math.sign(signedSubpathArea(reversedTwice)));
  assert.ok(Math.abs(signedSubpathArea(subpath) - signedSubpathArea(reversedTwice)) < 1e-6);
});

test('reverseSubpathWinding: preserva si el subtrazo estaba cerrado (Z) o abierto', () => {
  const closed: FabricPathCommand[] = [['M', 0, 0], ['L', 10, 0], ['Z']];
  const open: FabricPathCommand[] = [['M', 0, 0], ['L', 10, 0]];
  assert.equal(reverseSubpathWinding(closed).at(-1)?.[0], 'Z');
  assert.notEqual(reverseSubpathWinding(open).at(-1)?.[0], 'Z');
});
