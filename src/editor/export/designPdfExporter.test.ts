/**
 * Tests de `designPdfExporter.ts` — Etapa 12B. Mismo patrón que
 * `designExporter.test.ts` (canvas simulado + objetos de Fabric REALES).
 *
 * SOBRE LOS TESTS DE TEXTO: igual que en `designExporter.test.ts`, sin
 * `document` (Node/tsx) un texto SIEMPRE cae al fallback `<textPath>` — acá
 * eso es justo lo que permite probar la política explícita del PDF: un
 * texto dependiente de fuente nunca genera un PDF silenciosamente
 * incompleto (ver el comentario grande de `designPdfExporter.ts`).
 *
 * Correr: `npx tsx --test src/editor/export/designPdfExporter.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path, IText, type FabricObject } from 'fabric';
import { createIconObject } from '../canvas/iconElement.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';
import type { IconDefinition } from '../icons/iconLibrary.ts';
import { exportDesignToPdf } from './designPdfExporter.ts';
import type { ExportableCanvas } from './designExporter.ts';

function fakeCanvas(objects: FabricObject[]): ExportableCanvas {
  return { getObjects: () => objects };
}

const SIMPLE_ICON: IconDefinition = {
  id: 'legacy-heart',
  name: 'Corazón',
  svgPath: 'M50,20 C20,0 0,30 50,80 C100,30 80,0 50,20 Z',
  paintMode: 'fill',
  fillRule: 'nonzero',
};

const COMPOUND_ICON: IconDefinition = {
  id: 'ring', name: 'Anillo', svgPath: '', paintMode: 'fill', fillRule: 'nonzero',
  layers: [
    { d: 'M0,0 L100,0 L100,100 L0,100 Z', role: 'ink', fillRule: 'nonzero' },
    { d: 'M30,30 L70,30 L70,70 L30,70 Z', role: 'paper', fillRule: 'nonzero' },
  ],
};

test('exportDesignToPdf: diseño vacío -> success:false, reason:"empty"', async () => {
  const result = await exportDesignToPdf(fakeCanvas([]), VIROLA_CONFIG);
  assert.deepEqual(result, { success: false, reason: 'empty' });
});

test('exportDesignToPdf: un ícono simple real -> success:true con un Blob no vacío', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const result = await exportDesignToPdf(fakeCanvas([icon]), VIROLA_CONFIG);
  assert.equal(result.success, true);
  if (result.success) {
    assert.ok(result.blob instanceof Blob);
    assert.ok(result.blob.size > 0);
  }
});

test('exportDesignToPdf: un ícono compuesto con agujero -> success:true (el holes/fill-rule ya se resolvió en la geometría compartida)', async () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 90);
  const result = await exportDesignToPdf(fakeCanvas([icon]), VIROLA_CONFIG);
  assert.equal(result.success, true);
});

test('exportDesignToPdf: una línea circular real -> success:true', async () => {
  const line = new Path('M 150 100 A 100 100 0 1 1 350 100', { excludeFromExport: true, stroke: '#111', strokeWidth: 2, fill: '' });
  line.set('circularLine', true);
  const result = await exportDesignToPdf(fakeCanvas([line]), VIROLA_CONFIG);
  assert.equal(result.success, true);
});

test('exportDesignToPdf: un texto dependiente de fuente (fallback) -> NUNCA genera un PDF, success:false con el motivo explícito y el texto identificado', async () => {
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('MATE SHOP', {
    left: 320, top: 320, originX: 'center', originY: 'center',
    fontFamily: 'Poppins', fill: '#1a1a1a', fontSize: 24,
    path: arcPath, pathAlign: 'center', pathSide: 'left', pathStartOffset: 0,
  });
  const result = await exportDesignToPdf(fakeCanvas([text]), VIROLA_CONFIG);
  assert.deepEqual(result, { success: false, reason: 'font-dependent-text', fontDependentTexts: ['MATE SHOP'] });
});

test('exportDesignToPdf: diseño mixto (ícono + texto dependiente de fuente) -> falla igual, nunca genera un PDF que omita el texto en silencio', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('HOLA', { left: 320, top: 320, path: arcPath, fontFamily: 'Poppins', fill: '#000', fontSize: 20 });
  const result = await exportDesignToPdf(fakeCanvas([icon, text]), VIROLA_CONFIG);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.reason, 'font-dependent-text');
  }
});
