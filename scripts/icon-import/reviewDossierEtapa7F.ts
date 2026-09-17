/**
 * Dossier de revisión — Etapa 7F (herramienta de REVISIÓN humana, no de
 * decisión automática). Para cada caso pedido explícitamente en esta
 * etapa (los 11 hallazgos nuevos de la Etapa 7E + FUTBOL_13 + Escudo_48,
 * ya incluidos en esa lista de 11), genera 2 imágenes lado a lado:
 *  - el render ORIGINAL del PDF (motor de pdf.js, independiente de
 *    nuestra extracción);
 *  - el thumbnail ACTUAL (geometría ya corregida y compuesta, el mismo
 *    que ya existe en `scratchpad/icon-import-etapa7d/thumbnails/`, o
 *    forzado si por algún motivo no existe).
 *
 * Solo para revisión visual — no decide nada, no toca ningún archivo de
 * `public/icons/` ni de `scripts/icon-import/` fuera de sí mismo.
 *
 * Correr: `node scripts/icon-import/reviewDossierEtapa7F.ts`
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { ICONS_SOURCE_DIR } from './importConfig.ts';

const OUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7f';
const DOSSIER_DIR = join(OUT_DIR, 'dossier-review');
const ETAPA7D_THUMBS = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7d/thumbnails';
const RENDER_SIZE = 220;

// Los 11 hallazgos nuevos de la Etapa 7E (obtenidos de
// `scratchpad/icon-import-etapa7e/report.json`, sección
// `comparisonVsEtapa7D.enviadosAManualReview`) — incluye `FUTBOL_13`
// (Paso 3 de esta etapa). `Escudo_48.pdf` (Paso 4) NO es uno de los 11
// (nunca fue `valid`, siempre estuvo en `VISUAL_QA_OVERRIDES` desde la
// Etapa 2) — se agrega igual acá para poder revisarlo con el mismo
// dossier.
const CASES: { category: string; filename: string; iconId: string }[] = [
  { category: 'animales', filename: 'ANIMALES_25.pdf', iconId: 'animales-animales-25' },
  { category: 'escudos', filename: 'Escudo_09.pdf', iconId: 'escudos-escudo-09' },
  { category: 'escudos', filename: 'Escudo_24.pdf', iconId: 'escudos-escudo-24' },
  { category: 'futbol', filename: 'FUTBOL_13.pdf', iconId: 'futbol-futbol-13' },
  { category: 'futbol', filename: 'FUTBOL_19.pdf', iconId: 'futbol-futbol-19' },
  { category: 'futbol', filename: 'FUTBOL_25.pdf', iconId: 'futbol-futbol-25' },
  { category: 'random', filename: 'RANDOM_23.pdf', iconId: 'random-random-23' },
  { category: 'random', filename: 'RANDOM_42.pdf', iconId: 'random-random-42' },
  { category: 'random', filename: 'RANDOM_60.pdf', iconId: 'random-random-60' },
  { category: 'random', filename: 'RANDOM_67.pdf', iconId: 'random-random-67' },
  { category: 'random', filename: 'RANDOM_73.pdf', iconId: 'random-random-73' },
  // Paso 4 — Escudo_48 (no es uno de los 11, siempre estuvo en manual-review).
  { category: 'escudos', filename: 'Escudo_48.pdf', iconId: 'escudos-escudo-48' },
];

async function renderGroundTruth(pdfBytes: Uint8Array): Promise<Buffer> {
  const doc = await getDocument({ data: pdfBytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = RENDER_SIZE / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // @ts-expect-error -- mismo patrón que el resto de los scripts de este directorio.
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function buildSheet(rows: { label: string; gtPath: string; thumbPath: string }[], outPath: string): Promise<void> {
  const cellW = RENDER_SIZE;
  const cellH = RENDER_SIZE + 26;
  const canvas = createCanvas(2 * cellW + 20, rows.length * cellH + 20);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = i * cellH + 10;
    ctx.fillStyle = '#333333';
    ctx.font = '11px sans-serif';
    ctx.fillText(row.label, 10, y + RENDER_SIZE + 18, 2 * cellW);
    try { ctx.drawImage(await loadImage(readFileSync(row.gtPath)), 10, y, RENDER_SIZE, RENDER_SIZE); } catch { /* noop */ }
    ctx.strokeStyle = '#dddddd';
    ctx.strokeRect(10, y, RENDER_SIZE, RENDER_SIZE);
    try { ctx.drawImage(await loadImage(readFileSync(row.thumbPath)), 10 + cellW, y, RENDER_SIZE, RENDER_SIZE); } catch { /* noop */ }
    ctx.strokeRect(10 + cellW, y, RENDER_SIZE, RENDER_SIZE);
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function main(): Promise<void> {
  mkdirSync(DOSSIER_DIR, { recursive: true });

  const rows: { label: string; gtPath: string; thumbPath: string }[] = [];
  for (const { category, filename, iconId } of CASES) {
    const fullPath = join(ICONS_SOURCE_DIR, category, filename);
    const bytes = new Uint8Array(readFileSync(fullPath));
    const gtBuf = await renderGroundTruth(bytes);
    const gtPath = join(DOSSIER_DIR, `${iconId}-gt.png`);
    writeFileSync(gtPath, gtBuf);

    let thumbPath = join(ETAPA7D_THUMBS, `${iconId}.png`);
    if (!existsSync(thumbPath)) {
      // No debería pasar (los 11 eran `valid` en la Etapa 7D, Escudo_48
      // tiene su propio thumbnail forzado ya generado en el dossier de la
      // Etapa 7E) — red de seguridad: renderiza de nuevo si hiciera falta,
      // sin cambiar ninguna lógica de clasificación/composición.
      const extraction = await extractPathFromPdf(bytes);
      const classification = classifyIcon(extraction);
      thumbPath = join(DOSSIER_DIR, `${iconId}-forced.png`);
      if (classification.normalizedD && classification.paintMode) {
        writeFileSync(thumbPath, renderIconToPngBuffer({
          svgPath: classification.normalizedD,
          paintMode: classification.paintMode,
          fillRule: classification.fillRule ?? 'nonzero',
          strokeWidth: classification.strokeWidth,
        }, RENDER_SIZE));
      }
    }

    rows.push({ label: `${category}/${filename} [${iconId}]`, gtPath, thumbPath });
  }

  await buildSheet(rows, join(DOSSIER_DIR, 'sheet-review-7f.png'));
  console.log('dossier ->', DOSSIER_DIR);
  console.log('casos procesados:', rows.length);
}

void main();
