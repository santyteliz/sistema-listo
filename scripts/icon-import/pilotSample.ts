/**
 * Piloto de MUESTRA — Etapa 2, ajuste de criterio "un solo diseño simple".
 * Corre el pipeline completo (extracción → clasificación → normalización)
 * sobre una muestra representativa de las 5 categorías REALES (nunca
 * `diseños`, eliminada del proyecto por pedido explícito) y genera:
 *  - un reporte en consola (resumen + detalle por archivo);
 *  - un JSON con las métricas de auditoría de cada archivo de la muestra;
 *  - thumbnails PNG de cada resultado `valid`;
 *  - un contact sheet por categoría para inspección visual rápida.
 *
 * NO escribe el manifest final ni toca `src/` — es solo para validar el
 * criterio antes de correr la importación completa de las 5 categorías.
 *
 * Correr: `node scripts/icon-import/pilotSample.ts`
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, Path2D, loadImage } from '@napi-rs/canvas';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon, type IconClassification } from './classifyIcon.ts';

const ICONS_SOURCE_DIR = 'C:/Users/benja/OneDrive/Desktop/iconospdf';
const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-pilot-sample';

// `diseños` queda deliberadamente FUERA de esta lista — eliminada del
// proyecto por pedido explícito del usuario, no se procesa ni se analiza.
const CATEGORIES = ['animales', 'escudos', 'futbol', 'random', 'signos'] as const;

const SAMPLE_SIZE_PER_CATEGORY = 12;
const THUMB_SIZE = 160;

interface FileReport {
  category: string;
  filename: string;
  classification: IconClassification | null;
  error: string | null;
}

/** Elige una muestra distribuida a lo largo de la carpeta (no solo los primeros N) — más representativa que tomar siempre el principio del rango. */
function pickSample(files: string[], size: number): string[] {
  if (files.length <= size) return files;
  const sorted = [...files].sort();
  const step = sorted.length / size;
  const picked: string[] = [];
  for (let i = 0; i < size; i++) {
    picked.push(sorted[Math.floor(i * step)]);
  }
  return picked;
}

function renderThumbnail(d: string, outPath: string): void {
  const canvas = createCanvas(THUMB_SIZE, THUMB_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  ctx.fillStyle = '#000000';
  ctx.save();
  ctx.scale(THUMB_SIZE / 100, THUMB_SIZE / 100);
  ctx.fill(new Path2D(d));
  ctx.restore();
  writeFileSync(outPath, canvas.toBuffer('image/png'));
}

async function buildContactSheet(entries: { label: string; thumbPath: string }[], outPath: string): Promise<void> {
  const cols = 8;
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
      // `new Image() + .src = buffer` seguido de `drawImage` inmediato NO
      // dibuja nada en `@napi-rs/canvas` (probado y confirmado: no tira
      // error, pero el destino queda en blanco) — `loadImage(buffer)`
      // (async, esperado con `await`) sí funciona. Detalle de esta
      // librería puntual, no afecta en nada a los thumbnails individuales
      // en sí (esos ya están bien en disco) ni al pipeline de íconos.
      const img = await loadImage(readFileSync(entry.thumbPath));
      ctx.drawImage(img, x, y, THUMB_SIZE, THUMB_SIZE);
    } catch {
      // si falla dibujar una miniatura puntual, se sigue con el resto —
      // el contact sheet es una herramienta de inspección, no algo que
      // deba bloquearse por un archivo.
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
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const reports: FileReport[] = [];

  for (const category of CATEGORIES) {
    const dir = join(ICONS_SOURCE_DIR, category);
    const allFiles = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));
    const sample = pickSample(allFiles, SAMPLE_SIZE_PER_CATEGORY);
    console.log(`\n### ${category}: ${allFiles.length} archivos reales, muestra de ${sample.length} ###`);

    for (const filename of sample) {
      const fullPath = join(dir, filename);
      try {
        const bytes = new Uint8Array(readFileSync(fullPath));
        const extraction = await extractPathFromPdf(bytes);
        const classification = classifyIcon(extraction);
        reports.push({ category, filename, classification, error: null });

        const statusTag = classification.status === 'valid' ? 'VALID' : 'REVIEW';
        console.log(
          `  [${statusTag}] ${filename} — subpaths=${classification.metrics.subpathCount} comandos=${classification.metrics.commandCount} grupos_significativos=${classification.metrics.significantClusterCount} (crudos=${classification.metrics.rawClusterCount})` +
          (classification.reasons.length ? ` — ${classification.reasons.join(' | ')}` : ''),
        );

        if (classification.status === 'valid' && classification.normalizedD) {
          const thumbPath = join(OUTPUT_DIR, `${category}-${filename.replace(/\.pdf$/i, '')}.png`);
          renderThumbnail(classification.normalizedD, thumbPath);
        }
      } catch (e) {
        reports.push({ category, filename, classification: null, error: (e as Error).message });
        console.log(`  [ERROR] ${filename} — ${(e as Error).message}`);
      }
    }
  }

  // Resumen
  const total = reports.length;
  const valid = reports.filter((r) => r.classification?.status === 'valid').length;
  const review = reports.filter((r) => r.classification?.status === 'manual-review').length;
  const errors = reports.filter((r) => r.error !== null).length;
  console.log(`\n========== RESUMEN DE LA MUESTRA ==========`);
  console.log(`total analizados: ${total}`);
  console.log(`valid: ${valid} (${((valid / total) * 100).toFixed(0)}%)`);
  console.log(`manual-review: ${review} (${((review / total) * 100).toFixed(0)}%)`);
  console.log(`error: ${errors}`);

  console.log(`\npor categoría:`);
  for (const category of CATEGORIES) {
    const catReports = reports.filter((r) => r.category === category);
    const catValid = catReports.filter((r) => r.classification?.status === 'valid').length;
    const catReview = catReports.filter((r) => r.classification?.status === 'manual-review').length;
    const catError = catReports.filter((r) => r.error !== null).length;
    console.log(`  ${category}: ${catReports.length} muestreados -> ${catValid} valid, ${catReview} manual-review, ${catError} error`);
  }

  // Motivos de manual-review, agrupados
  const reasonCounts = new Map<string, number>();
  for (const r of reports) {
    if (r.classification?.status === 'manual-review') {
      for (const reason of r.classification.reasons) {
        const key = reason.replace(/\d+/g, 'N').split(' — ')[0].slice(0, 60);
        reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
      }
    }
  }
  console.log(`\nmotivos de manual-review (agrupados):`);
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x — ${reason}`);
  }

  // JSON de auditoría completo
  const reportPath = join(OUTPUT_DIR, 'pilot-sample-report.json');
  writeFileSync(reportPath, JSON.stringify(reports, null, 2));
  console.log(`\nreporte JSON completo -> ${reportPath}`);

  // Contact sheet por categoría (solo los valid con thumbnail generado)
  for (const category of CATEGORIES) {
    const entries = reports
      .filter((r) => r.category === category && r.classification?.status === 'valid')
      .map((r) => ({
        label: r.filename.replace(/\.pdf$/i, ''),
        thumbPath: join(OUTPUT_DIR, `${category}-${r.filename.replace(/\.pdf$/i, '')}.png`),
      }));
    if (entries.length > 0) {
      const sheetPath = join(OUTPUT_DIR, `contact-sheet-${category}.png`);
      await buildContactSheet(entries, sheetPath);
      console.log(`contact sheet -> ${sheetPath}`);
    }
  }

  console.log(`\n========== FIN DEL PILOTO DE MUESTRA ==========`);
}

void main();
