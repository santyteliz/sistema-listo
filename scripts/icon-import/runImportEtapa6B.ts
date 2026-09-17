/**
 * Curación visual — Etapa 6B (revisión visual completa de los 219 `valid`
 * post-Etapa 6A). Mismo pipeline exacto que `runImportEtapa5.ts` — la
 * ÚNICA diferencia funcional es que `importConfig.ts` ahora tiene 32
 * entradas nuevas en `VISUAL_QA_OVERRIDES` (agregadas en esta etapa,
 * nunca se tocó ninguna entrada de la Etapa 2). Nunca escribe en
 * `public/icons/` — todo el output va a un directorio de scratch nuevo.
 *
 * Además de manifest/audit/thumbnails/contact-sheets (igual que Etapa 5),
 * genera:
 *  - un contact sheet de `manual-review` (para revisar rápido qué quedó
 *    afuera y por qué);
 *  - un contact sheet de "cambios" — específicamente los íconos que eran
 *    `valid` en el catálogo de referencia de Etapa 5 y pasaron a
 *    `manual-review` acá (los 32 overrides nuevos, ordenados);
 *  - un reporte estructurado (`curation-report.json`) con el detalle de
 *    cada caso que cambió de estado: id, PDF, categoría, motivo.
 *
 * Correr: `node scripts/icon-import/runImportEtapa6B.ts`
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

const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa6b';
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');
const AUDIT_REPORT_PATH = join(OUTPUT_DIR, 'import-audit.json');
const CURATION_REPORT_PATH = join(OUTPUT_DIR, 'curation-report.json');
const THUMBNAILS_DIR = join(OUTPUT_DIR, 'thumbnails');
const CONTACT_SHEETS_DIR = join(OUTPUT_DIR, 'contact-sheets');
const THUMB_SIZE = 160;

// Catálogo de referencia — el resultado de Etapa 5 YA CON el fix de Etapa
// 6A (regenerado antes de esta curación) — solo lectura, para poder listar
// exactamente qué íconos cambiaron de estado en esta etapa.
const REFERENCE_MANIFEST_PATH = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-import-etapa5/manifest.json';

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
  // Thumbnails de los icons `manual-review` cuyo problema es de paint type
  // o revisión visual — para el contact sheet de manual-review completo,
  // se necesita renderizar igual (aunque no entren al manifest final).
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

        // Para el contact sheet de manual-review: si el clasificador
        // automático (SIN el override) igual hubiera producido geometría
        // normalizable, la renderizamos igual — así se puede ver POR QUÉ
        // se descartó un caso, no solo leer el motivo en texto.
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
            renderThumbnail(previewIcon, join(THUMBNAILS_DIR, `${iconId}.png`));
          } else if (overrideReason) {
            // manual-review por override visual -- renderizamos igual para el contact sheet de revisión.
            manualReviewThumbInfo.push({ icon: previewIcon, category: folder });
            renderThumbnail(previewIcon, join(THUMBNAILS_DIR, `_review-${iconId}.png`));
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
        });
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
  // General (las 5 categorías juntas)
  await buildContactSheet(
    icons.map((icon) => ({ label: icon.id, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) })),
    join(CONTACT_SHEETS_DIR, 'general.png'),
    12,
  );

  // ---- Contact sheet de MANUAL-REVIEW (solo los que sí tenían geometría renderizable) ----
  await buildContactSheet(
    manualReviewThumbInfo.map(({ icon, category }) => ({
      label: `${category}/${icon.id}`,
      thumbPath: join(THUMBNAILS_DIR, `_review-${icon.id}.png`),
    })),
    join(CONTACT_SHEETS_DIR, 'manual-review.png'),
    10,
  );

  // ---- Comparación contra el catálogo de REFERENCIA (Etapa 5 post-6A) ----
  const curationChanges: { id: string; category: string; filename: string; previousStatus: string; newStatus: string; overrideReason: string }[] = [];
  if (existsSync(REFERENCE_MANIFEST_PATH)) {
    const referenceManifest = JSON.parse(readFileSync(REFERENCE_MANIFEST_PATH, 'utf8')) as { icons: IconAsset[] };
    const referenceValidIds = new Set(referenceManifest.icons.map((i) => i.id));
    const newValidIds = new Set(icons.map((i) => i.id));

    for (const record of auditRecords) {
      if (!record.iconId) continue;
      const wasValid = referenceValidIds.has(record.iconId);
      const isValid = newValidIds.has(record.iconId);
      if (wasValid && !isValid) {
        const overrideKey = `${record.category}/${record.filename}`;
        curationChanges.push({
          id: record.iconId,
          category: record.category,
          filename: record.filename,
          previousStatus: 'valid',
          newStatus: 'manual-review',
          overrideReason: VISUAL_QA_OVERRIDES[overrideKey] ?? '(motivo no encontrado)',
        });
      } else if (!wasValid && isValid) {
        curationChanges.push({
          id: record.iconId,
          category: record.category,
          filename: record.filename,
          previousStatus: 'manual-review-o-error',
          newStatus: 'valid',
          overrideReason: '(inesperado — no debería pasar en esta etapa, ver informe)',
        });
      }
    }

    writeFileSync(CURATION_REPORT_PATH, JSON.stringify(curationChanges, null, 2));

    // Contact sheet de CAMBIOS (los que pasaron de valid a manual-review)
    const changedEntries = curationChanges
      .filter((c) => c.newStatus === 'manual-review')
      .map((c) => ({ label: c.id, thumbPath: join(THUMBNAILS_DIR, `_review-${c.id}.png`) }));
    await buildContactSheet(changedEntries, join(CONTACT_SHEETS_DIR, 'cambios-vs-etapa5.png'));
  }

  const validCount = auditRecords.filter((r) => r.status === 'valid').length;
  const reviewCount = auditRecords.filter((r) => r.status === 'manual-review').length;
  const errorCount = auditRecords.filter((r) => r.status === 'error').length;

  console.log(`\n========== RESUMEN ETAPA 6B ==========`);
  console.log(`PDFs encontrados: ${totalFound} | procesados: ${auditRecords.length}`);
  console.log(`valid: ${validCount} | manual-review: ${reviewCount} | error: ${errorCount}`);
  console.log(`cambios vs. referencia Etapa 5 (valid -> manual-review): ${curationChanges.filter((c) => c.newStatus === 'manual-review').length}`);
  console.log(`por categoría:`);
  for (const { folder } of CATEGORY_DEFINITIONS) {
    const catRecords = auditRecords.filter((r) => r.category === folder);
    const catValid = catRecords.filter((r) => r.status === 'valid').length;
    const catReview = catRecords.filter((r) => r.status === 'manual-review').length;
    console.log(`  ${folder}: ${catRecords.length} -> ${catValid} valid, ${catReview} manual-review`);
  }
  console.log(`\nmanifest -> ${MANIFEST_PATH}`);
  console.log(`auditoría -> ${AUDIT_REPORT_PATH}`);
  console.log(`reporte de curación -> ${CURATION_REPORT_PATH}`);
  console.log(`thumbnails -> ${THUMBNAILS_DIR}`);
  console.log(`contact sheets -> ${CONTACT_SHEETS_DIR}`);
  console.log(`\n========== FIN ETAPA 6B ==========`);
}

void main();
