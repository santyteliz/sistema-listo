/**
 * Piloto de la Etapa 2 — corre el pipeline completo (PDF real → geometría →
 * `normalizeIconPath` → validación visual) sobre un puñado chico de PDFs
 * ANTES de lanzar la importación de los 370, tal como pidió el usuario.
 *
 * Para cada archivo piloto genera DOS PNG de verificación (usando
 * `@napi-rs/canvas`, el backend de renderizado en Node que ya trae
 * `pdfjs-dist` como dependencia opcional propia — no es una dependencia
 * nueva agregada acá):
 *  - `*-original.png`: la página del PDF renderizada por el motor OFICIAL
 *    de pdf.js (`page.render`) — referencia independiente de mi propia
 *    extracción, para poder comparar visualmente.
 *  - `*-extracted.png`: el resultado de ESTE pipeline (extracción propia +
 *    `normalizeIconPath`), rellenado en negro sobre blanco.
 *
 * Correr: `node scripts/icon-import/pilot.ts`
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { normalizeIconPath } from '../../src/editor/icons/normalizeIconPath.ts';

const ICONS_SOURCE_DIR = 'C:/Users/benja/OneDrive/Desktop/iconospdf';
const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-pilot';

const PILOT_FILES = [
  { label: 'animales-normal', relPath: 'animales/ANIMALES_02.pdf' },
  { label: 'animales-fuente-embebida', relPath: 'animales/ANIMALES_01.pdf' },
  { label: 'futbol-raster', relPath: 'futbol/FUTBOL_06.pdf' },
  { label: 'disenos-caracteres-especiales', relPath: 'diseños/DISEÑOS_02.pdf' },
];

const RENDER_SIZE = 300;

async function renderOriginalPdfPage(pdfBytes: Uint8Array, outPath: string): Promise<{ width: number; height: number }> {
  // Copia defensiva: `getDocument({ data })` transfiere/detach el buffer
  // del array que recibe (ver el comentario grande en pdfToPaths.ts) — acá
  // se renderiza el MISMO PDF que ya se le pasó a `extractPathFromPdf`, así
  // que sin la copia este segundo `getDocument` fallaría con el buffer ya
  // vaciado por el primero.
  const doc = await (getDocument({ data: pdfBytes.slice(), isEvalSupported: false, useSystemFonts: false })).promise;
  const page = await doc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = RENDER_SIZE / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // @ts-expect-error -- @napi-rs/canvas implementa la misma superficie 2D que pdf.js espera de un CanvasRenderingContext2D de browser; los tipos no coinciden 1:1 con los de pdfjs-dist.
  await page.render({ canvasContext: ctx, viewport }).promise;
  writeFileSync(outPath, canvas.toBuffer('image/png'));
  return { width: canvas.width, height: canvas.height };
}

function renderExtractedPath(d: string, outPath: string): void {
  const canvas = createCanvas(RENDER_SIZE, RENDER_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);
  ctx.fillStyle = '#000000';
  // El `d` normalizado vive en un viewBox lógico 0..100 — se escala al
  // tamaño de render pedido, misma lógica que va a usar después el
  // thumbnail real (Paso 8, todavía no implementado en este piloto).
  const scale = RENDER_SIZE / 100;
  ctx.save();
  ctx.scale(scale, scale);
  const path = new Path2D(d);
  ctx.fill(path);
  ctx.restore();
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function runPilotFile(label: string, relPath: string): Promise<void> {
  console.log(`\n========== ${label} (${relPath}) ==========`);
  const fs = await import('node:fs');
  const fullPath = join(ICONS_SOURCE_DIR, relPath);
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = new Uint8Array(fs.readFileSync(fullPath));
  } catch (e) {
    console.log('ERROR leyendo el archivo:', (e as Error).message);
    return;
  }
  console.log('tamaño del PDF:', pdfBytes.byteLength, 'bytes');

  let extraction;
  try {
    extraction = await extractPathFromPdf(pdfBytes);
  } catch (e) {
    console.log('ERROR extrayendo geometría:', (e as Error).stack);
    return;
  }

  console.log('numPages:', extraction.numPages, extraction.numPages !== 1 ? '⚠ distinto de 1' : 'OK');
  console.log('subpaths de relleno combinados:', extraction.fillSubpathCount);
  console.log('hasRasterImage:', extraction.hasRasterImage);
  console.log('hasLiveText:', extraction.hasLiveText);
  console.log('warnings de extracción:', extraction.warnings.length ? extraction.warnings : '(ninguno)');
  console.log('longitud del d extraído (crudo, sin normalizar):', extraction.d.length, 'caracteres');

  if (!extraction.d) {
    console.log('SIN GEOMETRÍA DE RELLENO — no se puede normalizar ni renderizar.');
    return;
  }

  let normalized;
  try {
    normalized = normalizeIconPath(extraction.d);
  } catch (e) {
    console.log('ERROR en normalizeIconPath:', (e as Error).message);
    return;
  }

  console.log('bounding box FUENTE (antes de normalizar):', JSON.stringify(normalized.sourceBoundingBox));
  const w = normalized.sourceBoundingBox.maxX - normalized.sourceBoundingBox.minX;
  const h = normalized.sourceBoundingBox.maxY - normalized.sourceBoundingBox.minY;
  console.log('ancho fuente:', w.toFixed(2), 'alto fuente:', h.toFixed(2), 'proporción (ancho/alto):', (w / h).toFixed(3));
  console.log('longitud del d normalizado:', normalized.d.length, 'caracteres');

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const originalOut = join(OUTPUT_DIR, `${label}-original.png`);
  const extractedOut = join(OUTPUT_DIR, `${label}-extracted.png`);

  try {
    await renderOriginalPdfPage(pdfBytes, originalOut);
    console.log('render ORIGINAL (ground truth, motor oficial de pdf.js) ->', originalOut);
  } catch (e) {
    console.log('no se pudo renderizar el original (no bloquea el piloto):', (e as Error).message);
  }

  renderExtractedPath(normalized.d, extractedOut);
  console.log('render EXTRAÍDO+NORMALIZADO (este pipeline) ->', extractedOut);
}

async function main(): Promise<void> {
  for (const { label, relPath } of PILOT_FILES) {
    await runPilotFile(label, relPath);
  }
  console.log('\n========== FIN DEL PILOTO ==========');
}

void main();
