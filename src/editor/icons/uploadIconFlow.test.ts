import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  uploadFlowReducer,
  INITIAL_UPLOAD_FLOW_STATE,
  uploadConfirmLabel,
  nameFromFileName,
  buildUploadedIconAsset,
  UPLOAD_FORMAT_HINT,
} from './uploadIconFlow.ts';
import type { IconAsset } from './iconCatalog.ts';

// =====================================================================
// Estados — transiciones de la máquina de estados de la vista de upload
// =====================================================================

test('estado inicial es idle', () => {
  assert.deepEqual(INITIAL_UPLOAD_FLOW_STATE, { step: 'idle' });
});

test('drag-enter desde idle pasa a drag-over', () => {
  const next = uploadFlowReducer({ step: 'idle' }, { type: 'drag-enter' });
  assert.deepEqual(next, { step: 'drag-over' });
});

test('drag-leave desde drag-over vuelve a idle', () => {
  const next = uploadFlowReducer({ step: 'drag-over' }, { type: 'drag-leave' });
  assert.deepEqual(next, { step: 'idle' });
});

test('drag-leave desde idle no hace nada (no hay drag-over que cancelar)', () => {
  const next = uploadFlowReducer({ step: 'idle' }, { type: 'drag-leave' });
  assert.deepEqual(next, { step: 'idle' });
});

test('drag-enter mientras processing NO interrumpe la extracción en curso', () => {
  const next = uploadFlowReducer({ step: 'processing' }, { type: 'drag-enter' });
  assert.deepEqual(next, { step: 'processing' });
});

test('drag-enter mientras preview NO pisa un archivo ya confirmado como válido', () => {
  const icon = { id: 'upload-1' } as IconAsset;
  const next = uploadFlowReducer({ step: 'preview', icon }, { type: 'drag-enter' });
  assert.deepEqual(next, { step: 'preview', icon });
});

test('drag-enter mientras error SÍ permite reintentar arrastrando un nuevo archivo', () => {
  const next = uploadFlowReducer({ step: 'error', message: 'x' }, { type: 'drag-enter' });
  assert.deepEqual(next, { step: 'drag-over' });
});

test('validation-failed lleva a error con el mensaje dado (validación previa a leer el contenido)', () => {
  const next = uploadFlowReducer({ step: 'idle' }, { type: 'validation-failed', message: 'El archivo debe ser SVG.' });
  assert.deepEqual(next, { step: 'error', message: 'El archivo debe ser SVG.' });
});

test('processing-started lleva a processing desde cualquier estado previo razonable', () => {
  assert.deepEqual(uploadFlowReducer({ step: 'idle' }, { type: 'processing-started' }), { step: 'processing' });
  assert.deepEqual(uploadFlowReducer({ step: 'drag-over' }, { type: 'processing-started' }), { step: 'processing' });
  assert.deepEqual(uploadFlowReducer({ step: 'error', message: 'x' }, { type: 'processing-started' }), { step: 'processing' });
});

test('extraction-failed lleva a error con el mensaje ya amigable del extractor', () => {
  const next = uploadFlowReducer({ step: 'processing' }, { type: 'extraction-failed', message: 'El SVG no contiene una geometría válida.' });
  assert.deepEqual(next, { step: 'error', message: 'El SVG no contiene una geometría válida.' });
});

test('extraction-succeeded lleva a preview con el IconAsset construido', () => {
  const icon = { id: 'upload-1' } as IconAsset;
  const next = uploadFlowReducer({ step: 'processing' }, { type: 'extraction-succeeded', icon });
  assert.deepEqual(next, { step: 'preview', icon });
});

test('cancel vuelve a idle desde preview, sin dejar rastro del icono', () => {
  const icon = { id: 'upload-1' } as IconAsset;
  const next = uploadFlowReducer({ step: 'preview', icon }, { type: 'cancel' });
  assert.deepEqual(next, { step: 'idle' });
});

test('cancel vuelve a idle desde error, limpiando el mensaje', () => {
  const next = uploadFlowReducer({ step: 'error', message: 'x' }, { type: 'cancel' });
  assert.deepEqual(next, { step: 'idle' });
});

// =====================================================================
// Add vs Replace
// =====================================================================

test('uploadConfirmLabel: "add" pide "Agregar ícono"', () => {
  assert.equal(uploadConfirmLabel('add'), 'Agregar ícono');
});

test('uploadConfirmLabel: "replace" pide "Reemplazar ícono"', () => {
  assert.equal(uploadConfirmLabel('replace'), 'Reemplazar ícono');
});

// =====================================================================
// Validación / construcción del IconAsset subido
// =====================================================================

test('nameFromFileName quita la extensión .svg (case-insensitive)', () => {
  assert.equal(nameFromFileName('mi-diseño.svg'), 'mi-diseño');
  assert.equal(nameFromFileName('mi-diseño.SVG'), 'mi-diseño');
});

test('nameFromFileName cae a "Mi ícono" si el nombre queda vacío', () => {
  assert.equal(nameFromFileName('.svg'), 'Mi ícono');
  assert.equal(nameFromFileName(''), 'Mi ícono');
});

test('buildUploadedIconAsset arma un IconAsset con source "upload", id con prefijo "upload-" y categoría "__uploads__"', () => {
  const asset = buildUploadedIconAsset('boca 01.svg', {
    svgPath: 'M0,0 L10,0 L10,10 Z',
    paintMode: 'fill',
    fillRule: 'evenodd',
  });
  assert.equal(asset.source, 'upload');
  assert.equal(asset.categoryId, '__uploads__');
  assert.ok(asset.id.startsWith('upload-'));
  assert.equal(asset.name, 'boca 01');
  assert.equal(asset.svgPath, 'M0,0 L10,0 L10,10 Z');
  assert.equal(asset.paintMode, 'fill');
  assert.equal(asset.fillRule, 'evenodd');
  assert.equal(asset.active, true);
  assert.equal(typeof asset.createdAt, 'string');
});

test('buildUploadedIconAsset conserva strokeWidth cuando paintMode es "stroke"', () => {
  const asset = buildUploadedIconAsset('trazo.svg', {
    svgPath: 'M0,0 L10,10',
    paintMode: 'stroke',
    fillRule: 'nonzero',
    strokeWidth: 4,
  });
  assert.equal(asset.paintMode, 'stroke');
  assert.equal(asset.strokeWidth, 4);
});

test('UPLOAD_FORMAT_HINT documenta el mismo límite que valida uploadRasterValidation.ts (Etapa 9E — el cargador público pasó de SVG a PNG/WebP, 10 MB)', () => {
  assert.equal(UPLOAD_FORMAT_HINT, 'Formato PNG o WebP · Máximo 10 MB');
});

test('nameFromFileName quita la extensión .png/.webp (Etapa 9E)', () => {
  assert.equal(nameFromFileName('mi-logo.png'), 'mi-logo');
  assert.equal(nameFromFileName('mi-logo.WEBP'), 'mi-logo');
});

// =====================================================================
// buildUploadedIconAsset — conservación de `layers` (corrección puntual:
// antes de este fix, `geometry.layers` se perdía acá y un ícono
// compuesto real (ej. "boca 02.svg") terminaba usando el `svgPath` de
// fallback en vez del Group ink/paper real — ver el informe de esta
// etapa).
// =====================================================================

test('Test A — geometría COMPUESTA: buildUploadedIconAsset conserva `layers` exactamente, en el mismo orden', () => {
  const layers = [
    { d: 'M0,0 L100,0 L100,100 L0,100 Z', role: 'ink' as const, fillRule: 'nonzero' as const },
    { d: 'M30,30 L70,30 L70,70 L30,70 Z', role: 'paper' as const, fillRule: 'evenodd' as const },
  ];
  const asset = buildUploadedIconAsset('boca 02.svg', {
    svgPath: 'M0,0 L100,0 L100,100 L0,100 Z', // fallback best-effort, no autoritativo
    paintMode: 'fill',
    fillRule: 'nonzero',
    layers,
  });
  assert.equal(asset.layers, layers, 'debe ser la MISMA referencia — nunca se reconstruye ni se copia capa por capa');
  assert.deepEqual(asset.layers, layers);
  assert.equal(asset.layers?.length, 2);
  assert.equal(asset.layers?.[0].role, 'ink');
  assert.equal(asset.layers?.[1].role, 'paper');
  assert.equal(asset.layers?.[1].fillRule, 'evenodd');
});

test('Test B — geometría SIMPLE (sin `layers`): sigue produciendo un IconAsset válido, sin agregar la propiedad', () => {
  const asset = buildUploadedIconAsset('corazon.svg', {
    svgPath: 'M0,0 L10,0 L10,10 Z',
    paintMode: 'fill',
    fillRule: 'nonzero',
  });
  assert.equal(asset.svgPath, 'M0,0 L10,0 L10,10 Z');
  assert.equal(asset.paintMode, 'fill');
  assert.equal(asset.source, 'upload');
  assert.equal(asset.layers, undefined);
  assert.ok(!('layers' in asset), 'la propiedad no debe existir en absoluto para una geometría simple — mismo comportamiento exacto que antes de esta corrección');
});

test('Test C — no mutación: buildUploadedIconAsset no modifica el objeto `geometry` recibido', () => {
  const layers = [{ d: 'M0,0 L10,0 L10,10 Z', role: 'ink' as const, fillRule: 'nonzero' as const }];
  const geometry = { svgPath: 'M0,0 L10,0 L10,10 Z', paintMode: 'fill' as const, fillRule: 'nonzero' as const, layers };
  const snapshotBefore = JSON.parse(JSON.stringify(geometry));
  buildUploadedIconAsset('x.svg', geometry);
  assert.deepEqual(geometry, snapshotBefore);
  assert.equal(geometry.layers, layers, 'el array de capas original tampoco se reemplaza por otro');
});
