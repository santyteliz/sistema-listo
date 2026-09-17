/**
 * Reimportación completa — Etapa 7D (medir el impacto AISLADO de la
 * corrección matricial de la Etapa 7C sobre los 307 PDFs reales).
 *
 * Pipeline EXACTAMENTE igual al de `runImportEtapa6B.ts` (extracción +
 * `composeIconGeometry` + `classifyIcon` + overrides de revisión visual +
 * normalización + thumbnails) — la ÚNICA diferencia real es que
 * `pdfToPaths.ts` ahora usa la corrección de matrices de la Etapa 7C. No se
 * modifica ningún heurístico de clasificación/composición en esta etapa
 * (ver las restricciones explícitas del pedido). Nunca escribe en
 * `public/icons/` — todo el output va a `scratchpad/icon-import-etapa7d/`.
 *
 * Además de manifest/audit/thumbnails/contact-sheets (igual que Etapa 6B),
 * este script:
 *  - guarda, por archivo, la cantidad de `paintGroups` crudos y su bounding
 *    box combinado (antes de `composeIconGeometry`) — insumo para el
 *    análisis de impacto de la corrección matricial (sección 7 del pedido);
 *  - compara el resultado contra `public/icons/import-audit.json` (la
 *    auditoría real de los 307 archivos que sustenta el catálogo de 187
 *    íconos actualmente promovido en la Etapa 6C) para clasificar cada
 *    icon.id en A "se mantiene" / B "recuperado" / C "perdido" / D "cambió
 *    el motivo de manual-review";
 *  - genera un contact sheet de "cambios" (recuperados + perdidos) para
 *    poder revisarlos visualmente uno por uno.
 *
 * Correr: `node scripts/icon-import/runImportEtapa7D.ts`
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon, type IconClassification } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { ICONS_SOURCE_DIR, CATEGORY_DEFINITIONS, VISUAL_QA_OVERRIDES, deriveName, deriveIconId } from './importConfig.ts';
import { slugify } from './slug.ts';
import type { IconAsset, IconCategory } from '../../src/editor/icons/iconCatalog.ts';

const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7d';
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');
const AUDIT_REPORT_PATH = join(OUTPUT_DIR, 'import-audit.json');
const REPORT_PATH = join(OUTPUT_DIR, 'report.json');
const THUMBNAILS_DIR = join(OUTPUT_DIR, 'thumbnails');
const CONTACT_SHEETS_DIR = join(OUTPUT_DIR, 'contact-sheets');
const THUMB_SIZE = 160;

// Catálogo/auditoría ACTUALMENTE promovidos (Etapa 6C) — la referencia real
// contra la que se mide el impacto de esta etapa. `import-audit.json` real
// tiene el detalle de los 307 archivos (187 valid + 120 manual-review con
// motivo), no solo de los 187 promovidos — es la comparación correcta,
// mejor que la del manifest (que solo tiene los 187 `valid`).
const CURRENT_PUBLIC_AUDIT_PATH = 'C:/Users/benja/OneDrive/Desktop/Web Mates/personalizador-mates/public/icons/import-audit.json';
const CURRENT_PUBLIC_THUMBNAILS_DIR = 'C:/Users/benja/OneDrive/Desktop/Web Mates/personalizador-mates/public/icons/thumbnails';

interface AuditRecord {
  category: string;
  filename: string;
  iconId: string | null;
  status: 'valid' | 'manual-review' | 'error';
  reasons: string[];
  metrics: IconClassification['metrics'] | null;
  errorMessage: string | null;
  paintMode: 'fill' | 'stroke' | null;
  fillRule: 'nonzero' | 'evenodd' | null;
  /** Diagnóstico Etapa 7D — cantidad de `constructPath` pintados CRUDOS (antes de `composeIconGeometry`), para detectar candidatos a impacto de la corrección matricial (muchos componentes = más chances de que el bug de matrices haya sido visible). */
  rawPaintGroupCount: number;
  /** Diagnóstico Etapa 7D — bounding box combinado de TODOS los `paintGroups` crudos, en espacio de página del PDF (antes de normalizar) — para comparar contra el tamaño de página y detectar geometría fuera de rango. */
  rawCombinedBoundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

function renderThumbnail(icon: Pick<IconAsset, 'svgPath' | 'paintMode' | 'fillRule' | 'strokeWidth'>, outPath: string): void {
  writeFileSync(outPath, renderIconToPngBuffer(icon, THUMB_SIZE));
}

async function buildContactSheet(entries: { label: string; thumbPath: string }[], outPath: string, cols = 10): Promise<void> {
  if (entries.length === 0) return;
  const cellSize = THUMB_SIZE + 20;
  const labelHeight = 16;
  const rows = Math.ceil(entries.length / cols);
  const canvas = createCanvas(cols * cellSize, rows * (cellSize + labelHeight));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellSize + 10;
    const y = row * (cellSize + labelHeight) + 10;
    try {
      const img = await loadImage(readFileSync(entry.thumbPath));
      ctx.drawImage(img, x, y, THUMB_SIZE, THUMB_SIZE);
    } catch { /* no bloquea el resto del contact sheet */ }
    ctx.strokeStyle = '#dddddd';
    ctx.strokeRect(x, y, THUMB_SIZE, THUMB_SIZE);
    ctx.fillStyle = '#333333';
    ctx.font = '10px sans-serif';
    ctx.fillText(entry.label, x, y + THUMB_SIZE + 12, THUMB_SIZE);
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

/** Contact sheet de 2 columnas (antes Etapa 6C | ahora Etapa 7D) para los IDs que cambiaron de estado. */
async function buildBeforeAfterSheet(rows: { label: string; beforePath: string | null; afterPath: string | null }[], outPath: string): Promise<void> {
  if (rows.length === 0) return;
  const cellW = THUMB_SIZE;
  const cellH = THUMB_SIZE + 20;
  const canvas = createCanvas(2 * cellW + 20, rows.length * cellH + 20);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = i * cellH + 10;
    ctx.fillStyle = '#333333';
    ctx.font = '11px sans-serif';
    ctx.fillText(row.label, 10, y + THUMB_SIZE + 14);
    if (row.beforePath && existsSync(row.beforePath)) {
      try { ctx.drawImage(await loadImage(readFileSync(row.beforePath)), 10, y, THUMB_SIZE, THUMB_SIZE); } catch { /* noop */ }
    }
    ctx.strokeStyle = '#dddddd';
    ctx.strokeRect(10, y, THUMB_SIZE, THUMB_SIZE);
    if (row.afterPath && existsSync(row.afterPath)) {
      try { ctx.drawImage(await loadImage(readFileSync(row.afterPath)), 10 + cellW, y, THUMB_SIZE, THUMB_SIZE); } catch { /* noop */ }
    }
    ctx.strokeRect(10 + cellW, y, THUMB_SIZE, THUMB_SIZE);
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

interface RunResult {
  categories: IconCategory[];
  icons: IconAsset[];
  auditRecords: AuditRecord[];
  manualReviewThumbInfo: { icon: IconAsset; category: string }[];
  totalFound: number;
}

/** Corre el pipeline completo sobre los 307 PDFs — separado en una función para poder invocarlo una segunda vez (chequeo de idempotencia, sección 14) sin duplicar el script. `writeThumbs` controla si se escriben PNGs a disco (la segunda corrida de idempotencia no necesita repetir esa I/O, solo comparar los datos). */
async function runFullImport(writeThumbs: boolean): Promise<RunResult> {
  const categories: IconCategory[] = CATEGORY_DEFINITIONS.map(({ folder, name }, index) => ({
    id: slugify(folder),
    name,
    order: index,
    active: true,
  }));

  const icons: IconAsset[] = [];
  const auditRecords: AuditRecord[] = [];
  const manualReviewThumbInfo: { icon: IconAsset; category: string }[] = [];
  let totalFound = 0;

  for (let categoryIndex = 0; categoryIndex < CATEGORY_DEFINITIONS.length; categoryIndex++) {
    const { folder } = CATEGORY_DEFINITIONS[categoryIndex];
    const categoryId = categories[categoryIndex].id;
    const dir = join(ICONS_SOURCE_DIR, folder);
    const filenames = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
    totalFound += filenames.length;

    let iconOrderInCategory = 0;
    for (const filename of filenames) {
      const fullPath = join(dir, filename);
      const iconId = deriveIconId(categoryId, filename);
      try {
        const bytes = new Uint8Array(readFileSync(fullPath));
        const extraction = await extractPathFromPdf(bytes);
        const automaticClassification = classifyIcon(extraction);

        const overrideKey = `${folder}/${filename}`;
        const overrideReason = VISUAL_QA_OVERRIDES[overrideKey];
        const classification: IconClassification = overrideReason
          ? { ...automaticClassification, status: 'manual-review', reasons: [...automaticClassification.reasons, `[revisión visual] ${overrideReason}`] }
          : automaticClassification;

        let rawCombinedBoundingBox: AuditRecord['rawCombinedBoundingBox'] = null;
        for (const g of extraction.paintGroups) {
          rawCombinedBoundingBox = rawCombinedBoundingBox
            ? {
              minX: Math.min(rawCombinedBoundingBox.minX, g.boundingBox.minX),
              minY: Math.min(rawCombinedBoundingBox.minY, g.boundingBox.minY),
              maxX: Math.max(rawCombinedBoundingBox.maxX, g.boundingBox.maxX),
              maxY: Math.max(rawCombinedBoundingBox.maxY, g.boundingBox.maxY),
            }
            : { ...g.boundingBox };
        }

        auditRecords.push({
          category: folder,
          filename,
          iconId,
          status: classification.status,
          reasons: classification.reasons,
          metrics: classification.metrics,
          errorMessage: null,
          paintMode: classification.status === 'valid' ? classification.paintMode ?? null : null,
          fillRule: classification.status === 'valid' ? classification.fillRule ?? null : null,
          rawPaintGroupCount: extraction.paintGroups.length,
          rawCombinedBoundingBox,
        });

        if (automaticClassification.status === 'valid' && automaticClassification.normalizedD && automaticClassification.paintMode) {
          const mtime = statSync(fullPath).mtime.toISOString();
          const previewIcon: IconAsset = {
            id: iconId,
            name: deriveName(filename),
            categoryId,
            svgPath: automaticClassification.normalizedD,
            paintMode: automaticClassification.paintMode,
            fillRule: automaticClassification.fillRule ?? 'nonzero',
            strokeWidth: automaticClassification.strokeWidth,
            order: 0,
            active: true,
            source: 'library',
            createdAt: mtime,
            updatedAt: mtime,
          };
          if (classification.status === 'valid') {
            icons.push({ ...previewIcon, order: iconOrderInCategory++ });
            if (writeThumbs) renderThumbnail(previewIcon, join(THUMBNAILS_DIR, `${iconId}.png`));
          } else if (overrideReason) {
            manualReviewThumbInfo.push({ icon: previewIcon, category: folder });
            if (writeThumbs) renderThumbnail(previewIcon, join(THUMBNAILS_DIR, `_review-${iconId}.png`));
          }
        }
      } catch (e) {
        auditRecords.push({
          category: folder,
          filename,
          iconId,
          status: 'error',
          reasons: [],
          metrics: null,
          errorMessage: (e as Error).message,
          paintMode: null,
          fillRule: null,
          rawPaintGroupCount: 0,
          rawCombinedBoundingBox: null,
        });
      }
    }
  }

  return { categories, icons, auditRecords, manualReviewThumbInfo, totalFound };
}

async function main(): Promise<void> {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(THUMBNAILS_DIR, { recursive: true });
  mkdirSync(CONTACT_SHEETS_DIR, { recursive: true });

  console.log('========== ETAPA 7D — corrida 1/2 (real, con thumbnails) ==========');
  const run1 = await runFullImport(true);

  const { categories, icons, auditRecords, manualReviewThumbInfo, totalFound } = run1;

  const manifest = { categories, icons };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(auditRecords, null, 2));

  // ---- Contact sheets GENERAL / por categoría ----
  for (let categoryIndex = 0; categoryIndex < CATEGORY_DEFINITIONS.length; categoryIndex++) {
    const { folder } = CATEGORY_DEFINITIONS[categoryIndex];
    const categoryId = categories[categoryIndex].id;
    const entries = icons
      .filter((icon) => icon.categoryId === categoryId)
      .map((icon) => ({ label: icon.name, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) }));
    if (entries.length > 0) {
      await buildContactSheet(entries, join(CONTACT_SHEETS_DIR, `${folder}.png`));
    }
  }
  await buildContactSheet(
    icons.map((icon) => ({ label: icon.id, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) })),
    join(CONTACT_SHEETS_DIR, 'general.png'),
    12,
  );
  await buildContactSheet(
    manualReviewThumbInfo.map(({ icon, category }) => ({ label: `${category}/${icon.id}`, thumbPath: join(THUMBNAILS_DIR, `_review-${icon.id}.png`) })),
    join(CONTACT_SHEETS_DIR, 'manual-review.png'),
    10,
  );

  // ---- Comparación contra el catálogo REAL actualmente promovido (Etapa 6C) ----
  const baselineAudit: AuditRecord[] = existsSync(CURRENT_PUBLIC_AUDIT_PATH)
    ? JSON.parse(readFileSync(CURRENT_PUBLIC_AUDIT_PATH, 'utf8'))
    : [];
  const baselineById = new Map(baselineAudit.filter((r) => r.iconId).map((r) => [r.iconId as string, r]));
  const newById = new Map(auditRecords.filter((r) => r.iconId).map((r) => [r.iconId as string, r]));

  const seMantienen: string[] = [];
  const recuperados: string[] = [];
  const perdidos: string[] = [];
  const cambiosDeMotivo: { id: string; before: string[]; after: string[] }[] = [];

  const allIds = new Set([...baselineById.keys(), ...newById.keys()]);
  for (const id of allIds) {
    const before = baselineById.get(id);
    const after = newById.get(id);
    const beforeValid = before?.status === 'valid';
    const afterValid = after?.status === 'valid';
    if (beforeValid && afterValid) {
      seMantienen.push(id);
    } else if (!beforeValid && afterValid) {
      recuperados.push(id);
    } else if (beforeValid && !afterValid) {
      perdidos.push(id);
    } else if (before?.status === 'manual-review' && after?.status === 'manual-review') {
      const beforeReasons = [...before.reasons].sort();
      const afterReasons = [...after.reasons].sort();
      if (JSON.stringify(beforeReasons) !== JSON.stringify(afterReasons)) {
        cambiosDeMotivo.push({ id, before: before.reasons, after: after.reasons });
      }
    }
  }

  // ---- Contact sheet de cambios (recuperados + perdidos), antes/después ----
  const changeRows: { label: string; beforePath: string | null; afterPath: string | null }[] = [];
  for (const id of recuperados) {
    changeRows.push({
      label: `RECUPERADO: ${id}`,
      beforePath: null, // no existía thumbnail antes (era manual-review/error)
      afterPath: existsSync(join(THUMBNAILS_DIR, `${id}.png`)) ? join(THUMBNAILS_DIR, `${id}.png`) : join(THUMBNAILS_DIR, `_review-${id}.png`),
    });
  }
  for (const id of perdidos) {
    changeRows.push({
      label: `PERDIDO: ${id}`,
      beforePath: join(CURRENT_PUBLIC_THUMBNAILS_DIR, `${id}.png`),
      afterPath: existsSync(join(THUMBNAILS_DIR, `_review-${id}.png`)) ? join(THUMBNAILS_DIR, `_review-${id}.png`) : null,
    });
  }
  await buildBeforeAfterSheet(changeRows, join(CONTACT_SHEETS_DIR, 'cambios-vs-etapa6c.png'));

  // ---- Chequeo de idempotencia (sección 14): segunda corrida completa, solo en memoria ----
  console.log('\n========== ETAPA 7D — corrida 2/2 (idempotencia, sin escribir thumbnails) ==========');
  const run2 = await runFullImport(false);
  const manifest1Str = JSON.stringify({ categories: run1.categories, icons: run1.icons });
  const manifest2Str = JSON.stringify({ categories: run2.categories, icons: run2.icons });
  const audit1Str = JSON.stringify(run1.auditRecords);
  const audit2Str = JSON.stringify(run2.auditRecords);
  const isDeterministic = manifest1Str === manifest2Str && audit1Str === audit2Str;

  // ---- Métricas por categoría ----
  const perCategory = CATEGORY_DEFINITIONS.map(({ folder }) => {
    const recs = auditRecords.filter((r) => r.category === folder);
    return {
      category: folder,
      total: recs.length,
      valid: recs.filter((r) => r.status === 'valid').length,
      manualReview: recs.filter((r) => r.status === 'manual-review').length,
      error: recs.filter((r) => r.status === 'error').length,
    };
  });

  const report = {
    totalProcessed: auditRecords.length,
    totalFound,
    valid: auditRecords.filter((r) => r.status === 'valid').length,
    manualReview: auditRecords.filter((r) => r.status === 'manual-review').length,
    error: auditRecords.filter((r) => r.status === 'error').length,
    perCategory,
    baseline: {
      source: CURRENT_PUBLIC_AUDIT_PATH,
      totalRecords: baselineAudit.length,
      valid: baselineAudit.filter((r) => r.status === 'valid').length,
      manualReview: baselineAudit.filter((r) => r.status === 'manual-review').length,
    },
    comparison: {
      seMantienenCount: seMantienen.length,
      recuperadosCount: recuperados.length,
      perdidosCount: perdidos.length,
      cambiosDeMotivoCount: cambiosDeMotivo.length,
      seMantienen,
      recuperados,
      perdidos,
      cambiosDeMotivo,
    },
    idempotencia: {
      determinista: isDeterministic,
      manifestIdentico: manifest1Str === manifest2Str,
      auditIdentico: audit1Str === audit2Str,
    },
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n========== RESUMEN ETAPA 7D ==========`);
  console.log(`PDFs encontrados: ${totalFound} | procesados: ${auditRecords.length}`);
  console.log(`valid: ${report.valid} | manual-review: ${report.manualReview} | error: ${report.error}`);
  console.log(`baseline (Etapa 6C, public/icons): valid: ${report.baseline.valid} | manual-review: ${report.baseline.manualReview}`);
  console.log(`se mantienen: ${seMantienen.length} | recuperados: ${recuperados.length} | perdidos: ${perdidos.length} | cambios de motivo: ${cambiosDeMotivo.length}`);
  console.log('recuperados:', recuperados);
  console.log('perdidos:', perdidos);
  console.log(`idempotencia (2 corridas, mismo resultado): ${isDeterministic}`);
  console.log(`por categoría:`);
  for (const c of perCategory) {
    console.log(`  ${c.category}: ${c.total} -> ${c.valid} valid, ${c.manualReview} manual-review, ${c.error} error`);
  }
  console.log(`\nmanifest -> ${MANIFEST_PATH}`);
  console.log(`auditoría -> ${AUDIT_REPORT_PATH}`);
  console.log(`reporte -> ${REPORT_PATH}`);
  console.log(`thumbnails -> ${THUMBNAILS_DIR}`);
  console.log(`contact sheets -> ${CONTACT_SHEETS_DIR}`);
  console.log(`\n========== FIN ETAPA 7D ==========`);
}

void main();
