/**
 * Tests de `iconExportGeometry.ts` — Etapa 10. Usa Fabric.js REAL (`Path`/
 * `Group`, vía `createIconObject`) — mismo criterio ya establecido en
 * `iconElement.test.ts`: construir/leer objetos de Fabric es modelo de
 * datos puro, no necesita un `<canvas>`/contexto 2D real, así que corre en
 * Node sin ningún shim.
 *
 * Correr: `npx tsx --test src/editor/export/iconExportGeometry.test.ts`
 * (necesita `tsx`, no alcanza `node --test` — importa `fabric`.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIconObject } from '../canvas/iconElement.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';
import type { IconDefinition, IconLayer } from '../icons/iconLibrary.ts';
import { extractIconExportShapes } from './iconExportGeometry.ts';

const SIMPLE_ICON: IconDefinition = {
  id: 'legacy-heart',
  name: 'Corazón',
  svgPath: 'M50,20 C20,0 0,30 50,80 C100,30 80,0 50,20 Z',
  paintMode: 'fill',
  fillRule: 'nonzero',
};

const COMPOUND_LAYERS: IconLayer[] = [
  { d: 'M10,10 L90,10 L90,90 L10,90 Z', role: 'ink', fillRule: 'nonzero' },
  { d: 'M30,40 L70,40 L70,60 L30,60 Z', role: 'paper', fillRule: 'nonzero' },
  { d: 'M40,45 L60,45 L60,55 L40,55 Z', role: 'ink', fillRule: 'evenodd' },
];

const COMPOUND_ICON: IconDefinition = {
  id: 'upload-boca02-like',
  name: 'Subido',
  svgPath: '',
  paintMode: 'fill',
  fillRule: 'nonzero',
  layers: COMPOUND_LAYERS,
};

function subpathsOf(d: string): string[] {
  return d.split(/(?=M)/).filter((s) => s.trim());
}

function signedAreaOfSubpathD(d: string): number {
  const points: [number, number][] = [];
  const numberPattern = /-?\d+(\.\d+)?/g;
  const commandPattern = /[MLCQZ][^MLCQZ]*/g;
  const commands = d.match(commandPattern) ?? [];
  for (const cmd of commands) {
    const code = cmd[0];
    if (code === 'Z') continue;
    const nums = (cmd.match(numberPattern) ?? []).map(Number);
    points.push([nums[nums.length - 2], nums[nums.length - 1]]);
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

test('extractIconExportShapes: ícono simple (Path) produce una sola shape con su propio fillRule', () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const shapes = extractIconExportShapes(icon);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].fillRule, 'nonzero');
  assert.ok(shapes[0].d.length > 0);
  assert.ok(shapes[0].d.startsWith('M'));
});

test('extractIconExportShapes: ícono simple exportado NO queda en el origen — refleja su posición real en el canvas', () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 90); // ubicado a 90°, no en el centro
  const shapes = extractIconExportShapes(icon);
  const numbers = (shapes[0].d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const maxAbs = Math.max(...numbers.map(Math.abs));
  // Si la transformación no se hubiera aplicado, las coordenadas serían las
  // del `svgPath` original (rango 0-100, centrado en el origen local) — acá
  // deben reflejar la posición real sobre el anillo (coordenadas grandes,
  // del orden de los cientos de px del canvas real, ver virola.config.ts).
  assert.ok(maxAbs > 150, `se esperaban coordenadas absolutas del canvas real (>150px), se obtuvo un máximo de ${maxAbs}`);
});

test('extractIconExportShapes: ícono compuesto (Group ink/paper/ink) produce UNA sola shape combinada, con 3 subtrazos', () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0);
  const shapes = extractIconExportShapes(icon);
  assert.equal(shapes.length, 1, 'todas las capas se combinan en un único path exportado');
  assert.equal(shapes[0].fillRule, 'nonzero');
  const subpaths = subpathsOf(shapes[0].d);
  assert.equal(subpaths.length, 3, 'las 3 capas (ink, paper, ink) producen 3 subtrazos dentro del mismo path');
});

test('extractIconExportShapes: la capa `paper` queda con bobinado OPUESTO a la capa `ink` que la contiene (agujero real bajo nonzero)', () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0);
  const shapes = extractIconExportShapes(icon);
  const subpaths = subpathsOf(shapes[0].d);
  const inkArea = signedAreaOfSubpathD(subpaths[0]); // capa 0: ink (cuadrado exterior)
  const paperArea = signedAreaOfSubpathD(subpaths[1]); // capa 1: paper (agujero)
  assert.notEqual(Math.sign(inkArea), Math.sign(paperArea), 'ink y paper deben tener bobinado opuesto para que paper funcione como agujero bajo fill-rule nonzero');
});

test('extractIconExportShapes: no depende del orden en que Fabric reporte los hijos del Group — sigue funcionando con capas en otro orden', () => {
  const reorderedLayers: IconLayer[] = [
    { d: 'M0,0 L100,0 L100,100 L0,100 Z', role: 'ink', fillRule: 'nonzero' },
    { d: 'M20,20 L80,20 L80,80 L20,80 Z', role: 'paper', fillRule: 'nonzero' },
  ];
  const iconDef: IconDefinition = { id: 'x', name: 'x', svgPath: '', paintMode: 'fill', fillRule: 'nonzero', layers: reorderedLayers };
  const icon = createIconObject(iconDef, VIROLA_CONFIG, 0);
  const shapes = extractIconExportShapes(icon);
  assert.equal(shapes.length, 1);
  const subpaths = subpathsOf(shapes[0].d);
  assert.equal(subpaths.length, 2);
  assert.notEqual(Math.sign(signedAreaOfSubpathD(subpaths[0])), Math.sign(signedAreaOfSubpathD(subpaths[1])));
});
