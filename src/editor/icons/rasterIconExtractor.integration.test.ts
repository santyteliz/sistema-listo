/**
 * Test de integración REAL de `rasterIconExtractor.ts` — Etapa 9E.
 *
 * A diferencia de `rasterIconExtractor.test.ts` (partes puras), acá se
 * ejercita el motor WASM real de `vectortracer` de punta a punta:
 *
 *   binarizeRasterPixels (real, producción)
 *     → vectortracer real (motor WASM real — instanciado a mano, ver abajo)
 *     → vectortracerSvgToIconGeometry (real, producción)
 *     → buildUploadedIconAsset (real, producción)
 *     → createIconObject (real, producción — Fabric real)
 *
 * Por qué el motor se instancia "a mano" en vez de llamar a
 * `vectorizeBinaryPixels` (la función real y exportable de
 * `rasterIconExtractor.ts`): esa función hace `import()` dinámico de
 * `vectortracer` por RUTA RELATIVA a `node_modules` — un truco que depende
 * pura y exclusivamente del pipeline de Vite (dev server o `vite build`,
 * ver la Etapa 9D.1) para resolver el import ESM del `.wasm` que trae el
 * paquete (`import * as wasm from "*.wasm"`, formato `wasm-pack --target
 * bundler`). El loader nativo de módulos de Node (ni siquiera vía `tsx`,
 * que solo transforma TypeScript, no reimplementa el helper de Vite para
 * WASM) sabe resolver ESA sintaxis de import sin ayuda. La solución, ya
 * usada y confirmada funcionando en el PoC de la Etapa 9D
 * (`scratchpad/vectortracer-poc/loadEngine.mjs`): instanciar el MISMO
 * `.wasm`/glue code a mano vía `WebAssembly.instantiate`, sin pasar por
 * ningún import especial — mismo binario, mismo motor, mismo resultado que
 * vería un navegador real; lo único que cambia es CÓMO se lo carga en este
 * archivo de test, nunca en el código de producción (`rasterIconExtractor.ts`
 * sigue usando el import dinámico real, verificado en Chrome).
 *
 * Correr: `npx tsx --test src/editor/icons/rasterIconExtractor.integration.test.ts`
 * (necesita `tsx`, no alcanza `node --test` puro — importa `fabric`, igual
 * que `iconElement.test.ts`.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Path } from 'fabric';
import { binarizeRasterPixels, detectRasterBackground, vectortracerSvgToIconGeometry, type RasterPixelData } from './rasterIconExtractor.ts';
import { buildUploadedIconAsset } from './uploadIconFlow.ts';
import { createIconObject, isIconObject } from '../canvas/iconElement.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Memoizado a propósito — igual que `loadVectortracer()` en
// `rasterIconExtractor.ts` (producción): el WASM se instancia UNA sola
// vez y se reutiliza para todas las conversiones. Instanciarlo de nuevo en
// cada test (sin memoizar) reveló un problema real pero puramente de este
// arnés de test, no de producción: `vectortracer_bg.js` cachea sus vistas
// tipadas de memoria (`cachedUint8Memory0`, etc.) a nivel de módulo, y si
// se crea una SEGUNDA instancia de WASM reusando el mismo glue code ya
// importado (Node cachea el `import()` por URL), esa caché queda apuntando
// a la memoria de la instancia VIEJA — la siguiente conversión corrompe
// memoria y el motor termina en un trap `unreachable`. Con una sola
// instancia (igual que hace `rasterIconExtractor.ts` real, que memoiza el
// import del módulo) esto no ocurre — verificado corriendo la misma
// secuencia de fixtures 3 veces seguidas sin fallos.
let vectortracerEnginePromise: Promise<typeof import('vectortracer')> | null = null;
async function loadRealVectortracerEngine(): Promise<typeof import('vectortracer')> {
  if (!vectortracerEnginePromise) {
    vectortracerEnginePromise = (async () => {
      const pkgDir = path.join(__dirname, '..', '..', '..', 'node_modules', 'vectortracer', 'pkg');
      const glue = await import(pathToFileURL(path.join(pkgDir, 'vectortracer_bg.js')).href);
      const wasmBytes = fs.readFileSync(path.join(pkgDir, 'vectortracer_bg.wasm'));
      const { instance } = await WebAssembly.instantiate(wasmBytes, { './vectortracer_bg.js': glue });
      glue.__wbg_set_wasm(instance.exports);
      instance.exports.__wbindgen_start();
      return glue as typeof import('vectortracer');
    })();
  }
  return vectortracerEnginePromise;
}

async function vectorizeWithRealEngine(glue: Awaited<ReturnType<typeof loadRealVectortracerEngine>>, raw: RasterPixelData): Promise<string> {
  const converter = new glue.BinaryImageConverter(
    raw as unknown as ImageData,
    { debug: undefined, mode: 'spline' },
    { invert: undefined, pathFill: undefined, backgroundColor: undefined, attributes: undefined },
  );
  converter.init();
  let done = false;
  let iterations = 0;
  while (!done) {
    done = converter.tick();
    if (++iterations > 100_000) throw new Error('tick() no termina — posible bug del motor o del fixture de test.');
  }
  const svg = converter.getResult();
  converter.free();
  return svg;
}

function makeRectangleWithHole(): RasterPixelData {
  const size = 40;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inOuter = x >= 8 && x < 32 && y >= 8 && y < 32;
      const inInner = x >= 14 && x < 26 && y >= 14 && y < 26;
      const isInk = inOuter && !inInner;
      // Fondo TRANSPARENTE con RGB variado (no solo negro/blanco) — ejercita
      // también el binarizador real (alpha + luminancia), no solo el motor.
      const v = isInk ? 0 : 200;
      const a = isInk ? 255 : 0;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = a;
    }
  }
  return { data, width: size, height: size };
}

function makeTwoDisconnectedSquares(): RasterPixelData {
  const width = 60;
  const height = 20;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inLeft = x >= 4 && x < 16 && y >= 4 && y < 16;
      const inRight = x >= 44 && x < 56 && y >= 4 && y < 16;
      const isInk = inLeft || inRight;
      const v = isInk ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// Etapa 9E.1 — el caso real que motivó esta etapa: fondo de COLOR (rojo),
// no transparente. Margen real alrededor del diseño (a diferencia de
// `makeRectangleWithHole`/`makeTwoDisconnectedSquares`, que ocupan casi
// todo el canvas) — necesario para que `detectRasterBackground` (basada en
// el perímetro) tenga margen real de fondo para muestrear.
function makeRedBackgroundRingWithHole(): RasterPixelData {
  const size = 40;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inOuter = x >= 8 && x < 32 && y >= 8 && y < 32;
      const inInner = x >= 14 && x < 26 && y >= 14 && y < 26;
      const isDesign = inOuter && !inInner; // anillo blanco
      const [r, g, b] = isDesign ? [255, 255, 255] : [200, 30, 30]; // fondo rojo opaco
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

function makeRedBackgroundTwoDisconnectedSquares(): RasterPixelData {
  const width = 60;
  const height = 20;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inLeft = x >= 4 && x < 16 && y >= 4 && y < 16;
      const inRight = x >= 44 && x < 56 && y >= 4 && y < 16;
      const isDesign = inLeft || inRight;
      const [r, g, b] = isDesign ? [255, 255, 255] : [200, 30, 30];
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

test('integración real (Etapa 9E.1) — fondo ROJO + diseño blanco con agujero: la geometría final es el diseño blanco, no el fondo rojo', async () => {
  const glue = await loadRealVectortracerEngine();
  const raw = makeRedBackgroundRingWithHole();

  const background = detectRasterBackground(raw);
  assert.equal(background.isTransparent, false);
  assert.ok(!background.isTransparent && background.color.r > 150, 'el fondo detectado debe ser el rojo (no el blanco del diseño)');

  const binary = binarizeRasterPixels(raw);
  const svgText = await vectorizeWithRealEngine(glue, binary);
  const geometry = vectortracerSvgToIconGeometry(svgText);
  const subpathCount = (geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'el anillo blanco (diseño) + su agujero deben sobrevivir — mismo resultado que con fondo transparente/blanco');

  const asset = buildUploadedIconAsset('logo-fondo-rojo.png', geometry);
  const iconObject = createIconObject(asset, VIROLA_CONFIG, 0);
  assert.ok(isIconObject(iconObject));
  assert.ok(iconObject instanceof Path);
});

test('integración real (Etapa 9E.1) — fondo ROJO + dos regiones blancas desconectadas: las dos sobreviven, el rojo no se cuela como tinta', async () => {
  const glue = await loadRealVectortracerEngine();
  const raw = makeRedBackgroundTwoDisconnectedSquares();

  const binary = binarizeRasterPixels(raw);
  const svgText = await vectorizeWithRealEngine(glue, binary);
  const geometry = vectortracerSvgToIconGeometry(svgText);
  const subpathCount = (geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'las dos regiones blancas sobre fondo rojo deben seguir llegando como dos subpaths separados');

  const asset = buildUploadedIconAsset('dos-figuras-fondo-rojo.png', geometry);
  const iconObject = createIconObject(asset, VIROLA_CONFIG, 0);
  assert.ok(isIconObject(iconObject));
  assert.ok(iconObject instanceof Path);
  const bounds = iconObject.getBoundingRect();
  assert.ok(bounds.width > 0 && bounds.height > 0);
});

test('integración real: binarize -> vectortracer real -> geometría -> IconAsset -> Path de Fabric (figura con agujero)', async () => {
  const glue = await loadRealVectortracerEngine();
  const raw = makeRectangleWithHole();

  const binary = binarizeRasterPixels(raw);
  const svgText = await vectorizeWithRealEngine(glue, binary);
  assert.ok(svgText.includes('<path'), 'el motor real debe devolver al menos un <path>');

  const geometry = vectortracerSvgToIconGeometry(svgText);
  assert.equal(geometry.paintMode, 'fill');
  assert.equal(geometry.fillRule, 'nonzero');
  const subpathCount = (geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'el agujero real debe sobrevivir hasta la geometría final como un segundo subpath');

  const asset = buildUploadedIconAsset('mi-logo.png', geometry);
  assert.equal(asset.source, 'upload');
  assert.ok(asset.id.startsWith('upload-'));
  assert.equal(asset.paintMode, 'fill');
  assert.equal(asset.categoryId, '__uploads__');

  const iconObject = createIconObject(asset, VIROLA_CONFIG, 0);
  assert.ok(isIconObject(iconObject), 'el objeto Fabric resultante debe reconocerse como ícono (graphicKind: "icon")');
  assert.ok(iconObject instanceof Path, 'sin `layers`, debe ser un Path simple, no un Group');
});

test('integración real: dos regiones desconectadas llegan como dos subpaths, no se cancelan entre sí, y producen un ícono Fabric válido', async () => {
  const glue = await loadRealVectortracerEngine();
  const raw = makeTwoDisconnectedSquares();

  const binary = binarizeRasterPixels(raw);
  const svgText = await vectorizeWithRealEngine(glue, binary);

  const geometry = vectortracerSvgToIconGeometry(svgText);
  const subpathCount = (geometry.svgPath.match(/M/g) ?? []).length;
  assert.equal(subpathCount, 2, 'dos regiones desconectadas reales deben sobrevivir como dos subpaths separados');

  const asset = buildUploadedIconAsset('dos-figuras.webp', geometry);
  const iconObject = createIconObject(asset, VIROLA_CONFIG, 0);
  assert.ok(isIconObject(iconObject));
  assert.ok(iconObject instanceof Path);
  // No se "cancelaron" entre sí bajo nonzero: el Path resultante tiene un
  // área real, no queda vacío (mismo tipo de verificación que ya usa
  // `iconElement.test.ts` para el caso Boca02).
  const bounds = iconObject.getBoundingRect();
  assert.ok(bounds.width > 0 && bounds.height > 0);
});
