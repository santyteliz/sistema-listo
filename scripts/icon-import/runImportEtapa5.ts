/**
 * Reimportación completa — Etapa 5 (validación del pipeline de Etapa 4
 * sobre los 307 PDFs reales, en una ubicación de SCRATCH — nunca toca
 * `public/icons/`). Mismo pipeline exacto que usará `runImport.ts` el día
 * que se apruebe reemplazar el catálogo — de hecho, importa literalmente
 * las mismas piezas (`extractPathFromPdf`, `classifyIcon`,
 * `renderIconToPngBuffer`, `importConfig.ts`) — la única diferencia con
 * `runImport.ts` son las rutas de salida.
 *
 * Mantiene TODOS los filtros/criterios ya existentes (páginas, raster,
 * texto vivo, clustering espacial de "un solo diseño", complejidad,
 * overrides de revisión visual de la Etapa 2) — la Etapa 4 solo AGREGÓ la
 * resolución de paint type encima de esos filtros, no los reemplazó.
 *
 * Genera en `OUTPUT_DIR` (scratch): manifest.json, import-audit.json,
 * thumbnails/, contact-sheets/ (general + de casos especiales) — y además
 * (a diferencia de `runImport.ts`) una comparación completa contra el
 * catálogo ACTUAL (`public/icons/manifest.json` + `import-audit.json`,
 * leídos pero nunca escritos) para el informe de la Etapa 5.
 *
 * Correr: `node scripts/icon-import/runImportEtapa5.ts`
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

const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa5';
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');
const AUDIT_REPORT_PATH = join(OUTPUT_DIR, 'import-audit.json');
const THUMBNAILS_DIR = join(OUTPUT_DIR, 'thumbnails');
const CONTACT_SHEETS_DIR = join(OUTPUT_DIR, 'contact-sheets');
const COMPARISON_REPORT_PATH = join(OUTPUT_DIR, 'comparison-vs-etapa3.json');
const THUMB_SIZE = 160;

// Catálogo ACTUAL (Etapa 3) — solo lectura, para comparar al final.
const CURRENT_MANIFEST_PATH = join('public', 'icons', 'manifest.json');
const CURRENT_AUDIT_PATH = join('public', 'icons', 'import-audit.json');

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

async function main(): Promise<void> {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(THUMBNAILS_DIR, { recursive: true });
  mkdirSync(CONTACT_SHEETS_DIR, { recursive: true });

  const categories: IconCategory[] = CATEGORY_DEFINITIONS.map(({ folder, name }, index) => ({
    id: slugify(folder),
    name,
    order: index,
    active: true,
  }));

  const icons: IconAsset[] = [];
  const auditRecords: AuditRecord[] = [];
  let totalFound = 0;

  for (let categoryIndex = 0; categoryIndex < CATEGORY_DEFINITIONS.length; categoryIndex++) {
    const { folder } = CATEGORY_DEFINITIONS[categoryIndex];
    const categoryId = categories[categoryIndex].id;
    const dir = join(ICONS_SOURCE_DIR, folder);
    const filenames = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
    totalFound += filenames.length;
    console.log(`### ${folder}: ${filenames.length} PDFs ###`);

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
        });

        if (classification.status === 'valid' && classification.normalizedD && classification.paintMode) {
          const mtime = statSync(fullPath).mtime.toISOString();
          const icon: IconAsset = {
            id: iconId,
            name: deriveName(filename),
            categoryId,
            svgPath: classification.normalizedD,
            paintMode: classification.paintMode,
            fillRule: classification.fillRule ?? 'nonzero',
            strokeWidth: classification.strokeWidth,
            order: iconOrderInCategory++,
            active: true,
            source: 'library',
            createdAt: mtime,
            updatedAt: mtime,
          };
          icons.push(icon);
          renderThumbnail(icon, join(THUMBNAILS_DIR, `${iconId}.png`));
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
        });
        console.log(`  [ERROR] ${filename} — ${(e as Error).message}`);
      }
    }
  }

  const manifest = { categories, icons };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(auditRecords, null, 2));

  // ---- Contact sheet GENERAL por categoría (todos los `valid`) ----
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

  // ---- Contact sheet de STROKE-ONLY (caso especial) ----
  const strokeOnlyEntries = icons
    .filter((icon) => icon.paintMode === 'stroke')
    .map((icon) => ({ label: `${icon.id} (w=${icon.strokeWidth?.toFixed(2)})`, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) }));
  await buildContactSheet(strokeOnlyEntries, join(CONTACT_SHEETS_DIR, 'stroke-only.png'), 6);

  // ---- Contact sheet de manual-review relacionados con paint type ----
  const paintRelatedReasonPattern = /trazo|fillRule|relleno|evenodd|nonzero/i;
  const paintManualReviewRecords = auditRecords.filter(
    (r) => r.status === 'manual-review' && r.reasons.some((reason) => paintRelatedReasonPattern.test(reason)),
  );

  // ---- Comparación contra el catálogo ACTUAL (Etapa 3) — solo lectura ----
  let comparison: unknown = { note: 'no se encontró public/icons/manifest.json actual para comparar' };
  if (existsSync(CURRENT_MANIFEST_PATH)) {
    const currentManifest = JSON.parse(readFileSync(CURRENT_MANIFEST_PATH, 'utf8')) as { icons: IconAsset[] };
    const currentAudit = existsSync(CURRENT_AUDIT_PATH)
      ? (JSON.parse(readFileSync(CURRENT_AUDIT_PATH, 'utf8')) as { status: string }[])
      : [];

    const currentById = new Map(currentManifest.icons.map((i) => [i.id, i]));
    const newById = new Map(icons.map((i) => [i.id, i]));

    const keptIds = [...newById.keys()].filter((id) => currentById.has(id));
    const newIds = [...newById.keys()].filter((id) => !currentById.has(id));
    const removedIds = [...currentById.keys()].filter((id) => !newById.has(id));

    let svgPathChanged = 0;
    let paintModeChanged = 0;
    let fillRuleChanged = 0;
    const svgPathChangedIds: string[] = [];
    const paintModeChangedIds: string[] = [];
    for (const id of keptIds) {
      const oldIcon = currentById.get(id)!;
      const newIcon = newById.get(id)!;
      if (oldIcon.svgPath !== newIcon.svgPath) { svgPathChanged++; svgPathChangedIds.push(id); }
      if (oldIcon.paintMode !== newIcon.paintMode) { paintModeChanged++; paintModeChangedIds.push(id); }
      if (oldIcon.fillRule !== newIcon.fillRule) fillRuleChanged++;
    }

    comparison = {
      previousValidCount: currentManifest.icons.length,
      newValidCount: icons.length,
      previousManualReviewCount: currentAudit.filter((r) => r.status === 'manual-review').length,
      newManualReviewCount: auditRecords.filter((r) => r.status === 'manual-review').length,
      keptIdsCount: keptIds.length,
      newIdsCount: newIds.length,
      removedIdsCount: removedIds.length,
      svgPathChangedCount: svgPathChanged,
      paintModeChangedCount: paintModeChanged,
      fillRuleChangedCount: fillRuleChanged,
      newIds,
      removedIds,
      svgPathChangedIds,
      paintModeChangedIds,
    };

    // Contact sheet de CAMBIOS (svgPath/paintMode/fillRule distintos)
    const changedIds = new Set([...svgPathChangedIds, ...paintModeChangedIds]);
    const changedEntries = icons
      .filter((icon) => changedIds.has(icon.id))
      .map((icon) => ({ label: icon.id, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) }));
    await buildContactSheet(changedEntries, join(CONTACT_SHEETS_DIR, 'cambios-vs-etapa3.png'));
  }
  writeFileSync(COMPARISON_REPORT_PATH, JSON.stringify(comparison, null, 2));

  // ---- Resumen en consola ----
  const validCount = auditRecords.filter((r) => r.status === 'valid').length;
  const reviewCount = auditRecords.filter((r) => r.status === 'manual-review').length;
  const errorCount = auditRecords.filter((r) => r.status === 'error').length;
  const fillCount = icons.filter((i) => i.paintMode === 'fill').length;
  const strokeCount = icons.filter((i) => i.paintMode === 'stroke').length;
  const nonzeroCount = icons.filter((i) => i.fillRule === 'nonzero').length;
  const evenoddCount = icons.filter((i) => i.fillRule === 'evenodd').length;

  console.log(`\n========== RESUMEN ETAPA 5 ==========`);
  console.log(`PDFs encontrados: ${totalFound}`);
  console.log(`procesados: ${auditRecords.length}`);
  console.log(`valid: ${validCount} | manual-review: ${reviewCount} | error: ${errorCount}`);
  console.log(`paintMode -> fill: ${fillCount} | stroke: ${strokeCount}`);
  console.log(`fillRule -> nonzero: ${nonzeroCount} | evenodd: ${evenoddCount}`);
  console.log(`manual-review relacionados con paint type: ${paintManualReviewRecords.length}`);
  console.log(`\npor categoría:`);
  for (const { folder } of CATEGORY_DEFINITIONS) {
    const catRecords = auditRecords.filter((r) => r.category === folder);
    const catValid = catRecords.filter((r) => r.status === 'valid').length;
    const catReview = catRecords.filter((r) => r.status === 'manual-review').length;
    const catError = catRecords.filter((r) => r.status === 'error').length;
    console.log(`  ${folder}: ${catRecords.length} -> ${catValid} valid, ${catReview} manual-review, ${catError} error`);
  }
  console.log(`\nmanifest -> ${MANIFEST_PATH}`);
  console.log(`auditoría -> ${AUDIT_REPORT_PATH}`);
  console.log(`comparación vs Etapa 3 -> ${COMPARISON_REPORT_PATH}`);
  console.log(`thumbnails -> ${THUMBNAILS_DIR}`);
  console.log(`contact sheets -> ${CONTACT_SHEETS_DIR}`);
  console.log(JSON.stringify(comparison, null, 2));
  console.log(`\n========== FIN ETAPA 5 ==========`);
}

void main();
