/**
 * Pruebas de `normalizeIconPath.ts` — Etapa 1 del plan de biblioteca de
 * íconos. Se ejecutan con el test runner NATIVO de Node (`node --test`,
 * disponible desde Node 18+, cero dependencias) y Node soporta `.ts` de
 * forma nativa (Node 22.6+/24 con "type stripping") — no hace falta
 * Vitest/Jest/ts-node para este archivo, que además no importa NADA del
 * resto del proyecto (ver el propio `normalizeIconPath.ts`: sin imports).
 *
 * Correr: `node --test src/editor/icons/normalizeIconPath.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIconPath, normalizeIconLayers, computeBoundingBox } from './normalizeIconPath.ts';

const MARGIN = 5; // NORMALIZE_MARGIN_RATIO(0.05) * REFERENCE_VIEWBOX_SIZE(100)
const TOLERANCE = 0.01;

/** Recalcula el bounding box de un `d` YA normalizado, reusando el mismo tokenizador/absolutizador que `normalizeIconPath` (vía una segunda pasada) — para poder verificar en las pruebas dónde terminó cada punto, sin duplicar lógica de parseo acá. */
function boundingBoxOfNormalizedOutput(d: string): ReturnType<typeof computeBoundingBox> {
  // normalizeIconPath ya expone `sourceBoundingBox` del INPUT — para medir
  // el OUTPUT, lo más simple y menos redundante es normalizar el resultado
  // de vuelta: como ya está centrado/escalado, normalizarlo otra vez debe
  // dar el mismo bounding box relativo (mismo centro, misma proporción),
  // así que `sourceBoundingBox` de esa segunda pasada mide el OUTPUT real
  // de la primera.
  return normalizeIconPath(d).sourceBoundingBox;
}

test('Caso A — un path simple se normaliza correctamente (sin tirar, produce un `d` válido)', () => {
  const result = normalizeIconPath('M0,0 L100,0 L100,100 L0,100 Z');
  assert.equal(typeof result.d, 'string');
  assert.ok(result.d.length > 0);
  assert.ok(result.d.startsWith('M'));
  assert.deepEqual(result.sourceBoundingBox, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
});

test('Caso A (bis) — expone el factor de escala uniforme aplicado (campo aditivo de la Etapa 4)', () => {
  // Cuadrado de 100x100 -> DRAWABLE_SIZE (90, con el margen de 5% por lado)
  // / 100 = 0.9 exacto — valor conocido, no solo "un número cualquiera".
  const result = normalizeIconPath('M0,0 L100,0 L100,100 L0,100 Z');
  assert.equal(result.scale, 0.9);

  // Un cuadrado más chico debe escalarse MÁS (factor mayor) para llegar al
  // mismo tamaño de referencia — la relación debe ser inversamente
  // proporcional al tamaño original, no un valor fijo.
  const smaller = normalizeIconPath('M0,0 L10,0 L10,10 L0,10 Z');
  assert.ok(smaller.scale > result.scale, 'un path más chico debe requerir un factor de escala mayor');
});

test('Caso B — un path con coordenadas desplazadas (lejos del origen) se centra correctamente', () => {
  // Mismo cuadrado 40x40 que el de referencia, pero movido +1000,+2000.
  const reference = normalizeIconPath('M0,0 L40,0 L40,40 L0,40 Z');
  const offset = normalizeIconPath('M1000,2000 L1040,2000 L1040,2040 L1000,2040 Z');
  assert.equal(offset.d, reference.d, 'un cuadrado igual, solo desplazado, debe normalizarse EXACTAMENTE igual que el original sin desplazar');
});

test('Caso C — un path con proporciones rectangulares se escala manteniendo el aspect ratio (no se deforma a cuadrado)', () => {
  // Rectángulo 200 de ancho x 50 de alto (ratio 4:1).
  const result = normalizeIconPath('M0,0 L200,0 L200,50 L0,50 Z');
  const outputBox = boundingBoxOfNormalizedOutput(result.d);
  const outWidth = outputBox.maxX - outputBox.minX;
  const outHeight = outputBox.maxY - outputBox.minY;
  assert.ok(Math.abs(outWidth / outHeight - 4) < 0.05, `esperaba una proporción ~4:1, dio ${outWidth}/${outHeight}`);
  // El eje más largo (ancho) debe llegar al tamaño dibujable completo (90 = 100 - 2*margen de 5).
  assert.ok(Math.abs(outWidth - (100 - 2 * MARGIN)) < TOLERANCE, `el ancho normalizado debería ocupar el área dibujable completa, dio ${outWidth}`);
});

test('Caso D — el resultado respeta la convención de viewBox `0 0 100 100`', () => {
  const shapes = [
    'M0,0 L100,0 L100,100 L0,100 Z',
    'M1000,2000 L1040,2000 L1040,2040 L1000,2040 Z',
    'M0,0 L200,0 L200,50 L0,50 Z',
    'M50,88 C20,65 5,45 5,28 C5,12 18,2 32,2 Z', // recorte real de la biblioteca actual (heart)
  ];
  for (const d of shapes) {
    const result = normalizeIconPath(d);
    const box = boundingBoxOfNormalizedOutput(result.d);
    assert.ok(box.minX >= -TOLERANCE && box.minX <= 100 + TOLERANCE, `minX fuera de rango: ${box.minX}`);
    assert.ok(box.maxX >= -TOLERANCE && box.maxX <= 100 + TOLERANCE, `maxX fuera de rango: ${box.maxX}`);
    assert.ok(box.minY >= -TOLERANCE && box.minY <= 100 + TOLERANCE, `minY fuera de rango: ${box.minY}`);
    assert.ok(box.maxY >= -TOLERANCE && box.maxY <= 100 + TOLERANCE, `maxY fuera de rango: ${box.maxY}`);
  }
});

test('Caso E — el mismo path normalizado siempre produce el mismo resultado (determinismo)', () => {
  const d = 'M12.5,7 C40,-3 60,90 3.2,44 L10,10 Z';
  const first = normalizeIconPath(d);
  const second = normalizeIconPath(d);
  const third = normalizeIconPath(d);
  assert.equal(first.d, second.d);
  assert.equal(second.d, third.d);
  assert.deepEqual(first.sourceBoundingBox, second.sourceBoundingBox);
});

test('soporta comandos relativos (m/l/c/h/v) convirtiéndolos a absolutos', () => {
  const absolute = normalizeIconPath('M0,0 L100,0 L100,100 L0,100 Z');
  const relative = normalizeIconPath('m0,0 l100,0 l0,100 l-100,0 z');
  assert.equal(relative.d, absolute.d);
});

test('soporta H/V (líneas horizontales/verticales)', () => {
  const viaHV = normalizeIconPath('M0,0 H100 V100 H0 Z');
  const viaL = normalizeIconPath('M0,0 L100,0 L100,100 L0,100 Z');
  assert.equal(viaHV.d, viaL.d);
});

test('soporta S/T (reflejo de punto de control) sin tirar y produce un resultado válido', () => {
  const result = normalizeIconPath('M10,10 C20,0 40,0 50,10 S80,20 90,10 T100,10');
  assert.ok(result.d.length > 0);
});

test('soporta múltiples subpaths (M...Z M...Z), como varios íconos reales de la biblioteca actual', () => {
  // Recorte real de "leaf" (iconLibrary.ts): una figura + una línea aparte.
  const result = normalizeIconPath('M50,10 C75,25 85,55 50,90 C15,55 25,25 50,10 Z M50,22 L50,78');
  const occurrences = result.d.split('M').length - 1;
  assert.equal(occurrences, 2, 'debe conservar los 2 subpaths (2 comandos M) del original');
});

test('soporta arcos (A), como "mate" y "sun" de la biblioteca actual, sin tirar', () => {
  const result = normalizeIconPath('M65,50 A15,15 0 1,1 35,50 A15,15 0 1,1 65,50');
  assert.ok(result.d.includes('A'));
});

test('tira Error ante un path vacío', () => {
  assert.throws(() => normalizeIconPath(''), /vacío/);
});

test('tira Error ante un string sin ningún comando de path reconocible', () => {
  // "bird" a propósito: ninguna de sus letras (b,i,r,d) es un comando de
  // path SVG válido (M/L/H/V/C/S/Q/T/A/Z) — a diferencia de, por ejemplo,
  // "hola mundo", que SÍ contiene "h" y "m", dos comandos reales.
  assert.throws(() => normalizeIconPath('bird 456 !!!'), /no se encontró/);
});

test('tira Error ante un path degenerado (un único punto, sin ancho ni alto)', () => {
  assert.throws(() => normalizeIconPath('M50,50 Z'), /extensión/);
});

test('M seguido de varios pares de coordenadas: solo el PRIMERO es moveto, el resto son linetos implícitos (spec de SVG)', () => {
  // Bug encontrado en la Etapa 8E al diagnosticar por qué ciertas capas de
  // "boca 02.svg" no pintaban nada: un pentágono escrito como
  // "M0,0 10,0 10,10 0,10" (forma MUY común en exportaciones de Inkscape:
  // un solo "M" seguido de varios pares sueltos) se estaba interpretando
  // como 4 "M" independientes -> 4 subpaths de un solo punto cada uno,
  // sin ningún segmento que los conecte -> área rellena CERO. La forma
  // correcta (un solo "M" + 3 "L" implícitos) es un cuadrado normal de
  // 10x10, con área real.
  const shorthand = normalizeIconPath('M0,0 10,0 10,10 0,10 Z');
  const explicit = normalizeIconPath('M0,0 L10,0 L10,10 L0,10 Z');
  assert.equal(shorthand.d, explicit.d, 'la forma abreviada debe dar EXACTAMENTE el mismo resultado que la forma explícita con L');
  // Evidencia adicional, independiente de la comparación anterior: el
  // resultado tiene que tener área real (bbox con ancho Y alto > 0) — si
  // el bug siguiera presente, cada punto sería su propio subpath
  // degenerado y `normalizeIconPath` tiraría "no tiene extensión".
  assert.ok(shorthand.sourceBoundingBox.maxX - shorthand.sourceBoundingBox.minX > 0);
  assert.ok(shorthand.sourceBoundingBox.maxY - shorthand.sourceBoundingBox.minY > 0);
});

test('m (relativo) seguido de varios pares de coordenadas: mismo criterio, en relativo', () => {
  const shorthand = normalizeIconPath('m0,0 10,0 0,10 -10,0 Z');
  const explicit = normalizeIconPath('m0,0 l10,0 l0,10 l-10,0 Z');
  assert.equal(shorthand.d, explicit.d);
});

test('un solo par de coordenadas después de M sigue siendo un moveto normal (no se rompe el caso simple)', () => {
  const result = normalizeIconPath('M0,0 L10,0 L10,10 L0,10 Z');
  assert.doesNotThrow(() => normalizeIconPath('M0,0 L10,0 L10,10 L0,10 Z'));
  assert.ok(result.d.startsWith('M'));
});

test('tira Error ante una cantidad de parámetros inválida para un comando', () => {
  assert.throws(() => normalizeIconPath('M10,10 L20'), /par.metros inválida/);
});

// =====================================================================
// normalizeIconLayers — Etapa 8E (SVG compuesto: varias capas que deben
// quedar alineadas entre sí, nunca centradas cada una en su propio bbox).
// =====================================================================

test('normalizeIconLayers: bbox global — se calcula sobre la UNIÓN de todas las capas, no por separado', () => {
  // Dos cuadrados de 10x10 separados 90 unidades entre sí: el bbox
  // combinado es 100 de ancho x 10 de alto, MUY distinto del bbox de
  // cualquiera de los dos cuadrados por separado (10x10).
  const result = normalizeIconLayers(['M0,0 L10,0 L10,10 L0,10 Z', 'M90,0 L100,0 L100,10 L90,10 Z']);
  assert.equal(result.sourceBoundingBox.minX, 0);
  assert.equal(result.sourceBoundingBox.maxX, 100);
  assert.equal(result.sourceBoundingBox.minY, 0);
  assert.equal(result.sourceBoundingBox.maxY, 10);
});

test('normalizeIconLayers: escala global — la MISMA escala se aplica a todas las capas (no una por capa)', () => {
  const result = normalizeIconLayers(['M0,0 L10,0 L10,10 L0,10 Z', 'M90,0 L100,0 L100,10 L90,10 Z']);
  // El bbox combinado (100x10) es mucho más ancho que alto -> la escala la
  // decide el ancho (eje más largo), igual que normalizeIconPath.
  const expectedScale = 90 / 100; // DRAWABLE_SIZE(90) / max(100,10)
  assert.ok(Math.abs(result.scale - expectedScale) < 1e-9);
});

test('normalizeIconLayers: centrado global — el resultado tiene exactamente una capa por `d` de entrada, en el mismo orden', () => {
  const result = normalizeIconLayers(['M0,0 L10,0 L10,10 L0,10 Z', 'M90,0 L100,0 L100,10 L90,10 Z']);
  assert.equal(result.layerPathDs.length, 2);
  assert.ok(result.layerPathDs[0].startsWith('M'));
  assert.ok(result.layerPathDs[1].startsWith('M'));
});

test('normalizeIconLayers: dos capas separadas por 80 unidades en el original siguen separadas EN LA MISMA proporción tras normalizar', () => {
  // Reconstruye el bbox de cada `d` normalizado por separado (cada uno ya
  // es un `d` de SVG válido y autocontenido) para verificar la distancia
  // relativa entre ambos, sin duplicar el parser: se reusa
  // `normalizeIconPath` sobre CADA `d` de salida solo para medirlo (mismo
  // truco que "Caso A" más arriba en este archivo).
  const result = normalizeIconLayers(['M0,0 L10,0 L10,10 L0,10 Z', 'M90,0 L100,0 L100,10 L90,10 Z']);
  const [dA, dB] = result.layerPathDs;
  const bboxA = normalizeIconPath(dA).sourceBoundingBox; // sourceBoundingBox acá es el bbox de dA, no re-normaliza posición absoluta relativa a dB
  const bboxB = normalizeIconPath(dB).sourceBoundingBox;
  // Ambos cuadrados siguen midiendo 10x10 tras la normalización compartida
  // (ninguno se deformó ni se escaló distinto del otro).
  assert.ok(Math.abs((bboxA.maxX - bboxA.minX) - (bboxB.maxX - bboxB.minX)) < 1e-6);
  // Y la posición ABSOLUTA de cada una es la esperada matemáticamente:
  // centro del bbox combinado = 50, escala = 0.9, targetCenter = 50 ->
  // transformPoint(x) = (x-50)*0.9+50. Capa A (minX original 0) -> 5.
  // Capa B (minX original 90) -> 86. Si se hubiera normalizado cada capa
  // POR SEPARADO (el bug que esto evita), las dos habrían quedado
  // centradas en el mismo punto en vez de conservar esta separación.
  assert.ok(Math.abs(bboxA.minX - 5) < 1e-6, `esperaba minX≈5, dio ${bboxA.minX}`);
  assert.ok(Math.abs(bboxB.minX - 86) < 1e-6, `esperaba minX≈86, dio ${bboxB.minX}`);
});

test('normalizeIconLayers: una sola capa produce el MISMO resultado que normalizeIconPath', () => {
  const d = 'M0,0 L100,0 L100,100 L0,100 Z';
  const single = normalizeIconPath(d);
  const layered = normalizeIconLayers([d]);
  assert.equal(layered.layerPathDs.length, 1);
  assert.equal(layered.layerPathDs[0], single.d);
  assert.equal(layered.scale, single.scale);
});

test('normalizeIconLayers: tira Error si no se le pasa ninguna capa', () => {
  assert.throws(() => normalizeIconLayers([]), /ninguna capa/);
});

test('normalizeIconLayers: propaga el Error de una capa individual inválida (mismo criterio que normalizeIconPath)', () => {
  assert.throws(() => normalizeIconLayers(['M0,0 L10,0 L10,10 Z', 'bird 456 !!!']), /no se encontró/);
});
