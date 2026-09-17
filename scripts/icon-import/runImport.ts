/**
 * Importador completo — Etapa 2 (versión final, criterio "un solo diseño
 * simple" aprobado). Procesa las 5 categorías reales del cliente
 * (`diseños` queda completamente excluida, ver `CATEGORIES` abajo — ni
 * siquiera se lee esa carpeta), clasifica cada PDF con `classifyIcon.ts`,
 * y arma:
 *  - `public/icons/manifest.json` — SOLO los `valid`, listo para que una
 *    etapa futura (todavía sin implementar) lo consuma desde el editor;
 *  - un reporte de auditoría JSON con TODOS los archivos (valid + manual-
 *    review + error), con las métricas que llevaron a cada decisión;
 *  - thumbnails PNG de cada ícono `valid`;
 *  - un contact sheet por categoría, para la revisión visual final.
 *
 * Determinístico: mismo PDF en disco -> mismo id, mismo name, mismo
 * order, mismo createdAt/updatedAt (se usa la fecha de modificación real
 * del archivo en disco, no `Date.now()` — así dos corridas seguidas, sin
 * tocar los PDFs, producen exactamente el mismo manifest byte a byte,
 * ver la verificación de idempotencia en el informe).
 *
 * NO modifica nada de `src/` (salvo lo ya hecho en `normalizeIconPath.ts`
 * en el paso anterior), no conecta el manifest al editor.
 *
 * Correr: `node scripts/icon-import/runImport.ts`
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon, type IconClassification } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { ICONS_SOURCE_DIR, CATEGORY_DEFINITIONS, VISUAL_QA_OVERRIDES, deriveName, deriveIconId } from './importConfig.ts';
import { slugify } from './slug.ts';
import type { IconAsset, IconCategory } from '../../src/editor/icons/iconCatalog.ts';

const MANIFEST_DIR = join('public', 'icons');
const MANIFEST_PATH = join(MANIFEST_DIR, 'manifest.json');
const AUDIT_REPORT_PATH = join(MANIFEST_DIR, 'import-audit.json');
const THUMBNAILS_DIR = join(MANIFEST_DIR, 'thumbnails');
const CONTACT_SHEETS_DIR = join(MANIFEST_DIR, 'contact-sheets');
const THUMB_SIZE = 160;

interface AuditRecord {
  category: string;
  filename: string;
  iconId: string | null;
  status: 'valid' | 'manual-review' | 'error';
  reasons: string[];
  metrics: IconClassification['metrics'] | null;
  errorMessage: string | null;
}

/**
 * Delegación fina a `renderIconCanvas.ts` (Etapa 4) — este archivo ya NO
 * decide por su cuenta cómo pintar un ícono (antes: siempre relleno negro
 * sólido, `nonzero`, sin importar el diseño real — la causa raíz de que el
 * thumbnail no coincidiera con Fabric). Firma mantenida por compatibilidad
 * con el resto de este archivo (recibe el `IconAsset` recién armado, no
 * solo el `d`).
 */
function renderThumbnail(icon: Pick<IconAsset, 'svgPath' | 'paintMode' | 'fillRule' | 'strokeWidth'>, outPath: string): void {
  writeFileSync(outPath, renderIconToPngBuffer(icon, THUMB_SIZE));
}

async function buildContactSheet(entries: { label: string; thumbPath: string }[], outPath: string): Promise<void> {
  const cols = 10;
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
    } catch {
      // ver pilotSample.ts — no bloquea el resto del contact sheet.
    }
    ctx.strokeStyle = '#dddddd';
    ctx.strokeRect(x, y, THUMB_SIZE, THUMB_SIZE);
    ctx.fillStyle = '#333333';
    ctx.font = '10px sans-serif';
    ctx.fillText(entry.label, x, y + THUMB_SIZE + 12, THUMB_SIZE);
  }

  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function main(): Promise<void> {
  // Thumbnails y contact sheets son enteramente DERIVADOS (se reconstruyen
  // completos en cada corrida a partir del manifest recién calculado) —
  // se limpian primero para que un archivo que pasó a `manual-review` en
  // esta corrida (por override de revisión visual, o porque cambió el PDF
  // de origen) no deje un thumbnail viejo huérfano dando vueltas.
  rmSync(THUMBNAILS_DIR, { recursive: true, force: true });
  rmSync(CONTACT_SHEETS_DIR, { recursive: true, force: true });
  mkdirSync(MANIFEST_DIR, { recursive: true });
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
    console.log(`\n### ${folder}: ${filenames.length} PDFs ###`);

    let iconOrderInCategory = 0;
    for (const filename of filenames) {
      const fullPath = join(dir, filename);
      const iconId = deriveIconId(categoryId, filename);
      try {
        const bytes = new Uint8Array(readFileSync(fullPath));
        const extraction = await extractPathFromPdf(bytes);
        const automaticClassification = classifyIcon(extraction);

        // Override de la revisión visual final — ver `VISUAL_QA_OVERRIDES`
        // arriba. Nunca cambia geometría, nunca "arregla" nada: solo puede
        // DEGRADAR un `valid` automático a `manual-review` (nunca al
        // revés) cuando la inspección de los contact sheets encontró un
        // problema real que el clasificador automático no vio.
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
        });

        if (classification.status === 'valid' && classification.normalizedD && classification.paintMode) {
          const mtime = statSync(fullPath).mtime.toISOString();
          const icon: IconAsset = {
            id: iconId,
            name: deriveName(filename),
            categoryId,
            svgPath: classification.normalizedD,
            // Etapa 4 — ya NO se asume relleno/trazo fijo: viene de la
            // composición real del PDF (ver `classifyIcon.ts`/
            // `composeIconGeometry.ts`).
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

        const tag = classification.status === 'valid' ? 'valid' : 'REVIEW';
        console.log(`  [${tag}] ${filename}`);
      } catch (e) {
        auditRecords.push({
          category: folder,
          filename,
          iconId,
          status: 'error',
          reasons: [],
          metrics: null,
          errorMessage: (e as Error).message,
        });
        console.log(`  [ERROR] ${filename} — ${(e as Error).message}`);
      }
    }
  }

  // ---- Manifest (solo `valid`) ----
  const manifest = { categories, icons };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // ---- Auditoría completa (valid + manual-review + error) ----
  writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(auditRecords, null, 2));

  // ---- Contact sheets por categoría (todos los `valid`) ----
  for (let categoryIndex = 0; categoryIndex < CATEGORY_DEFINITIONS.length; categoryIndex++) {
    const { folder } = CATEGORY_DEFINITIONS[categoryIndex];
    const categoryId = categories[categoryIndex].id;
    const entries = icons
      .filter((icon) => icon.categoryId === categoryId)
      .map((icon) => ({ label: icon.name, thumbPath: join(THUMBNAILS_DIR, `${icon.id}.png`) }));
    if (entries.length > 0) {
      await buildContactSheet(entries, join(CONTACT_SHEETS_DIR, `${folder}.png`));
      console.log(`contact sheet -> ${join(CONTACT_SHEETS_DIR, `${folder}.png`)}`);
    }
  }

  // ---- Resumen en consola ----
  const validCount = auditRecords.filter((r) => r.status === 'valid').length;
  const reviewCount = auditRecords.filter((r) => r.status === 'manual-review').length;
  const errorCount = auditRecords.filter((r) => r.status === 'error').length;
  console.log(`\n========== RESUMEN ==========`);
  console.log(`PDFs encontrados: ${totalFound}`);
  console.log(`procesados: ${auditRecords.length}`);
  console.log(`valid: ${validCount}`);
  console.log(`manual-review: ${reviewCount}`);
  console.log(`error: ${errorCount}`);
  console.log(`IconAsset finales en el manifest: ${icons.length}`);
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
  console.log(`thumbnails -> ${THUMBNAILS_DIR}`);
  console.log(`contact sheets -> ${CONTACT_SHEETS_DIR}`);
  console.log(`\n========== FIN DE LA IMPORTACIÓN ==========`);
}

void main();
