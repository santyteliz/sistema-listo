/**
 * Tests de `designCombinedExporter.ts` — Etapa 13. Mismo patrón que
 * `designExporter.test.ts`/`designPdfExporter.test.ts` (canvas simulado +
 * objetos de Fabric REALES).
 *
 * SOBRE `pdf-error`: no se testea acá un disparo real de esa rama —
 * `collectDesignShapes` nunca produce, en la práctica, una geometría válida
 * que haga fallar a `buildPdfDocument` (Fabric normaliza arcos a curvas
 * cúbicas siempre, ver `exportPathGeometry.ts`; el único caso conocido que
 * hace fallar a `buildPdfDocument` — una shape `kind: 'text'` — ya queda
 * atajado ANTES, por la rama `font-dependent-text`). El comportamiento de
 * `buildPdfDocument` ante un error real ya está cubierto en
 * `pdfDocument.test.ts`; acá solo importa que `exportDesignToSvgAndPdf`
 * ENVUELVA ese resultado correctamente si algún día ocurriera (ver el
 * `try/catch` explícito en el código).
 *
 * Correr: `npx tsx --test src/editor/export/designCombinedExporter.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path, IText, type FabricObject } from 'fabric';
import { createIconObject } from '../canvas/iconElement.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';
import type { IconDefinition } from '../icons/iconLibrary.ts';
import { exportDesignToSvgAndPdf } from './designCombinedExporter.ts';
import type { ExportableCanvas } from './designExporter.ts';

function fakeCanvas(objects: FabricObject[]): ExportableCanvas {
  return { getObjects: () => objects };
}

const SIMPLE_ICON: IconDefinition = {
  id: 'legacy-heart', name: 'Corazón',
  svgPath: 'M50,20 C20,0 0,30 50,80 C100,30 80,0 50,20 Z',
  paintMode: 'fill', fillRule: 'nonzero',
};

const COMPOUND_ICON: IconDefinition = {
  id: 'ring', name: 'Anillo', svgPath: '', paintMode: 'fill', fillRule: 'nonzero',
  layers: [
    { d: 'M0,0 L100,0 L100,100 L0,100 Z', role: 'ink', fillRule: 'nonzero' },
    { d: 'M30,30 L70,30 L70,70 L30,70 Z', role: 'paper', fillRule: 'nonzero' },
  ],
};

test('exportDesignToSvgAndPdf: diseño vacío -> status "empty", nada que descargar', async () => {
  const result = await exportDesignToSvgAndPdf(fakeCanvas([]), VIROLA_CONFIG);
  assert.deepEqual(result, { status: 'empty' });
});

test('exportDesignToSvgAndPdf: un ícono simple real -> status "success" con SVG y PDF, ambos con contenido real', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const result = await exportDesignToSvgAndPdf(fakeCanvas([icon]), VIROLA_CONFIG);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.ok(result.svg.includes('<svg'));
    assert.ok(result.svg.includes('fill-rule='));
    assert.ok(result.pdfBlob instanceof Blob);
    assert.ok(result.pdfBlob.size > 0);
  }
});

test('exportDesignToSvgAndPdf: diseño mixto (ícono compuesto con agujero + línea circular) -> success, ambos formatos coherentes', async () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 90);
  const line = new Path('M 150 100 A 100 100 0 1 1 350 100', { excludeFromExport: true, stroke: '#111', strokeWidth: 2, fill: '' });
  line.set('circularLine', true);
  const result = await exportDesignToSvgAndPdf(fakeCanvas([icon, line]), VIROLA_CONFIG);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    // 1 path de relleno (ícono, agujero ya combinado) + 1 de trazo (línea).
    assert.equal((result.svg.match(/<path /g) ?? []).length, 2);
    assert.ok(result.pdfBlob.size > 0);
  }
});

test('exportDesignToSvgAndPdf: un texto dependiente de fuente (fallback) -> status "font-dependent-text", NUNCA success (ni SVG ni PDF se generan)', async () => {
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('MATE SHOP', {
    left: 320, top: 320, originX: 'center', originY: 'center',
    fontFamily: 'Poppins', fill: '#1a1a1a', fontSize: 24,
    path: arcPath, pathAlign: 'center', pathSide: 'left', pathStartOffset: 0,
  });
  const result = await exportDesignToSvgAndPdf(fakeCanvas([text]), VIROLA_CONFIG);
  assert.deepEqual(result, { status: 'font-dependent-text', fontDependentTexts: ['MATE SHOP'] });
});

test('exportDesignToSvgAndPdf: diseño mixto con un texto dependiente de fuente -> falla igual (política "todo o nada"), nunca descarga solo el SVG', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('HOLA', { left: 320, top: 320, path: arcPath, fontFamily: 'Poppins', fill: '#000', fontSize: 20 });
  const result = await exportDesignToSvgAndPdf(fakeCanvas([icon, text]), VIROLA_CONFIG);
  assert.equal(result.status, 'font-dependent-text');
});

test('exportDesignToSvgAndPdf: no modifica el diseño (posición/escala del ícono siguen exactamente igual después de exportar)', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const before = { left: icon.left, top: icon.top, scaleX: icon.scaleX, scaleY: icon.scaleY, angle: icon.angle };
  await exportDesignToSvgAndPdf(fakeCanvas([icon]), VIROLA_CONFIG);
  assert.deepEqual({ left: icon.left, top: icon.top, scaleX: icon.scaleX, scaleY: icon.scaleY, angle: icon.angle }, before);
});
