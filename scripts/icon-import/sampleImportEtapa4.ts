/**
 * Muestra chica de validación — Etapa 4 (corrección de relleno/trazo real).
 * Corre el pipeline YA CORREGIDO (`pdfToPaths.ts` + `composeIconGeometry.ts`
 * + `classifyIcon.ts` + `renderIconCanvas.ts`) sobre un puñado curado de
 * PDFs reales — nunca sobre los 307 completos, y nunca escribe en
 * `public/icons/` (ver las restricciones explícitas del pedido: "NO
 * ejecutar todavía la reimportación completa", "NO reemplazar todavía
 * manifest.json"). Todo el output va a una carpeta de scratch fuera del
 * proyecto.
 *
 * Para cada archivo de la muestra genera:
 *  - el PNG de la página ORIGINAL del PDF (motor oficial de pdf.js,
 *    `page.render()` — referencia independiente de nuestra propia
 *    extracción);
 *  - el thumbnail generado por el pipeline corregido (misma función
 *    `renderIconToPngBuffer` que usará el importador completo);
 *  - un reporte en consola con el resultado de la clasificación
 *    (status/paintMode/fillRule/strokeWidth/reasons).
 *  - un `sample-manifest.json`/`sample-audit.json` de solo esta muestra.
 *
 * Correr: `node scripts/icon-import/sampleImportEtapa4.ts`
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon, type IconClassification } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { slugify } from './slug.ts';
import type { IconAsset } from '../../src/editor/icons/iconCatalog.ts';

const ICONS_SOURCE_DIR = 'C:/Users/benja/OneDrive/Desktop/iconospdf';
const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-sample-etapa4';
const RENDER_SIZE = 240;

/**
 * Muestra curada (12 archivos, 5 categorías) — elegida escaneando (solo
 * lectura, sin escribir nada) los 307 PDFs reales con el pipeline ya
 * corregido, para cubrir la variedad pedida: fill/evenodd "limpio", los 2
 * ÚNICOS casos stroke-only que existen en toda la biblioteca real, y varios
 * casos `manual-review` reales (no inventados) que el propio criterio
 * detecta.
 */
const SAMPLE_FILES: { category: string; filename: string; why: string }[] = [
  { category: 'animales', filename: 'ANIMALES_04.pdf', why: 'ya diagnosticado en la Etapa 4 (Paso 5) — ahora también sirve para ver el Caso E real (trazos huérfanos)' },
  { category: 'escudos', filename: 'Escudo_07.pdf', why: 'ya diagnosticado en la Etapa 4 (Paso 5) — 9 pares stroke+eoFill, ahora resuelto a fill/evenodd limpio' },
  { category: 'futbol', filename: 'FUTBOL_13.pdf', why: 'ya diagnosticado en la Etapa 4 (Paso 5)' },
  { category: 'animales', filename: 'ANIMALES_02.pdf', why: 'fill/evenodd limpio, 0 trazos descartados' },
  { category: 'signos', filename: 'SIGNOS_02.pdf', why: 'representa la categoría signos (la más chica, 12 archivos)' },
  { category: 'random', filename: 'RANDOM_02.pdf', why: 'caso conocido de la Etapa 2 (dos diseños muy pegados) — valida que el clasificador de "un solo diseño" sigue funcionando independiente de la corrección de paint type' },
  { category: 'futbol', filename: 'FUTBOL_17.pdf', why: 'uno de los ÚNICOS 2 casos stroke-only reales de toda la biblioteca (307 PDFs)' },
  { category: 'random', filename: 'RANDOM_103.pdf', why: 'el otro de los ÚNICOS 2 casos stroke-only reales de toda la biblioteca' },
  { category: 'animales', filename: 'ANIMALES_17.pdf', why: 'caso ambiguo real: mezcla fill (nonzero) y eoFill (evenodd) en el mismo ícono' },
  { category: 'escudos', filename: 'Escudo_31.pdf', why: 'caso ambiguo real: trazo huérfano sin relleno emparejado (Caso E)' },
  { category: 'futbol', filename: 'FUTBOL_02.pdf', why: 'caso ambiguo real: varios trazos huérfanos (Caso E)' },
  { category: 'animales', filename: 'ANIMALES_01.pdf', why: 'caso real sin geometría pintada (todo el contenido es el clip de página) — ya lo teníamos identificado en la Etapa 2 como "fuente embebida"' },
];

async function renderGroundTruthPdfPage(pdfBytes: Uint8Array, outPath: string): Promise<void> {
  const doc = await getDocument({ data: pdfBytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = RENDER_SIZE / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // @ts-expect-error -- @napi-rs/canvas implementa la misma superficie 2D que pdf.js espera de un CanvasRenderingContext2D de browser; los tipos no coinciden 1:1 con los de pdfjs-dist (mismo patrón ya usado en pilot.ts, Etapa 2).
  await page.render({ canvasContext: ctx, viewport }).promise;
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

interface SampleRow {
  category: string;
  filename: string;
  why: string;
  classification: IconClassification;
}

async function buildContactSheet(rows: { label: string; groundTruthPath: string | null; thumbPath: string | null }[], outPath: string): Promise<void> {
  const cellW = RENDER_SIZE;
  const cellH = RENDER_SIZE + 24;
  const cols = 2; // ground truth | thumbnail corregido, uno al lado del otro
  const canvas = createCanvas(cols * cellW + 20, rows.length * cellH + 20);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = i * cellH + 10;
    ctx.fillStyle = '#333333';
    ctx.font = '11px sans-serif';
    ctx.fillText(row.label, 10, y + RENDER_SIZE + 16);
    if (row.groundTruthPath) {
      try {
        const img = await loadImage(readFileSync(row.groundTruthPath));
        ctx.drawImage(img, 10, y, RENDER_SIZE, RENDER_SIZE);
      } catch { /* no bloquea el contact sheet */ }
    }
    ctx.strokeStyle = '#dddddd';
    ctx.strokeRect(10, y, RENDER_SIZE, RENDER_SIZE);
    if (row.thumbPath) {
      try {
        const img = await loadImage(readFileSync(row.thumbPath));
        ctx.drawImage(img, 10 + cellW, y, RENDER_SIZE, RENDER_SIZE);
      } catch { /* no bloquea el contact sheet */ }
    }
    ctx.strokeRect(10 + cellW, y, RENDER_SIZE, RENDER_SIZE);
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function main(): Promise<void> {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows: SampleRow[] = [];
  const sampleIcons: IconAsset[] = [];
  const contactSheetRows: { label: string; groundTruthPath: string | null; thumbPath: string | null }[] = [];

  for (const { category, filename, why } of SAMPLE_FILES) {
    console.log(`\n========== ${category}/${filename} ==========`);
    console.log('por qué está en la muestra:', why);
    const fullPath = join(ICONS_SOURCE_DIR, category, filename);
    const bytes = new Uint8Array(readFileSync(fullPath));

    const extraction = await extractPathFromPdf(bytes);
    const classification = classifyIcon(extraction);
    rows.push({ category, filename, why, classification });

    console.log('status:', classification.status);
    if (classification.reasons.length > 0) {
      console.log('reasons:', classification.reasons);
    }
    console.log('metrics:', JSON.stringify(classification.metrics));

    const label = `${category}/${filename} [${classification.status}${classification.paintMode ? `/${classification.paintMode}` : ''}${classification.fillRule ? `/${classification.fillRule}` : ''}]`;
    const groundTruthPath = join(OUTPUT_DIR, `${slugify(category)}-${slugify(filename)}-original.png`);
    await renderGroundTruthPdfPage(bytes, groundTruthPath);

    let thumbPath: string | null = null;
    if (classification.status === 'valid' && classification.normalizedD && classification.paintMode) {
      const icon: IconAsset = {
        id: `${slugify(category)}-${slugify(filename.replace(/\.pdf$/i, ''))}`,
        name: filename.replace(/\.pdf$/i, '').replace(/_/g, ' '),
        categoryId: slugify(category),
        svgPath: classification.normalizedD,
        paintMode: classification.paintMode,
        fillRule: classification.fillRule ?? 'nonzero',
        strokeWidth: classification.strokeWidth,
        order: sampleIcons.length,
        active: true,
        source: 'library',
        createdAt: statSync(fullPath).mtime.toISOString(),
        updatedAt: statSync(fullPath).mtime.toISOString(),
      };
      sampleIcons.push(icon);
      thumbPath = join(OUTPUT_DIR, `${icon.id}-thumb.png`);
      writeFileSync(thumbPath, renderIconToPngBuffer(icon, RENDER_SIZE));
      console.log('paintMode:', icon.paintMode, 'fillRule:', icon.fillRule, 'strokeWidth:', icon.strokeWidth);
      console.log('thumbnail ->', thumbPath);
    } else {
      console.log('(sin thumbnail — no quedó `valid`)');
    }
    console.log('render original (ground truth) ->', groundTruthPath);

    contactSheetRows.push({ label, groundTruthPath, thumbPath });
  }

  writeFileSync(join(OUTPUT_DIR, 'sample-manifest.json'), JSON.stringify({ icons: sampleIcons }, null, 2));
  writeFileSync(
    join(OUTPUT_DIR, 'sample-audit.json'),
    JSON.stringify(rows.map((r) => ({ category: r.category, filename: r.filename, why: r.why, ...r.classification })), null, 2),
  );

  await buildContactSheet(contactSheetRows, join(OUTPUT_DIR, 'contact-sheet-comparacion.png'));

  const validCount = rows.filter((r) => r.classification.status === 'valid').length;
  const reviewCount = rows.filter((r) => r.classification.status === 'manual-review').length;
  console.log('\n========== RESUMEN DE LA MUESTRA ==========');
  console.log('total:', rows.length, '| valid:', validCount, '| manual-review:', reviewCount);
  console.log('output completo en ->', OUTPUT_DIR);
  console.log('contact sheet (original vs. thumbnail corregido, lado a lado) ->', join(OUTPUT_DIR, 'contact-sheet-comparacion.png'));
}

void main();
