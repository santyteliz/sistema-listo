/**
 * Muestra de validación — Etapa 6A (corrección puntual del bug de
 * cancelación evenodd en rellenos duplicados, detectado en la Etapa 5).
 * Corre el pipeline YA CORREGIDO (`composeIconGeometry.ts` con el Caso F
 * nuevo) sobre los 5 PDFs pedidos explícitamente — nunca escribe en
 * `public/icons/`, todo el output va a un directorio de scratch nuevo.
 *
 * Usa `renderIconToPngBuffer` (`renderIconCanvas.ts`) — el MISMO renderer
 * compartido que usará el catálogo real — para los thumbnails, ninguna
 * lógica de pintado propia acá.
 *
 * Correr: `node scripts/icon-import/sampleEtapa6A.ts`
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractPathFromPdf } from './pdfToPaths.ts';
import { classifyIcon, type IconClassification } from './classifyIcon.ts';
import { renderIconToPngBuffer } from './renderIconCanvas.ts';
import { slugify } from './slug.ts';
import type { IconAsset } from '../../src/editor/icons/iconCatalog.ts';

const ICONS_SOURCE_DIR = 'C:/Users/benja/OneDrive/Desktop/iconospdf';
const OUTPUT_DIR = 'C:/Users/benja/AppData/Local/Temp/claude/c--Users-benja-OneDrive-Desktop-Web-Mates/0b834bf6-c0e9-48b8-b01b-53e59714a03d/scratchpad/icon-sample-etapa6a';
const THUMB_SIZE = 240;

const SAMPLE_FILES: { category: string; filename: string }[] = [
  { category: 'random', filename: 'RANDOM_04.pdf' },
  { category: 'escudos', filename: 'Escudo_07.pdf' },
  { category: 'futbol', filename: 'FUTBOL_13.pdf' },
  { category: 'animales', filename: 'ANIMALES_02.pdf' },
  { category: 'random', filename: 'RANDOM_103.pdf' },
];

async function main(): Promise<void> {
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('========== MUESTRA ETAPA 6A ==========\n');

  for (const { category, filename } of SAMPLE_FILES) {
    console.log(`--- ${category}/${filename} ---`);
    const fullPath = join(ICONS_SOURCE_DIR, category, filename);
    const bytes = new Uint8Array(readFileSync(fullPath));

    const extraction = await extractPathFromPdf(bytes);
    const classification: IconClassification = classifyIcon(extraction);

    console.log('status:', classification.status);
    if (classification.reasons.length > 0) console.log('reasons:', classification.reasons);
    console.log(
      'metrics.paintMode:', classification.metrics.paintMode,
      '| discardedRedundantStrokeCount:', classification.metrics.discardedRedundantStrokeCount,
    );

    if (classification.status === 'valid' && classification.normalizedD && classification.paintMode) {
      const id = `${slugify(category)}-${slugify(filename.replace(/\.pdf$/i, ''))}`;
      const icon: IconAsset = {
        id,
        name: filename.replace(/\.pdf$/i, '').replace(/_/g, ' '),
        categoryId: slugify(category),
        svgPath: classification.normalizedD,
        paintMode: classification.paintMode,
        fillRule: classification.fillRule ?? 'nonzero',
        strokeWidth: classification.strokeWidth,
        order: 0,
        active: true,
        source: 'library',
        createdAt: statSync(fullPath).mtime.toISOString(),
        updatedAt: statSync(fullPath).mtime.toISOString(),
      };
      console.log('paintMode:', icon.paintMode, '| fillRule:', icon.fillRule, '| strokeWidth:', icon.strokeWidth);

      const pngBuffer = renderIconToPngBuffer(icon, THUMB_SIZE);
      const thumbPath = join(OUTPUT_DIR, `${id}.png`);
      writeFileSync(thumbPath, pngBuffer);

      // Verificación de contenido real (no en blanco) — decodifica el PNG y
      // cuenta píxeles no-blancos, mismo método usado para detectar el bug
      // original en la Etapa 5.
      const img = await loadImage(pngBuffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++;
      }
      const ratio = nonWhite / (img.width * img.height);
      console.log(`thumbnail -> ${thumbPath} (${(ratio * 100).toFixed(2)}% de píxeles no-blancos)`);
      console.log(ratio === 0 ? '  ⚠ EN BLANCO' : '  ✓ tiene contenido visible');
    } else {
      console.log('(sin thumbnail — no quedó `valid`)');
    }
    console.log('');
  }

  console.log('========== FIN DE LA MUESTRA — output en:', OUTPUT_DIR, '==========');
}

void main();
