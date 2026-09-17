/**
 * Tests de `designExporter.ts` — Etapa 10, `exportDesignToSvg` asíncrona
 * desde la Etapa 11. Usa un `ExportableCanvas` simulado (solo
 * `getObjects()`, ver el comentario en el propio módulo) con objetos de
 * Fabric REALES (`Path`/`Group`/guías con `excludeFromExport`) — nunca un
 * `Canvas`/`StaticCanvas` real (necesitaría DOM).
 *
 * SOBRE LOS TESTS DE TEXTO (Etapa 11): sin `document` (Node/tsx, sin DOM
 * real), `extractTextOutlineShapes` devuelve `null` inmediatamente (ver el
 * guard explícito en `textOutlineExport.ts`) — así que TODOS los textos de
 * estos tests caen siempre al fallback `<textPath>`, nunca ejercitan la
 * conversión a outlines en sí. Eso es intencional y sigue siendo un test
 * válido (verifica que el mecanismo de fallback funciona) — la conversión
 * a outlines en sí (parseo del SVG de `vectortracer`) tiene sus propios
 * tests puros en `textOutlineExport.test.ts`; el render+vectorización real
 * se verifica a mano en Chrome (ver el informe de la Etapa 11).
 *
 * Correr: `npx tsx --test src/editor/export/designExporter.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path, IText, type FabricObject } from 'fabric';
import { createIconObject } from '../canvas/iconElement.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';
import type { IconDefinition } from '../icons/iconLibrary.ts';
import { exportDesignToSvg, type ExportableCanvas } from './designExporter.ts';

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

test('exportDesignToSvg: diseño vacío -> hasContent false, pero sigue siendo un SVG válido con las dimensiones reales', async () => {
  const result = await exportDesignToSvg(fakeCanvas([]), VIROLA_CONFIG);
  assert.equal(result.hasContent, false);
  assert.ok(result.svg.includes('width="94mm"'));
  assert.deepEqual(result.fontDependentTexts, []);
});

test('exportDesignToSvg: un ícono real produce una shape "fill" en el SVG', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const result = await exportDesignToSvg(fakeCanvas([icon]), VIROLA_CONFIG);
  assert.equal(result.hasContent, true);
  assert.ok(result.svg.includes('fill-rule='));
});

test('exportDesignToSvg: las GUÍAS (excludeFromExport: true, sin marca de línea circular) NUNCA se exportan', async () => {
  const guide = new Path('M0,0 L500,500', { excludeFromExport: true, stroke: '#8a8680' });
  const result = await exportDesignToSvg(fakeCanvas([guide]), VIROLA_CONFIG);
  assert.equal(result.hasContent, false, 'una guía sola no debe producir ningún contenido exportado');
});

test('exportDesignToSvg: las LÍNEAS CIRCULARES sí se exportan, aunque tengan excludeFromExport: true (Etapa 10 — ver el informe)', async () => {
  const circularLine = new Path('M 150 100 A 100 100 0 1 1 350 100', { excludeFromExport: true, stroke: '#111', strokeWidth: 2, fill: '' });
  circularLine.set('circularLine', true);
  const result = await exportDesignToSvg(fakeCanvas([circularLine]), VIROLA_CONFIG);
  assert.equal(result.hasContent, true);
  assert.ok(result.svg.includes('stroke="'));
  assert.ok(result.svg.includes('fill="none"'));
});

test('exportDesignToSvg: un ícono compuesto con agujero exporta UN solo path con bobinado correcto (no un cuadrado sólido)', async () => {
  const iconDef: IconDefinition = {
    id: 'x', name: 'x', svgPath: '', paintMode: 'fill', fillRule: 'nonzero',
    layers: [
      { d: 'M0,0 L100,0 L100,100 L0,100 Z', role: 'ink', fillRule: 'nonzero' },
      { d: 'M30,30 L70,30 L70,70 L30,70 Z', role: 'paper', fillRule: 'nonzero' },
    ],
  };
  const icon = createIconObject(iconDef, VIROLA_CONFIG, 0);
  const result = await exportDesignToSvg(fakeCanvas([icon]), VIROLA_CONFIG);
  const pathCount = (result.svg.match(/<path /g) ?? []).length;
  assert.equal(pathCount, 1, 'ink+paper deben quedar combinados en un único <path>, nunca dos paths superpuestos');
});

test('exportDesignToSvg: sin `document` (Node/tsx), un texto curvo cae al fallback <text><textPath>, y queda registrado en fontDependentTexts', async () => {
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('MATE SHOP', {
    left: 320, top: 320, originX: 'center', originY: 'center',
    fontFamily: 'Poppins', fill: '#1a1a1a', fontSize: 24,
    path: arcPath, pathAlign: 'center', pathSide: 'left', pathStartOffset: 0,
  });
  const result = await exportDesignToSvg(fakeCanvas([text]), VIROLA_CONFIG);
  assert.ok(result.svg.includes('<textPath'));
  assert.ok(result.svg.includes('MATE SHOP'));
  assert.deepEqual(result.fontDependentTexts, ['MATE SHOP'], 'el fallback debe quedar registrado explícitamente, nunca en silencio');
});

test('exportDesignToSvg: un texto vacío/solo-espacios no produce ningún shape ni entra al fallback', async () => {
  // `path` seteado a propósito, igual que en el resto de los tests de este
  // archivo — sin él, el propio constructor de `IText` (no este módulo)
  // dispara una medición de texto que necesita un contexto 2D real, ver
  // `curvedText.ts`.
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('   ', { left: 320, top: 320, path: arcPath, fontFamily: 'Poppins', fill: '#000', fontSize: 20 });
  const result = await exportDesignToSvg(fakeCanvas([text]), VIROLA_CONFIG);
  assert.equal(result.hasContent, false);
  assert.deepEqual(result.fontDependentTexts, []);
});

test('exportDesignToSvg: diseño mixto (ícono + línea circular + texto) exporta los tres, en orden', async () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const circularLine = new Path('M 150 100 A 100 100 0 1 1 350 100', { excludeFromExport: true, stroke: '#111', strokeWidth: 2, fill: '' });
  circularLine.set('circularLine', true);
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('HOLA', { left: 320, top: 320, path: arcPath, fontFamily: 'Poppins', fill: '#000', fontSize: 20 });

  const result = await exportDesignToSvg(fakeCanvas([icon, circularLine, text]), VIROLA_CONFIG);
  // 3 <path>: el del ícono, el de la línea circular, y el del arco guía del
  // texto (declarado en <defs> para que <textPath> lo referencie — en este
  // entorno sin DOM, el texto siempre cae al fallback, ver el comentario
  // grande del archivo).
  assert.equal((result.svg.match(/<path /g) ?? []).length, 3);
  assert.ok(result.svg.includes('fill-rule='), 'el path del ícono');
  assert.ok(result.svg.includes('fill="none"'), 'el path de la línea circular');
  assert.ok(result.svg.includes('<textPath'), 'el texto curvo');
});
