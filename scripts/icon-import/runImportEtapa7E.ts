/**
 * Curación visual final — Etapa 7E. Mismo pipeline EXACTO que la Etapa 7D
 * (`pdfToPaths.ts` con la corrección de matrices de la Etapa 7C,
 * `composeIconGeometry.ts`/`classifyIcon.ts` SIN CAMBIOS) — la única
 * diferencia es la capa de decisiones de curación de
 * `etapa7eCurationDecisions.ts` (aditiva, nunca modifica
 * `VISUAL_QA_OVERRIDES` de `importConfig.ts`):
 *  - `RETIRED_OVERRIDES`: entradas históricas que YA NO se aplican (el
 *    archivo pasa a `valid` si el clasificador automático no encuentra
 *    ningún problema, que es el caso en todas estas);
 *  - `NEW_MANUAL_REVIEW`: hallazgos nuevos de esta etapa que SÍ se aplican
 *    como overrides adicionales (incluyendo casos que ya eran `valid`
 *    antes de la Etapa 6C y que la revisión sistemática de esta etapa
 *    determinó que en realidad son varios diseños independientes).
 *
 * Nunca escribe en `public/icons/` — todo el output va a
 * `scratchpad/icon-import-etapa7e/`.
 *
 * Correr: `node scripts/icon-import/runImportEtapa7E.ts`
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon, type IconClassification } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { ICONS_SOURCE_DIR, CATEGORY_DEFINITIONS, VISUAL_QA_OVERRIDES, deriveName, deriveIconId } from './importConfig.ts';
import { RETIRED_OVERRIDES, NEW_MANUAL_REVIEW } from './etapa7eCurationDecisions.ts';
import { slugify } from './slug.ts';
import type { IconAsset, IconCategory } from '../../src/editor/icons/iconCatalog.ts';

const ETAPA7D_AUDIT_PATH = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7d/import-audit.json';
const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa7e';
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');
const AUDIT_REPORT_PATH = join(OUTPUT_DIR, 'import-audit.json');
const REPORT_PATH = join(OUTPUT_DIR, 'report.json');
const CURATION_REPORT_PATH = join(OUTPUT_DIR, 'curation-report.json');
const THUMBNAILS_DIR = join(OUTPUT_DIR, 'thumbnails');
const CONTACT_SHEETS_DIR = join(OUTPUT_DIR, 'contact-sheets');
const THUMB_SIZE = 160;

// Overrides EFECTIVOS de esta etapa: los históricos MENOS los retirados,
// MÁS los hallazgos nuevos. `importConfig.ts` no se toca — este mapa vive
// solo acá, en memoria, para esta corrida.
const EFFECTIVE_OVERRIDES: Record<string, string> = { ...VISUAL_QA_OVERRIDES };
for (const key of Object.keys(RETIRED_OVERRIDES)) delete EFFECTIVE_OVERRIDES[key];
for (const [key, reason] of Object.entries(NEW_MANUAL_REVIEW)) EFFECTIVE_OVERRIDES[key] = reason;

interface AuditRecord {
  category: string; filename: string; iconId: string | null;
  status: 'valid' | 'manual-review' | 'error';
  reasons: string[];
  metrics: IconClassification['metrics'] | null;
  errorMessage: string | null;
  paintMode: 'fill' | 'stroke' | null;
  fillRule: 'nonzero' | 'evenodd' | null;
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
    } catch { /* noop */ }
    ctx.strokeStyle = '#dddddd';
    ctx.strokeRect(x, y, THUMB_SIZE, THUMB_SIZE);
    ctx.fillStyle = '#333333';
    ctx.font = '10px sans-serif';
    ctx.fillText(entry.label, x, y + THUMB_SIZE + 12, THUMB_SIZE);
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function main(): Promise<void> {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(THUMBNAILS_DIR, { recursive: true });
  mkdirSync(CONTACT_SHEETS_DIR, { recursive: true });

  const categories: IconCategory[] = CATEGORY_DEFINITIONS.map(({ folder, name }, index) => ({
    id: slugify(folder), name, order: index, active: true,
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
        const overrideReason = EFFECTIVE_OVERRIDES[overrideKey];
        const classification: IconClassification = overrideReason
          ? { ...automaticClassification, status: 'manual-review', reasons: [...automaticClassification.reasons, `[revisión visual] ${overrideReason}`] }
          : automaticClassification;

        auditRecords.push({
          category: folder, filename, iconId,
          status: classification.status,
          reasons: classification.reasons,
          metrics: classification.metrics,
          errorMessage: null,
          paintMode: classification.status === 'valid' ? classification.paintMode ?? null : null,
          fillRule: classification.status === 'valid' ? classification.fillRule ?? null : null,
        });

        if (automaticClassification.status === 'valid' && automaticClassification.normalizedD && automaticClassification.paintMode) {
          const mtime = statSync(fullPath).mtime.toISOString();
          const previewIcon: IconAsset = {
            id: iconId, name: deriveName(filename), categoryId,
            svgPath: automaticClassification.normalizedD,
            paintMode: automaticClassification.paintMode,
            fillRule: automaticClassification.fillRule ?? 'nonzero',
            strokeWidth: automaticClassification.strokeWidth,
            order: 0, active: true, source: 'library',
            createdAt: mtime, updatedAt: mtime,
          };
          if (classification.status === 'valid') {
            icons.push({ ...previewIcon, order: iconOrderInCategory++ });
            renderThumbnail(previewIcon, join(THUMBNAILS_DIR, `${iconId}.png`));
          } else if (overrideReason) {
            manualReviewThumbInfo.push({ icon: previewIcon, category: folder });
            renderThumbnail(previewIcon, join(THUMBNAILS_DIR, `_review-${iconId}.png`));
          }
        }
      } catch (e) {
        auditRecords.push({
          category: folder, filename, iconId, status: 'error', reasons: [], metrics: null,
          errorMessage: (e as Error).message, paintMode: null, fillRule: null,
        });
      }
    }
  }

  const manifest = { categories, icons };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(auditRecords, null, 2));

  // ---- Contact sheets ----
  for (let categoryIndex = 0; categoryIndex < CATEGORY_DEFINITIONS.length; categoryIndex++) {
    const { folder } = CATEGORY_DEFINITIONS[categoryIndex];
    const categoryId = categories[categoryIndex].id;
    const entries = icons.filter((icon) => icon.categoryId === categoryId).map((icon) => ({ label: icon.name, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) }));
    if (entries.length > 0) await buildContactSheet(entries, join(CONTACT_SHEETS_DIR, `${folder}.png`));
  }
  await buildContactSheet(icons.map((icon) => ({ label: icon.id, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) })), join(CONTACT_SHEETS_DIR, 'general.png'), 12);
  await buildContactSheet(manualReviewThumbInfo.map(({ icon, category }) => ({ label: `${category}/${icon.id}`, thumbPath: join(THUMBNAILS_DIR, `_review-${icon.id}.png`) })), join(CONTACT_SHEETS_DIR, 'manual-review.png'), 10);

  // ---- Contact sheet: overrides retirados (ahora valid) ----
  const retiredIds = Object.keys(RETIRED_OVERRIDES).map((key) => {
    const [folder, filename] = key.split('/');
    const categoryId = slugify(folder);
    return deriveIconId(categoryId, filename);
  });
  await buildContactSheet(
    icons.filter((i) => retiredIds.includes(i.id)).map((icon) => ({ label: icon.id, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) })),
    join(CONTACT_SHEETS_DIR, 'overrides-retirados.png'),
  );

  // ---- Contact sheet: overrides mantenidos (siguen manual-review) ----
  const keptOverrideIds = new Set(
    Object.keys(VISUAL_QA_OVERRIDES).filter((key) => !(key in RETIRED_OVERRIDES)).map((key) => {
      const [folder, filename] = key.split('/');
      return deriveIconId(slugify(folder), filename);
    }),
  );
  await buildContactSheet(
    manualReviewThumbInfo.filter(({ icon }) => keptOverrideIds.has(icon.id)).map(({ icon, category }) => ({ label: `${category}/${icon.id}`, thumbPath: join(THUMBNAILS_DIR, `_review-${icon.id}.png`) })),
    join(CONTACT_SHEETS_DIR, 'overrides-mantenidos.png'),
  );

  // ---- Contact sheet: hallazgos NUEVOS de esta etapa (antes valid, ahora manual-review) ----
  await buildContactSheet(
    manualReviewThumbInfo.filter(({ icon }) => Object.keys(NEW_MANUAL_REVIEW).some((key) => {
      const [folder, filename] = key.split('/');
      return deriveIconId(slugify(folder), filename) === icon.id;
    })).map(({ icon, category }) => ({ label: `${category}/${icon.id}`, thumbPath: join(THUMBNAILS_DIR, `_review-${icon.id}.png`) })),
    join(CONTACT_SHEETS_DIR, 'nuevos-hallazgos-7e.png'),
  );

  // ---- Comparación 7D -> 7E ----
  const etapa7dAudit: AuditRecord[] = existsSync(ETAPA7D_AUDIT_PATH) ? JSON.parse(readFileSync(ETAPA7D_AUDIT_PATH, 'utf8')) : [];
  const etapa7dById = new Map(etapa7dAudit.filter((r) => r.iconId).map((r) => [r.iconId as string, r]));
  const newById = new Map(auditRecords.filter((r) => r.iconId).map((r) => [r.iconId as string, r]));

  const recuperadosPorCuracion: string[] = [];
  const enviadosAManualReview: string[] = [];
  for (const [id, before] of etapa7dById) {
    const after = newById.get(id);
    if (!after) continue;
    if (before.status !== 'valid' && after.status === 'valid') recuperadosPorCuracion.push(id);
    if (before.status === 'valid' && after.status !== 'valid') enviadosAManualReview.push(id);
  }

  const validCount = auditRecords.filter((r) => r.status === 'valid').length;
  const manualReviewCount = auditRecords.filter((r) => r.status === 'manual-review').length;
  const errorCount = auditRecords.filter((r) => r.status === 'error').length;

  const perCategory = CATEGORY_DEFINITIONS.map(({ folder }) => {
    const recs = auditRecords.filter((r) => r.category === folder);
    return {
      category: folder, total: recs.length,
      valid: recs.filter((r) => r.status === 'valid').length,
      manualReview: recs.filter((r) => r.status === 'manual-review').length,
      error: recs.filter((r) => r.status === 'error').length,
    };
  });

  const report = {
    totalProcessed: auditRecords.length,
    totalFound,
    valid: validCount,
    manualReview: manualReviewCount,
    error: errorCount,
    perCategory,
    comparisonVsEtapa7D: {
      validAntes: etapa7dAudit.filter((r) => r.status === 'valid').length,
      validDespues: validCount,
      recuperadosPorCuracionCount: recuperadosPorCuracion.length,
      enviadosAManualReviewCount: enviadosAManualReview.length,
      recuperadosPorCuracion,
      enviadosAManualReview,
      overridesRetiradosCount: Object.keys(RETIRED_OVERRIDES).length,
      overridesMantenidosCount: Object.keys(VISUAL_QA_OVERRIDES).length - Object.keys(RETIRED_OVERRIDES).length,
      hallazgosNuevosCount: Object.keys(NEW_MANUAL_REVIEW).length,
    },
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const curationReport = {
    overridesRetirados: Object.entries(RETIRED_OVERRIDES).map(([key, reason]) => ({ key, reasonNueva: reason })),
    overridesMantenidos: Object.entries(VISUAL_QA_OVERRIDES).filter(([key]) => !(key in RETIRED_OVERRIDES)).map(([key, reason]) => ({ key, reasonHistorica: reason })),
    hallazgosNuevos: Object.entries(NEW_MANUAL_REVIEW).map(([key, reason]) => ({ key, reason })),
  };
  writeFileSync(CURATION_REPORT_PATH, JSON.stringify(curationReport, null, 2));

  console.log(`\n========== RESUMEN ETAPA 7E ==========`);
  console.log(`total: ${auditRecords.length} | valid: ${validCount} | manual-review: ${manualReviewCount} | error: ${errorCount}`);
  console.log(`vs. Etapa 7D: valid antes ${report.comparisonVsEtapa7D.validAntes} -> ahora ${validCount}`);
  console.log(`recuperados por curación (override retirado): ${recuperadosPorCuracion.length}`, recuperadosPorCuracion);
  console.log(`enviados a manual-review (hallazgo nuevo): ${enviadosAManualReview.length}`, enviadosAManualReview);
  console.log(`overrides retirados: ${report.comparisonVsEtapa7D.overridesRetiradosCount} | mantenidos: ${report.comparisonVsEtapa7D.overridesMantenidosCount} | hallazgos nuevos: ${report.comparisonVsEtapa7D.hallazgosNuevosCount}`);
  console.log(`por categoría:`);
  for (const c of perCategory) console.log(`  ${c.category}: ${c.total} -> ${c.valid} valid, ${c.manualReview} manual-review, ${c.error} error`);
  console.log(`\nmanifest -> ${MANIFEST_PATH}`);
  console.log(`auditoría -> ${AUDIT_REPORT_PATH}`);
  console.log(`reporte -> ${REPORT_PATH}`);
  console.log(`reporte de curación -> ${CURATION_REPORT_PATH}`);
  console.log(`\n========== FIN ETAPA 7E ==========`);
}

void main();
