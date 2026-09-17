/**
 * Tests de la parte PURA de `textOutlineExport.ts` —
 * `parseVectortracerSvgToAbsoluteShapes` — Etapa 11. Fixtures fieles al
 * formato REAL que devuelve `vectortracer` (mismos fixtures ya verificados
 * contra la salida real del motor en la Etapa 9D.2/9F, ver
 * `rasterIconExtractor.test.ts`).
 *
 * `extractTextOutlineShapes` (el punto de entrada real, que renderiza un
 * `IText` a un `<canvas>` y llama al motor WASM) es BROWSER-ONLY — no es
 * testeable con `node --test` (necesita medir/dibujar texto con un
 * contexto 2D real) — se verifica a mano en Chrome, ver el informe de esta
 * etapa y `scratchpad/text-outline-poc/`.
 *
 * Correr: `node --test src/editor/export/textOutlineExport.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVectortracerSvgToAbsoluteShapes,
  computeTextRenderPadding,
  TEXT_INK_COLOR_DISTANCE_THRESHOLD,
  TEXT_RENDER_SUPERSAMPLE,
  MAX_TEXT_RENDER_DIMENSION_PX,
} from './textOutlineExport.ts';
import { RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD } from '../icons/rasterIconExtractor.ts';
import { GLYPH_HEIGHT_RATIO, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../canvas/curvedText.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';
import type { Matrix } from '../icons/svgTransform.ts';

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const SIMPLE_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;" >
        <g transform="scale(1)">
        <path
            d="M0 0 L20 0 L20 20 L0 20 Z "
            transform="translate(10,10)"
            fill="#000000"
        />
        </g>
    </svg>
`;

const HOLE_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;" >
        <g transform="scale(1)">
        <path
            d="M0,0 L24,0 L24,24 L0,24 Z M6,18 L18,18 L18,6 L6,6 Z "
            transform="translate(8,8)"
            fill="#000000"
        />
        </g>
    </svg>
`;

const TWO_REGIONS_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;" >
        <g transform="scale(1)">
        <path d="M0,0 L10,0 L10,10 L0,10 Z " transform="translate(4,4)" fill="#000000" />
        <path d="M0,0 L4,0 L4,4 L0,4 Z " transform="translate(20,4)" fill="#000000" />
        </g>
    </svg>
`;

const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale(1)"></g></svg>`;

test('parseVectortracerSvgToAbsoluteShapes: con matriz identidad, produce coordenadas en el mismo espacio del SVG de entrada', () => {
  const shapes = parseVectortracerSvgToAbsoluteShapes(SIMPLE_SVG, IDENTITY);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].fillRule, 'nonzero');
  // translate(10,10) + el propio d (0,0 a 20,20 local) -> el punto M inicial debe caer en (10,10) absoluto.
  assert.ok(shapes[0].d.startsWith('M10,10'));
});

test('parseVectortracerSvgToAbsoluteShapes: aplica correctamente una matriz de "vuelta al canvas real" (escala + offset)', () => {
  // Simula el `backToCanvasMatrix` real: dividir por supersample=8 y sumar un origen (100, 200).
  const backToCanvas: Matrix = [1 / 8, 0, 0, 1 / 8, 100, 200];
  const shapes = parseVectortracerSvgToAbsoluteShapes(SIMPLE_SVG, backToCanvas);
  // Punto M raw = (10,10) -> /8 = (1.25, 1.25) -> +100,+200 = (101.25, 201.25).
  assert.ok(shapes[0].d.startsWith('M101.25,201.25'));
});

test('parseVectortracerSvgToAbsoluteShapes: conserva el agujero (2 subpaths, bobinado opuesto) a través de la transformación', () => {
  const shapes = parseVectortracerSvgToAbsoluteShapes(HOLE_SVG, IDENTITY);
  assert.equal(shapes.length, 1);
  const subpathCount = (shapes[0].d.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'exterior + agujero deben sobrevivir como 2 subpaths');
});

test('parseVectortracerSvgToAbsoluteShapes: combina regiones desconectadas (ej. el punto de una "i") en un único d', () => {
  const shapes = parseVectortracerSvgToAbsoluteShapes(TWO_REGIONS_SVG, IDENTITY);
  assert.equal(shapes.length, 1, 'una sola shape combinada, no dos separadas');
  const subpathCount = (shapes[0].d.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2);
});

test('parseVectortracerSvgToAbsoluteShapes: SVG sin ningún <path> -> array vacío (nunca tira, el caller decide el fallback)', () => {
  const shapes = parseVectortracerSvgToAbsoluteShapes(EMPTY_SVG, IDENTITY);
  assert.deepEqual(shapes, []);
});

test('parseVectortracerSvgToAbsoluteShapes: nunca normaliza a un viewBox 0-100 — las coordenadas quedan en el espacio real recibido', () => {
  // A diferencia de `vectortracerSvgToIconGeometry` (rasterIconExtractor.ts),
  // que SIEMPRE reescala a 0-100: acá, con una matriz que representa una
  // posición real grande del canvas (ej. 500,500), el resultado debe
  // reflejar esas coordenadas grandes tal cual, no reescaladas a un rango chico.
  const backToCanvas: Matrix = [1 / 8, 0, 0, 1 / 8, 500, 500];
  const shapes = parseVectortracerSvgToAbsoluteShapes(SIMPLE_SVG, backToCanvas);
  const numbers = (shapes[0].d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  assert.ok(numbers.some((n) => n > 400), 'las coordenadas deben reflejar la posición real del canvas, no un viewBox normalizado');
});

/**
 * Tests de `computeTextRenderPadding` — regresión del bug del "corte
 * horizontal" detectado en la inspección visual de la Etapa 11: para texto
 * SOBRE UN ARCO (`path` asignado), `textObj.getBoundingRect()` devuelve el
 * bounding box de la GEOMETRÍA DEL ARCO (casi un círculo completo), no el de
 * la tinta real — cuando el texto cae en uno de los 4 puntos cardinales del
 * círculo (ej. el offset por defecto, arriba de todo — el caso de CADA
 * tarjeta de `scratchpad/text-outline-poc/`), ese punto coincide EXACTO con
 * el borde del bbox, así que sin margen la mitad del cuerpo de cada letra
 * queda fuera del canvas de render y se recorta.
 *
 * El bug (y el fix) son puramente geométricos — dependen únicamente de
 * `fontSize`, nunca del contenido del texto ni de la tipografía: por eso
 * estos tests cubren el RANGO real de tamaños de fuente que puede llegar
 * acá (`MIN_FONT_SIZE`..`MAX_FONT_SIZE`, ver `curvedText.ts`) en vez de
 * casos por nombre de fuente — un texto corto tipo "MATESHOP" en Anton, uno
 * con contraformas tipo "BORA", uno invertido (`pathSide: 'right'`) o uno en
 * una tipografía de guión (Sacramento, Alex Brush, Caveat, Dancing Script)
 * terminan, todos, en algún `fontSize` dentro de ese mismo rango — el
 * `pathSide`/la curva/la fuente eligen QUÉ letra se dibuja y dónde, nunca
 * cuánto margen hace falta alrededor del render para no recortarla.
 * (`extractTextOutlineShapes` en sí sigue sin ser testeable acá — necesita
 * `document` real, ver el comentario grande del archivo — la verificación
 * visual de esos 5 casos concretos vive en `scratchpad/text-outline-poc/`.)
 */
test('computeTextRenderPadding: el margen siempre supera el alcance máximo teórico del cuerpo de una letra (fontSize * GLYPH_HEIGHT_RATIO), en todo el rango real de tamaños', () => {
  for (const fontSize of [MIN_FONT_SIZE, 20, 24, 28, 35, MAX_FONT_SIZE]) {
    const padding = computeTextRenderPadding(fontSize);
    const maxTheoreticalReach = fontSize * GLYPH_HEIGHT_RATIO;
    assert.ok(
      padding > maxTheoreticalReach,
      `a fontSize=${fontSize}, el margen (${padding}) debe superar el alcance máximo teórico (${maxTheoreticalReach}) para no recortar la letra`,
    );
  }
});

test('computeTextRenderPadding: crece linealmente con fontSize (nunca un valor fijo que alcance para textos chicos pero no para grandes)', () => {
  const paddingAtMin = computeTextRenderPadding(MIN_FONT_SIZE);
  const paddingAtMax = computeTextRenderPadding(MAX_FONT_SIZE);
  assert.ok(paddingAtMax > paddingAtMin, 'un texto grande necesita más margen absoluto que uno chico');
  assert.equal(computeTextRenderPadding(MAX_FONT_SIZE) / MAX_FONT_SIZE, computeTextRenderPadding(MIN_FONT_SIZE) / MIN_FONT_SIZE, 'la proporción margen/fontSize es constante (misma fórmula para cualquier tamaño)');
});

/**
 * Tests de regresión de la Etapa 12C (investigación de fidelidad visual del
 * texto convertido a curvas — ver el informe: "texto más grueso e
 * irregular que el original").
 */

test('TEXT_INK_COLOR_DISTANCE_THRESHOLD: corresponde a ~50% de cobertura de tinta, NUNCA al umbral de íconos (RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD, ~16%, pensado para PNG/WebP subidos)', () => {
  // Regresión directa de la causa raíz medida en la Etapa 12C: el umbral de
  // íconos (60) hacía que CUALQUIER píxel con apenas ~16% de cobertura de
  // tinta ya contara como tinta completa — corriendo el borde binarizado
  // bien hacia afuera del borde real (~50%) y engrosando sistemáticamente
  // cada letra. Este test falla si algún día se vuelve a igualar
  // accidentalmente el umbral de texto al de íconos.
  assert.notEqual(TEXT_INK_COLOR_DISTANCE_THRESHOLD, RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD);
  assert.ok(
    TEXT_INK_COLOR_DISTANCE_THRESHOLD > RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD * 2,
    'el umbral de texto (~50% de cobertura) debe ser sustancialmente mayor que el de íconos (~16%) — si baja demasiado, vuelve el engrosamiento medido en la Etapa 12C',
  );
  // Distancia blanco↔#222222 ≈ 382.7 (hypot(221,221,221)) — el umbral debe
  // rondar la mitad de esa distancia (±2, tolerancia de redondeo).
  const inkWhiteDistance = Math.hypot(255 - 0x22, 255 - 0x22, 255 - 0x22);
  assert.ok(Math.abs(TEXT_INK_COLOR_DISTANCE_THRESHOLD - inkWhiteDistance * 0.5) < 1e-6);
});

test('MAX_TEXT_RENDER_DIMENSION_PX: alcanza para que un texto curvo REAL (radio/config actuales de la virola) logre el supersample NOMINAL completo, sin que el cap lo recorte en silencio', () => {
  // Regresión directa del segundo hallazgo de la Etapa 12C: con el cap
  // anterior (3000), CUALQUIER texto curvo en la posición por defecto
  // terminaba con un supersample EFECTIVO de 6, nunca los 8 nominales,
  // porque el bounding box con margen de un texto curvo (dominado por el
  // diámetro del arco, no por el contenido) ya ronda 420-500px — ×8 eso
  // supera 3000 siempre, no solo en casos extremos. Este test reproduce esa
  // cuenta con los números reales de `VIROLA_CONFIG` (sin necesitar
  // `document`/medir texto de verdad: el diámetro del arco no depende del
  // contenido) para varios tamaños de fuente, y falla si el cap alguna vez
  // vuelve a quedar por debajo de lo que hace falta.
  const radius = VIROLA_CONFIG.textCurveRadius;
  // El bounding box del arco es ~el diámetro completo (ver el informe de la
  // Etapa 11: `getBoundingRect()` de un texto con `path` iguala el bbox del
  // PATH, no el de la tinta) — se aproxima acá sin construir un `Path` real.
  const approxArcBbox = radius * 2;
  for (const fontSize of [MIN_FONT_SIZE, 24, 28, MAX_FONT_SIZE]) {
    const padding = computeTextRenderPadding(fontSize);
    const paddedBbox = approxArcBbox + padding * 2;
    const largestAtNominalSupersample = paddedBbox * TEXT_RENDER_SUPERSAMPLE;
    assert.ok(
      largestAtNominalSupersample <= MAX_TEXT_RENDER_DIMENSION_PX,
      `a fontSize=${fontSize}, el bbox con margen (${paddedBbox.toFixed(0)}px) × supersample nominal (${TEXT_RENDER_SUPERSAMPLE}) = ${largestAtNominalSupersample.toFixed(0)}px supera el cap (${MAX_TEXT_RENDER_DIMENSION_PX}) — el supersample efectivo quedaría recortado por debajo del nominal, como en el bug medido en la Etapa 12C`,
    );
  }
});
