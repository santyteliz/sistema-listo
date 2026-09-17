/**
 * Tests de las partes PURAS de `rasterIconExtractor.ts` — Etapa 9E:
 * `binarizeRasterPixels`, `checkRasterDimensionLimits` y
 * `vectortracerSvgToIconGeometry`. Ninguna de las tres toca un API de
 * navegador (`createImageBitmap`/`OffscreenCanvas`/el motor WASM de
 * `vectortracer` en sí) — por eso corren con `node --test` puro, sin
 * jsdom ni ningún mock de navegador.
 *
 * Lo que NO se testea acá (a propósito, ver el informe de esta etapa):
 * `decodeRasterImage` (necesita `createImageBitmap`/`OffscreenCanvas`
 * reales — se verifica a mano en Chrome, mismo criterio ya usado para la
 * parte de `svgIconExtractor.ts` que usa `DOMParser`) y `vectorizeBinaryPixels`
 * (necesita el import dinámico real de `vectortracer`, que en Node solo
 * funciona instanciando el WASM a mano — ver
 * `rasterIconExtractor.integration.test.ts`, que sí ejercita el motor real).
 *
 * Correr: `node --test src/editor/icons/rasterIconExtractor.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  binarizeRasterPixels,
  detectRasterBackground,
  checkRasterDimensionLimits,
  vectortracerSvgToIconGeometry,
  MAX_RASTER_DIMENSION_PX,
  MAX_RASTER_PIXELS,
  type RasterPixelData,
} from './rasterIconExtractor.ts';

// =====================================================================
// binarizeRasterPixels
// =====================================================================

function makeRaw(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): RasterPixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { data, width, height };
}

function pixelAt(raw: RasterPixelData, x: number, y: number): [number, number, number, number] {
  const i = (y * raw.width + x) * 4;
  return [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
}

// Fixture con margen real (Etapa 9E.1): a diferencia de un toggle de 1-2
// píxeles, `binarizeRasterPixels` ahora detecta el fondo mirando el
// PERÍMETRO de la imagen (ver `detectRasterBackground`) — un fixture donde
// el "diseño" toca directamente el borde no representa un caso realista
// (ningún logo/ícono real está pegado al borde) y confunde esa detección a
// propósito. Estos fixtures dejan margen real, como cualquier diseño real.
function makeCenteredDesign(size: number, marginPx: number, background: [number, number, number, number], foreground: [number, number, number, number]): RasterPixelData {
  return makeRaw(size, size, (x, y) => {
    const isDesign = x >= marginPx && x < size - marginPx && y >= marginPx && y < size - marginPx;
    return isDesign ? foreground : background;
  });
}

test('binarizeRasterPixels: diseño negro centrado sobre fondo transparente -> negro opaco (diseño) / blanco opaco (fondo)', () => {
  // El fondo transparente tiene RGB negro A PROPÓSITO (mismo hallazgo
  // crítico de la Etapa 9D.1: si esta función ignorara el alfa, fondo y
  // diseño serían indistinguibles por color — acá deben terminar
  // clasificados de forma opuesta).
  const raw = makeCenteredDesign(10, 3, [0, 0, 0, 0], [0, 0, 0, 255]);
  const result = binarizeRasterPixels(raw);
  assert.deepEqual(pixelAt(result, 5, 5), [0, 0, 0, 255], 'centro (diseño) debe ser tinta');
  assert.deepEqual(pixelAt(result, 0, 0), [255, 255, 255, 255], 'borde (transparente, aunque su RGB sea negro) debe ser fondo');
});

test('binarizeRasterPixels: imagen completamente blanca (sin ningún diseño) no inventa tinta de la nada', () => {
  const raw = makeRaw(6, 6, () => [255, 255, 255, 255]);
  const result = binarizeRasterPixels(raw);
  assert.deepEqual(pixelAt(result, 3, 3), [255, 255, 255, 255]);
});

test('binarizeRasterPixels: acepta un `background` ya detectado vía opciones, sin recalcularlo', () => {
  const raw = makeCenteredDesign(10, 3, [255, 0, 0, 255], [255, 255, 255, 255]); // fondo rojo, diseño blanco
  const background = { isTransparent: false as const, color: { r: 255, g: 0, b: 0 } };
  const result = binarizeRasterPixels(raw, { background });
  assert.deepEqual(pixelAt(result, 5, 5), [0, 0, 0, 255], 'diseño blanco -> tinta');
  assert.deepEqual(pixelAt(result, 0, 0), [255, 255, 255, 255], 'fondo rojo -> fondo');
});

test('binarizeRasterPixels: `backgroundColorDistanceThreshold` es ajustable', () => {
  // Un tono apenas distinto del fondo (distancia chica) — con el umbral por
  // defecto (60) cae del lado del fondo; con un umbral más estricto (5),
  // la misma distancia ya cuenta como diseño.
  const raw = makeCenteredDesign(10, 3, [255, 255, 255, 255], [235, 235, 235, 255]); // distancia ≈ 34.6
  const permissive = binarizeRasterPixels(raw, { backgroundColorDistanceThreshold: 60 });
  const strict = binarizeRasterPixels(raw, { backgroundColorDistanceThreshold: 5 });
  assert.deepEqual(pixelAt(permissive, 5, 5), [255, 255, 255, 255], 'con umbral permisivo, sigue siendo fondo');
  assert.deepEqual(pixelAt(strict, 5, 5), [0, 0, 0, 255], 'con umbral estricto, la misma distancia ya es diseño');
});

test('binarizeRasterPixels: salida siempre completamente opaca (alfa 255), incluso para píxeles de fondo', () => {
  const raw = makeCenteredDesign(10, 3, [0, 0, 0, 0], [0, 0, 0, 255]);
  const result = binarizeRasterPixels(raw);
  assert.equal(pixelAt(result, 5, 5)[3], 255);
  assert.equal(pixelAt(result, 0, 0)[3], 255);
});

// =====================================================================
// detectRasterBackground
// =====================================================================

test('detectRasterBackground: perímetro totalmente transparente -> isTransparent: true', () => {
  const raw = makeCenteredDesign(10, 3, [0, 0, 0, 0], [0, 0, 0, 255]);
  const background = detectRasterBackground(raw);
  assert.equal(background.isTransparent, true);
  assert.equal(background.color, null);
});

test('detectRasterBackground: detecta el color de fondo real, no asume blanco/negro', () => {
  const raw = makeCenteredDesign(10, 3, [200, 30, 30, 255], [255, 255, 255, 255]); // fondo rojo
  const background = detectRasterBackground(raw);
  assert.equal(background.isTransparent, false);
  assert.ok(!background.isTransparent && Math.abs(background.color.r - 200) < 1);
  assert.ok(!background.isTransparent && Math.abs(background.color.g - 30) < 1);
  assert.ok(!background.isTransparent && Math.abs(background.color.b - 30) < 1);
});

// =====================================================================
// checkRasterDimensionLimits
// =====================================================================

test('checkRasterDimensionLimits: dimensiones normales OK', () => {
  assert.deepEqual(checkRasterDimensionLimits(500, 500), { ok: true });
});

test('checkRasterDimensionLimits: justo en el límite (2000x2000) OK', () => {
  assert.deepEqual(checkRasterDimensionLimits(MAX_RASTER_DIMENSION_PX, MAX_RASTER_DIMENSION_PX), { ok: true });
});

test('checkRasterDimensionLimits: ancho por encima del máximo se rechaza ANTES de vectorizar', () => {
  const result = checkRasterDimensionLimits(MAX_RASTER_DIMENSION_PX + 1, 500);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes('grande'));
});

test('checkRasterDimensionLimits: alto por encima del máximo se rechaza', () => {
  const result = checkRasterDimensionLimits(500, MAX_RASTER_DIMENSION_PX + 1);
  assert.equal(result.ok, false);
});

test('checkRasterDimensionLimits: exactamente en el techo de píxeles totales (2000×2000 = 4.000.000) sigue OK', () => {
  // Nota: con los valores actuales, 2000×2000 = MAX_RASTER_PIXELS exacto —
  // matemáticamente no existe ningún par (ancho, alto) con los dos por
  // debajo de MAX_RASTER_DIMENSION_PX cuyo producto supere MAX_RASTER_PIXELS
  // (el máximo producto posible con ambos ≤ 2000 es, precisamente, 4.000.000).
  // El chequeo de píxeles totales queda como defensa adicional para el día
  // que estas dos constantes se ajusten por separado — se verifica que su
  // lógica es correcta igual, con el propio límite exacto.
  assert.equal(MAX_RASTER_DIMENSION_PX * MAX_RASTER_DIMENSION_PX, MAX_RASTER_PIXELS);
  assert.deepEqual(checkRasterDimensionLimits(2000, 2000), { ok: true });
});

// =====================================================================
// vectortracerSvgToIconGeometry — fixtures fieles al formato REAL que
// devuelve `vectortracer` (verificado contra la salida real del motor en
// la Etapa 9D.1/9D.2, no inventado).
// =====================================================================

const SIMPLE_SQUARE_SVG = `
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

// Rectángulo con agujero: UN SOLO <path>, dos subpaths con bobinado
// opuesto (exterior CCW, agujero CW) — así es como `vectortracer` codifica
// un agujero en la práctica (confirmado con shoelace en la Etapa 9D.1).
const RECTANGLE_WITH_HOLE_SVG = `
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

// Dos regiones desconectadas: DOS <path> separados (así es como
// `vectortracer` las representa — confirmado en la Etapa 9D.1, no las funde
// en subpaths de un mismo path).
const TWO_DISCONNECTED_REGIONS_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;" >
        <g transform="scale(1)">
        <path
            d="M0,0 L10,0 L10,10 L0,10 Z "
            transform="translate(4,4)"
            fill="#000000"
        />
        <path
            d="M0,0 L10,0 L10,10 L0,10 Z "
            transform="translate(44,4)"
            fill="#000000"
        />
        </g>
    </svg>
`;

const EMPTY_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;" >
        <g transform="scale(1)">
        </g>
    </svg>
`;

test('vectortracerSvgToIconGeometry: figura simple produce paintMode "fill" / fillRule "nonzero", sin `layers`', () => {
  const geometry = vectortracerSvgToIconGeometry(SIMPLE_SQUARE_SVG);
  assert.equal(geometry.paintMode, 'fill');
  assert.equal(geometry.fillRule, 'nonzero');
  assert.ok(geometry.svgPath.length > 0);
  assert.equal(geometry.layers, undefined, 'el binarizador solo conoce tinta/fondo — nunca hacen falta layers');
});

test('vectortracerSvgToIconGeometry: rectángulo con agujero conserva el agujero como segundo subpath (nunca se pierde)', () => {
  const geometry = vectortracerSvgToIconGeometry(RECTANGLE_WITH_HOLE_SVG);
  const subpathCount = (geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'exterior + agujero = 2 subpaths, igual que en el SVG de vectortracer');
});

test('vectortracerSvgToIconGeometry: dos regiones desconectadas se combinan en UN svgPath, sin fundirse geométricamente (nunca se cancelan entre sí)', () => {
  const geometry = vectortracerSvgToIconGeometry(TWO_DISCONNECTED_REGIONS_SVG);
  const subpathCount = (geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'las dos regiones siguen siendo dos subpaths separados dentro del mismo svgPath');
  assert.equal(geometry.layers, undefined, 'dos regiones de tinta (mismo rol) se concatenan de forma segura, no hace falta `layers`');
});

test('vectortracerSvgToIconGeometry: el resultado queda normalizado al viewBox de referencia 0-100, como cualquier otro ícono', () => {
  const geometry = vectortracerSvgToIconGeometry(SIMPLE_SQUARE_SVG);
  const numbers = (geometry.svgPath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  for (const n of numbers) {
    assert.ok(n >= -1 && n <= 101, `coordenada ${n} fuera del rango esperado del viewBox normalizado`);
  }
});

test('vectortracerSvgToIconGeometry: un SVG sin ningún <path> se rechaza (tira, nunca produce una geometría vacía en silencio)', () => {
  assert.throws(() => vectortracerSvgToIconGeometry(EMPTY_SVG));
});

test('vectortracerSvgToIconGeometry: respeta el transform="scale(N)" del <g> además del translate() de cada <path>', () => {
  const scaledSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;" >
        <g transform="scale(2)">
        <path d="M0,0 L10,0 L10,10 L0,10 Z " transform="translate(5,5)" fill="#000000" />
        </g>
    </svg>
  `;
  // No debe tirar, y debe producir una geometría normalizada válida — el
  // punto de este test es que el transform combinado (translate ∘ scale)
  // se aplica sin romper el parseo, no un valor numérico exacto (que de
  // cualquier forma termina reabsorbido por la normalización final).
  const geometry = vectortracerSvgToIconGeometry(scaledSvg);
  assert.ok(geometry.svgPath.length > 0);
});
