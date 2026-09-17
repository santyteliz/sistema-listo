/**
 * Muestra de validación — Etapa 7C (corrección del bug de composición de
 * matrices en `pdfToPaths.ts`, diagnosticado en las Etapas 7A/7B sobre
 * `FUTBOL_56.pdf`, y corregido en esta etapa cambiando el orden de
 * argumentos del ÚNICO call site que combinaba CTM con viewport — ver el
 * comentario grande sobre `multiply()` en `pdfToPaths.ts`).
 *
 * Corre el pipeline YA CORREGIDO (`pdfToPaths.ts` con el fix + el resto sin
 * cambios: `composeIconGeometry.ts`/`classifyIcon.ts`/`renderIconCanvas.ts`)
 * sobre 17 PDFs reales — nunca sobre los 307 completos, y nunca escribe en
 * `public/icons/`: todo el output va a
 * `scratchpad/icon-import-etapa7c/` (fuera del proyecto).
 *
 * Para cada archivo genera:
 *  - el PNG de la página ORIGINAL del PDF (motor oficial de pdf.js,
 *    `page.render()` — referencia independiente de nuestra propia
 *    extracción; NUNCA se usa el CropBox nominal como única referencia,
 *    solo el propio render escalado — mismo criterio ya usado en la
 *    Etapa 4/7A);
 *  - el thumbnail generado por el pipeline corregido (misma función
 *    `renderIconToPngBuffer` que usará el importador completo — thumbnail
 *    y Fabric comparten esa misma función desde la Etapa 4, sin cambios
 *    acá);
 *  - un reporte en consola + JSON con el resultado de la clasificación
 *    (status/paintMode/fillRule/reasons/métricas) y con el bounding box
 *    combinado de la geometría extraída (para comparar contra el tamaño
 *    real de la región no blanca del PDF, sin depender solo de mirar la
 *    imagen).
 *
 * Correr: `node scripts/icon-import/sampleEtapa7C.ts`
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
const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7c';
const RENDER_SIZE = 240;

/**
 * 17 archivos: el caso principal (`FUTBOL_56`), los 7 "casos anteriores"
 * pedidos explícitamente, y 9 casos complejos adicionales elegidos
 * escaneando (solo lectura) los 307 PDFs reales por cantidad de
 * `constructPath` pintados (proxy de "múltiples componentes/múltiples
 * `cm`") — incluye 2 referencias ya conocidas de la Etapa 7A
 * (`Escudo_38`, "se ve bien"; `Escudo_13`, "se veía mal") para poder medir
 * si el fix las cambia o las deja igual.
 */
const SAMPLE_FILES: { category: string; filename: string; why: string }[] = [
  { category: 'futbol', filename: 'FUTBOL_56.pdf', why: 'CASO PRINCIPAL — el escudo de Boca (68 estrellas + 4 letras + 1 escudo, ~73 componentes independientes) usado para diagnosticar el bug de matrices en la Etapa 7A/7B' },
  { category: 'escudos', filename: 'Escudo_07.pdf', why: 'caso anterior — 9 pares stroke+eoFill ya resueltos en la Etapa 4, debía seguir viéndose bien' },
  { category: 'futbol', filename: 'FUTBOL_13.pdf', why: 'caso anterior — ya validado en Etapas 4/6A/6C' },
  { category: 'animales', filename: 'ANIMALES_02.pdf', why: 'caso anterior — fill/evenodd limpio, simple, debía seguir viéndose bien' },
  { category: 'signos', filename: 'SIGNOS_02.pdf', why: 'caso anterior — representa la categoría más chica' },
  { category: 'random', filename: 'RANDOM_02.pdf', why: 'caso anterior — dos diseños muy pegados, valida que el clasificador de "un solo diseño" no se vea afectado por el fix' },
  { category: 'random', filename: 'RANDOM_04.pdf', why: 'caso anterior — el bug de cancelación evenodd corregido en la Etapa 6A (Caso F), debía seguir viéndose bien' },
  { category: 'random', filename: 'RANDOM_103.pdf', why: 'caso anterior — uno de los 2 únicos casos stroke-only reales de la biblioteca' },
  { category: 'animales', filename: 'ANIMALES_04.pdf', why: 'complejo adicional — 353 constructPath pintados, el archivo con más componentes de toda la biblioteca (muchas formas independientes/superpuestas tipo pelaje)' },
  { category: 'futbol', filename: 'FUTBOL_02.pdf', why: 'complejo adicional — 250 componentes; ya diagnosticado en la Etapa 4 como "varios trazos huérfanos" (Caso E, motivo NO relacionado con matrices)' },
  { category: 'escudos', filename: 'Escudo_38.pdf', why: 'complejo adicional — 74 componentes; REFERENCIA de la Etapa 7A ("se veía bien" incluso con el bug), para confirmar que el fix no lo rompe' },
  { category: 'escudos', filename: 'Escudo_13.pdf', why: 'complejo adicional — REFERENCIA de la Etapa 7A ("se veía mal" con el bug), para confirmar que el fix lo mejora' },
  { category: 'futbol', filename: 'FUTBOL_39.pdf', why: 'complejo adicional — 74 componentes independientes' },
  { category: 'escudos', filename: 'Escudo_32.pdf', why: 'complejo adicional — 73 componentes independientes' },
  { category: 'random', filename: 'RANDOM_98.pdf', why: 'complejo adicional — 67 componentes independientes' },
  { category: 'animales', filename: 'ANIMALES_25.pdf', why: 'complejo adicional — 74 componentes, posibles formas superpuestas tipo pelaje/plumas' },
  { category: 'futbol', filename: 'FUTBOL_26.pdf', why: 'complejo adicional — 67 componentes independientes, otro escudo de club con texto convertido a curvas' },
];

async function renderGroundTruthPdfPage(pdfBytes: Uint8Array, outPath: string): Promise<{ width: number; height: number }> {
  const doc = await getDocument({ data: pdfBytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = RENDER_SIZE / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // @ts-expect-error -- @napi-rs/canvas implementa la misma superficie 2D que pdf.js espera de un CanvasRenderingContext2D de browser (mismo patrón ya usado en pilot.ts/sampleImportEtapa4.ts).
  await page.render({ canvasContext: ctx, viewport }).promise;
  writeFileSync(outPath, canvas.toBuffer('image/png'));
  return { width: baseViewport.width, height: baseViewport.height };
}

interface SampleRow {
  category: string;
  filename: string;
  why: string;
  status: IconClassification['status'];
  reasons: string[];
  paintMode: 'fill' | 'stroke' | null;
  fillRule: 'nonzero' | 'evenodd' | null;
  combinedBoundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  pageSize: { width: number; height: number };
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

    let combinedBoundingBox: SampleRow['combinedBoundingBox'] = null;
    for (const g of extraction.paintGroups) {
      combinedBoundingBox = combinedBoundingBox
        ? {
          minX: Math.min(combinedBoundingBox.minX, g.boundingBox.minX),
          minY: Math.min(combinedBoundingBox.minY, g.boundingBox.minY),
          maxX: Math.max(combinedBoundingBox.maxX, g.boundingBox.maxX),
          maxY: Math.max(combinedBoundingBox.maxY, g.boundingBox.maxY),
        }
        : { ...g.boundingBox };
    }

    console.log('status:', classification.status);
    if (classification.reasons.length > 0) console.log('reasons:', classification.reasons);
    console.log('metrics:', JSON.stringify(classification.metrics));
    console.log('paintGroups:', extraction.paintGroups.length, '| combined bbox:', combinedBoundingBox);

    const label = `${category}/${filename} [${classification.status}${classification.paintMode ? `/${classification.paintMode}` : ''}${classification.fillRule ? `/${classification.fillRule}` : ''}]`;
    const groundTruthPath = join(OUTPUT_DIR, `${slugify(category)}-${slugify(filename)}-original.png`);
    const pageSize = await renderGroundTruthPdfPage(bytes, groundTruthPath);

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

    rows.push({
      category, filename, why,
      status: classification.status,
      reasons: classification.reasons,
      paintMode: classification.paintMode ?? null,
      fillRule: classification.fillRule ?? null,
      combinedBoundingBox,
      pageSize,
    });
    contactSheetRows.push({ label, groundTruthPath, thumbPath });
  }

  writeFileSync(join(OUTPUT_DIR, 'sample-manifest.json'), JSON.stringify({ icons: sampleIcons }, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'sample-report.json'), JSON.stringify(rows, null, 2));
  await buildContactSheet(contactSheetRows, join(OUTPUT_DIR, 'contact-sheet-antes-despues.png'));

  console.log(`\n========== RESUMEN MUESTRA ETAPA 7C ==========`);
  console.log(`archivos: ${rows.length} | valid: ${rows.filter((r) => r.status === 'valid').length} | manual-review: ${rows.filter((r) => r.status === 'manual-review').length}`);
  console.log(`output -> ${OUTPUT_DIR}`);
  console.log(`contact sheet (PDF original | thumbnail corregido) -> ${join(OUTPUT_DIR, 'contact-sheet-antes-despues.png')}`);
}

void main();
