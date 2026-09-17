/**
 * Tests de detección de fondo/polaridad — Etapa 9E.1.
 *
 * Etapa 9E clasificaba tinta/fondo por un umbral fijo de LUMINANCIA (< 128
 * → tinta), que interpretaba mal un fondo de color oscuro con diseño claro
 * (ej. fondo rojo + diseño blanco: el rojo, aunque sea claramente "el
 * fondo", tiene luminancia baja y terminaba clasificado como tinta —
 * resultado invertido). Estos tests verifican que, ahora, la detección de
 * fondo (`detectRasterBackground`, por perímetro) + la clasificación por
 * distancia de color (`binarizeRasterPixels`) resuelven correctamente
 * CUALQUIER combinación de color fondo/diseño, no solo blanco/negro.
 *
 * En vez de revisar un puñado de puntos sueltos, cada test reconstruye la
 * "forma" real de la tinta resultante (bounding box de los píxeles negros
 * tras binarizar) y la compara contra la región de diseño esperada — la
 * condición necesaria y suficiente para que la geometría final (que sale
 * de vectorizar exactamente esos mismos píxeles) tenga la forma correcta.
 * Los casos con agujero/regiones desconectadas, verificados contra la
 * GEOMETRÍA final real (motor WASM real, no solo píxeles), están en
 * `rasterIconExtractor.integration.test.ts`.
 *
 * Correr: `node --test src/editor/icons/rasterIconExtractor.polarity.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binarizeRasterPixels, detectRasterBackground, type RasterPixelData } from './rasterIconExtractor.ts';

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

/** Región de diseño centrada, con margen real de fondo alrededor (ver el comentario de `rasterIconExtractor.test.ts` sobre por qué el margen es necesario para que la detección de fondo por perímetro tenga sentido). */
function makeCenteredDesign(size: number, marginPx: number, background: [number, number, number, number], foreground: [number, number, number, number]): RasterPixelData {
  return makeRaw(size, size, (x, y) => {
    const isDesign = x >= marginPx && x < size - marginPx && y >= marginPx && y < size - marginPx;
    return isDesign ? foreground : background;
  });
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** Bounding box de los píxeles de TINTA (negro) tras binarizar — la "forma" real que terminaría yendo a `vectortracer`. `null` si no hay ningún píxel de tinta. */
function inkBoundingBox(binarized: RasterPixelData): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < binarized.height; y++) {
    for (let x = 0; x < binarized.width; x++) {
      const i = (y * binarized.width + x) * 4;
      const isInk = binarized.data[i] === 0;
      if (isInk) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

const SIZE = 20;
const MARGIN = 5; // el diseño ocupa [5, 15) x [5, 15) — bounding box esperado: minX=minY=5, maxX=maxY=14.
const EXPECTED_DESIGN_BOX: Box = { minX: MARGIN, minY: MARGIN, maxX: SIZE - MARGIN - 1, maxY: SIZE - MARGIN - 1 };

function assertMatchesDesignRegion(binarized: RasterPixelData, label: string) {
  const box = inkBoundingBox(binarized);
  assert.ok(box, `${label}: debería haber tinta`);
  assert.deepEqual(box, EXPECTED_DESIGN_BOX, `${label}: la forma de la tinta debe coincidir con la región de diseño real, no con el fondo`);
}

// =====================================================================
// A — blanco + negro (caso baseline, no debe romperse)
// =====================================================================
test('A — fondo blanco + diseño negro: la tinta es el diseño, no el fondo', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [255, 255, 255, 255], [0, 0, 0, 255]);
  assertMatchesDesignRegion(binarizeRasterPixels(raw), 'A');
});

// =====================================================================
// B — negro + blanco (polaridad invertida respecto de A)
// =====================================================================
test('B — fondo negro + diseño blanco: la tinta sigue siendo el diseño (blanco), no el fondo (negro)', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [0, 0, 0, 255], [255, 255, 255, 255]);
  assertMatchesDesignRegion(binarizeRasterPixels(raw), 'B');
});

// =====================================================================
// C — rojo + blanco (el caso real que motivó esta etapa)
// =====================================================================
test('C — fondo ROJO + diseño blanco: la tinta es el diseño blanco, el rojo NO se interpreta como tinta (antes de esta etapa se invertía)', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [200, 30, 30, 255], [255, 255, 255, 255]);
  const binarized = binarizeRasterPixels(raw);
  assertMatchesDesignRegion(binarized, 'C');
  // Verificación explícita adicional: con el umbral de LUMINANCIA viejo
  // (< 128 → tinta), el rojo (luminancia ≈ 0.2126*200+0.7152*30+0.0722*30
  // ≈ 66.6) hubiera quedado clasificado como tinta, y el blanco (255) como
  // fondo — exactamente invertido. Confirmamos que NO es lo que pasa acá.
  const background = detectRasterBackground(raw);
  assert.equal(background.isTransparent, false);
  assert.ok(!background.isTransparent && background.color.r > 150, 'el fondo detectado debe ser el rojo, no el blanco');
});

// =====================================================================
// D — azul + blanco
// =====================================================================
test('D — fondo AZUL + diseño blanco: la tinta es el diseño blanco, el azul no se interpreta como tinta', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [20, 20, 220, 255], [255, 255, 255, 255]);
  assertMatchesDesignRegion(binarizeRasterPixels(raw), 'D');
});

// =====================================================================
// E — transparente + negro (no debe romperse; ver Etapa 9E)
// =====================================================================
test('E — fondo transparente + diseño negro: sigue funcionando igual que en la Etapa 9E', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [0, 0, 0, 0], [0, 0, 0, 255]);
  const binarized = binarizeRasterPixels(raw);
  assertMatchesDesignRegion(binarized, 'E');
  const background = detectRasterBackground(raw);
  assert.equal(background.isTransparent, true, 'sin ningún píxel opaco en el perímetro, el fondo se identifica por transparencia, no por color');
});

// =====================================================================
// Casos adicionales de color (más allá de los 5 mínimos pedidos) — mismo
// mecanismo, para confirmar que no está hardcodeado a rojo/azul.
// =====================================================================
test('fondo VERDE + diseño negro: también funciona (no está hardcodeado a rojo/azul)', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [30, 180, 60, 255], [0, 0, 0, 255]);
  assertMatchesDesignRegion(binarizeRasterPixels(raw), 'verde+negro');
});

test('fondo gris claro + diseño gris oscuro (ambos "grises", pero suficientemente distintos): se distinguen por distancia, no por luminancia absoluta', () => {
  const raw = makeCenteredDesign(SIZE, MARGIN, [230, 230, 230, 255], [40, 40, 40, 255]);
  assertMatchesDesignRegion(binarizeRasterPixels(raw), 'gris claro+gris oscuro');
});
