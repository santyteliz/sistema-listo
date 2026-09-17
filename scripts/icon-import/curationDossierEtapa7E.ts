/**
 * Dossier de curación — Etapa 7E, paso 1 (herramienta de REVISIÓN, no de
 * decisión automática). Para cada uno de los 91 `manual-review` de la
 * Etapa 7D, genera 2 imágenes lado a lado:
 *  - el render ORIGINAL del PDF (motor de pdf.js, independiente de nuestra
 *    extracción — nunca solo el CropBox);
 *  - el thumbnail que tendría HOY con la geometría ya corregida (forzado,
 *    ignorando el `status` de `manual-review`, para poder verlo aunque el
 *    clasificador automático o un override lo excluyan).
 *
 * Esto es SOLO para que yo (el asistente) revise visualmente cada caso y
 * tome una decisión de curación — no decide nada por sí solo, no toca
 * `VISUAL_QA_OVERRIDES`, no escribe ningún manifest.
 *
 * Correr: `node scripts/icon-import/curationDossierEtapa7E.ts`
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { ICONS_SOURCE_DIR } from './importConfig.ts';

const ETAPA7D_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7d';
const OUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7e';
const DOSSIER_DIR = join(OUT_DIR, 'dossier-manual-review');
const RENDER_SIZE = 200;
const ROWS_PER_SHEET = 18;

interface AuditRecord {
  category: string; filename: string; iconId: string | null;
  status: string; reasons: string[];
}

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

async function buildSheet(rows: { label: string; gtPath: string; thumbPath: string | null }[], outPath: string): Promise<void> {
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
    if (row.thumbPath) {
      try { ctx.drawImage(await loadImage(readFileSync(row.thumbPath)), 10 + cellW, y, RENDER_SIZE, RENDER_SIZE); } catch { /* noop */ }
    }
    ctx.strokeRect(10 + cellW, y, RENDER_SIZE, RENDER_SIZE);
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function main(): Promise<void> {
  rmSync(DOSSIER_DIR, { recursive: true, force: true });
  mkdirSync(DOSSIER_DIR, { recursive: true });

  const audit: AuditRecord[] = JSON.parse(readFileSync(join(ETAPA7D_DIR, 'import-audit.json'), 'utf8'));
  const manualReview = audit.filter((r) => r.status === 'manual-review').sort((a, b) => `${a.category}/${a.filename}`.localeCompare(`${b.category}/${b.filename}`));
  console.log('total manual-review a procesar:', manualReview.length);

  const rows: { label: string; gtPath: string; thumbPath: string | null; iconId: string; onlyOverride: boolean }[] = [];

  for (const rec of manualReview) {
    const fullPath = join(ICONS_SOURCE_DIR, rec.category, rec.filename);
    const bytes = new Uint8Array(readFileSync(fullPath));
    const gtBuf = await renderGroundTruth(bytes);
    const gtPath = join(DOSSIER_DIR, `${rec.iconId}-gt.png`);
    writeFileSync(gtPath, gtBuf);

    const extraction = await extractPathFromPdf(bytes);
    const classification = classifyIcon(extraction);
    let thumbPath: string | null = null;
    if (classification.normalizedD && classification.paintMode) {
      const icon = {
        svgPath: classification.normalizedD,
        paintMode: classification.paintMode,
        fillRule: classification.fillRule ?? 'nonzero',
        strokeWidth: classification.strokeWidth,
      };
      thumbPath = join(DOSSIER_DIR, `${rec.iconId}-forced.png`);
      writeFileSync(thumbPath, renderIconToPngBuffer(icon, RENDER_SIZE));
    }

    const onlyOverride = rec.reasons.length === 1 && rec.reasons[0].startsWith('[revisión visual]');
    const reasonShort = rec.reasons.join(' | ').slice(0, 100);
    rows.push({
      label: `${rec.category}/${rec.filename} [${rec.iconId}]${onlyOverride ? ' [SOLO-OVERRIDE]' : ' [auto]'} — ${reasonShort}`,
      gtPath,
      thumbPath,
      iconId: rec.iconId!,
      onlyOverride,
    });
  }

  // Ordenar: primero los "solo override" (prioridad 1 del pedido), después el resto.
  rows.sort((a, b) => (a.onlyOverride === b.onlyOverride ? 0 : a.onlyOverride ? -1 : 1));

  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) {
    const chunk = rows.slice(i, i + ROWS_PER_SHEET);
    await buildSheet(chunk, join(DOSSIER_DIR, `sheet-${String(i / ROWS_PER_SHEET + 1).padStart(2, '0')}.png`));
  }

  writeFileSync(join(DOSSIER_DIR, 'index.json'), JSON.stringify(rows.map((r) => ({ iconId: r.iconId, onlyOverride: r.onlyOverride, label: r.label })), null, 2));
  console.log('sheets generados:', Math.ceil(rows.length / ROWS_PER_SHEET));
  console.log('dossier ->', DOSSIER_DIR);
}

void main();
