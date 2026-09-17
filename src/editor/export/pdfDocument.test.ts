/**
 * Tests de `pdfDocument.ts` — Etapa 12B. A diferencia de la mayoría de los
 * módulos "browser-only" de este proyecto, `jsPDF` SÍ funciona en Node sin
 * ningún shim (verificado) — así que estos tests generan un PDF REAL y lo
 * inspeccionan con `pdfjs-dist` (ya es devDependency del proyecto, usada
 * hoy para la herramienta offline `pdfToPaths.ts` — no es nueva acá), en
 * vez de solo confiar en que `buildPdfDocument` no tire.
 *
 * QUÉ NO SE TESTEA ACÁ A PROPÓSITO (ver el pedido de esta etapa: "no hace
 * falta testear el motor interno de jsPDF"): no se decodifican los
 * sub-códigos internos de `constructPath` de `pdf.js` (moveTo/lineTo/etc.
 * dentro del operador) — son un detalle de implementación de `pdf.js`, no
 * documentado públicamente, y depender de su formato exacto haría estos
 * tests frágiles ante una actualización de esa librería. En cambio, se usa
 * el bounding box (`minMax`) que `pdf.js` ya calcula y expone para cada
 * `constructPath` — sí es una API estable — para verificar que la
 * geometría llega a la posición/escala esperada.
 *
 * Correr: `npx tsx --test src/editor/export/pdfDocument.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { buildPdfDocument } from './pdfDocument.ts';
import type { SvgShapeSpec } from './svgDocument.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';

const PT_PER_MM = 72 / 25.4;

async function loadPdfjs() {
  const url = pathToFileURL('node_modules/pdfjs-dist/legacy/build/pdf.mjs').href;
  return import(url);
}

async function inspectPdf(blob: Blob) {
  const { getDocument, OPS } = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList();
  const opNameByCode = Object.fromEntries(Object.entries(OPS).map(([name, code]) => [code as number, name]));
  const names = opList.fnArray.map((code: number) => opNameByCode[code]);

  // IMPORTANTE (descubierto inspeccionando la salida real, no documentado
  // en la API pública de pdf.js): `constructPath` NUNCA viene acompañado de
  // un operador `fill`/`eoFill`/`stroke` separado en `fnArray` — pdf.js
  // codifica el tipo de pintado como el PRIMER argumento del propio
  // `constructPath` (`args[0]`, uno de los códigos `OPS.fill`/`OPS.eoFill`/
  // `OPS.stroke`). El bounding box (`args[2]`) sí es la forma pública y
  // estable de leer la geometría resultante.
  const constructPathIndexes = names
    .map((n: string, i: number) => (n === 'constructPath' ? i : -1))
    .filter((i: number) => i !== -1);
  const paths = constructPathIndexes.map((i: number) => {
    const args = opList.argsArray[i] as [number, unknown, { 0: number; 1: number; 2: number; 3: number }];
    return { paintOp: opNameByCode[args[0]] as string, boundingBox: args[2] };
  });

  return {
    numPages: doc.numPages,
    widthMm: (viewport.width * 25.4) / 72,
    heightMm: (viewport.height * 25.4) / 72,
    heightPt: viewport.height,
    opNames: names as string[],
    paths,
    pathBoundingBoxes: paths.map((p) => p.boundingBox),
  };
}

test('buildPdfDocument: diseño vacío -> igual un PDF válido de 94x94mm', async () => {
  const info = await inspectPdf(await buildPdfDocument([], VIROLA_CONFIG));
  assert.equal(info.numPages, 1);
  assert.ok(Math.abs(info.widthMm - 94) < 0.01);
  assert.ok(Math.abs(info.heightMm - 94) < 0.01);
});

test('buildPdfDocument: nunca contiene operadores de imagen rasterizada (siempre vectorial)', async () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'fill', d: 'M0,0 L100,0 L100,100 L0,100 Z', fillRule: 'nonzero', fill: '#222222' },
  ];
  const info = await inspectPdf(await buildPdfDocument(shapes, VIROLA_CONFIG));
  const imageOps = ['paintImageXObject', 'paintJpegXObject', 'paintImageMaskXObject', 'paintInlineImageXObject'];
  assert.ok(!info.opNames.some((n) => imageOps.includes(n)));
  assert.ok(info.opNames.includes('constructPath'));
});

test('buildPdfDocument: shape "fill" con fill-rule nonzero pinta con el operador "fill" normal (no evenodd)', async () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'fill', d: 'M0,0 L10,0 L10,10 Z', fillRule: 'nonzero', fill: '#111111' },
  ];
  const info = await inspectPdf(await buildPdfDocument(shapes, VIROLA_CONFIG));
  assert.equal(info.paths.length, 1);
  assert.equal(info.paths[0].paintOp, 'fill');
});

test('buildPdfDocument: shape "fill" con fill-rule evenodd pinta con el operador "eoFill" (holes correctos)', async () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'fill', d: 'M0,0 L10,0 L10,10 Z M3,3 L7,3 L7,7 Z', fillRule: 'evenodd', fill: '#111111' },
  ];
  const info = await inspectPdf(await buildPdfDocument(shapes, VIROLA_CONFIG));
  assert.equal(info.paths.length, 1);
  assert.equal(info.paths[0].paintOp, 'eoFill');
});

test('buildPdfDocument: shape "stroke" usa color/grosor de trazo, y pinta con el operador "stroke" (nunca relleno)', async () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'stroke', d: 'M0,0 L50,50', strokeWidth: 2, stroke: '#333333' },
  ];
  const info = await inspectPdf(await buildPdfDocument(shapes, VIROLA_CONFIG));
  assert.ok(info.opNames.includes('setStrokeRGBColor'));
  assert.ok(info.opNames.includes('setLineWidth'));
  assert.equal(info.paths.length, 1);
  assert.equal(info.paths[0].paintOp, 'stroke');
  assert.ok(!info.opNames.includes('setFillRGBColor'), 'un trazo nunca debe setear color de relleno');
});

test('buildPdfDocument: cada shape produce su propio constructPath, en la misma cantidad y orden', async () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'fill', d: 'M0,0 L1,0 L1,1 Z', fillRule: 'nonzero', fill: '#111' },
    { kind: 'stroke', d: 'M0,0 L1,1', strokeWidth: 1, stroke: '#222' },
    { kind: 'fill', d: 'M0,0 L2,0 L2,2 Z', fillRule: 'nonzero', fill: '#333' },
  ];
  const info = await inspectPdf(await buildPdfDocument(shapes, VIROLA_CONFIG));
  const pathCount = info.opNames.filter((n) => n === 'constructPath').length;
  assert.equal(pathCount, 3);
});

test('buildPdfDocument: shape "text" (fallback dependiente de fuente) tira un error explícito — nunca dibuja con doc.text()', async () => {
  const shapes: SvgShapeSpec[] = [
    { kind: 'text', id: 't1', pathD: 'M0,0 L10,0', content: 'HOLA', fontFamily: 'Poppins', fontSize: 20, fill: '#000', side: 'left', startOffset: 0 },
  ];
  await assert.rejects(() => buildPdfDocument(shapes, VIROLA_CONFIG), /shape "text"/);
});

test('buildPdfDocument: la geometría llega a la posición/escala física correcta (misma transformación canvas-px -> página-mm que el SVG)', async () => {
  // Cuadrado conocido en espacio canvas-px, centrado en el mismo punto que
  // el centro de VIROLA_CONFIG (320,320) desplazado 100px hacia la derecha
  // y hacia abajo — matemática esperada: mm = (px - 320) * 0.2 + 47.
  const shapes: SvgShapeSpec[] = [
    { kind: 'fill', d: 'M320,220 L420,220 L420,320 L320,320 Z', fillRule: 'nonzero', fill: '#222222' },
  ];
  const expectedMm = { minX: 47, maxX: 67, minY: 27, maxY: 47 }; // ver el cálculo arriba
  const info = await inspectPdf(await buildPdfDocument(shapes, VIROLA_CONFIG));
  assert.equal(info.pathBoundingBoxes.length, 1);
  const bbox = info.pathBoundingBoxes[0];

  // pdf.js reporta el bbox en puntos PDF, con el eje Y ya invertido respecto
  // del "arriba-abajo" que usamos nosotros (origen del PDF: abajo-izquierda)
  // — se convierte de vuelta a mm "de nuestro sistema" antes de comparar,
  // en vez de hardcodear la conversión inversa acá.
  const gotMinXMm = bbox[0] / PT_PER_MM;
  const gotMaxXMm = bbox[2] / PT_PER_MM;
  const gotMinYMm = info.heightMm - bbox[3] / PT_PER_MM;
  const gotMaxYMm = info.heightMm - bbox[1] / PT_PER_MM;

  assert.ok(Math.abs(gotMinXMm - expectedMm.minX) < 0.05, `minX esperado ${expectedMm.minX}, obtenido ${gotMinXMm}`);
  assert.ok(Math.abs(gotMaxXMm - expectedMm.maxX) < 0.05, `maxX esperado ${expectedMm.maxX}, obtenido ${gotMaxXMm}`);
  assert.ok(Math.abs(gotMinYMm - expectedMm.minY) < 0.05, `minY esperado ${expectedMm.minY}, obtenido ${gotMinYMm}`);
  assert.ok(Math.abs(gotMaxYMm - expectedMm.maxY) < 0.05, `maxY esperado ${expectedMm.maxY}, obtenido ${gotMaxYMm}`);
});
