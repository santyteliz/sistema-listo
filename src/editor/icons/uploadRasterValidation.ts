/**
 * Validación de archivo para la carga de íconos raster (PNG/WebP) — Etapa
 * 9E. Mismo criterio que `uploadIconValidation.ts` (SVG): chequeos rápidos
 * ANTES de leer/decodificar el contenido (tamaño, extensión, tipo MIME) —
 * separado a propósito en su propio archivo, en vez de generalizar
 * `uploadIconValidation.ts`, porque esta etapa decidió que el cargador
 * público deja de aceptar SVG (pasa a aceptar únicamente PNG/WebP): mezclar
 * los dos hubiera significado tocar un archivo protegido de esta etapa sin
 * necesidad real (los criterios de validación — mensajes, límites,
 * extensiones — son distintos para cada formato).
 *
 * Nunca expone mensajes técnicos: todos los mensajes de acá ya son los que
 * se muestran directo al usuario.
 */

/** 10 MB — punto de partida deliberadamente conservador para esta primera integración (ver el pedido de esta etapa); los límites de ancho/alto/píxeles de la imagen YA DECODIFICADA viven en `rasterIconExtractor.ts` (solo se conocen después de decodificar). */
export const MAX_RASTER_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.png', '.webp'] as const;

/** Tipo MIME esperado para cada extensión aceptada — a diferencia del SVG (donde el MIME real varía mucho entre sistemas, ver `uploadIconValidation.ts`), PNG/WebP tienen un MIME estándar bien soportado; igual se tolera un MIME vacío (común quiando el sistema operativo no tiene una asociación de tipo configurada). */
const EXTENSION_MIME_TYPES: Record<(typeof ACCEPTED_EXTENSIONS)[number], string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export type FileValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Validación de un `File` ANTES de decodificar su contenido. A diferencia
 * de `validateUploadedIconFile` (SVG, deliberadamente laxa en el MIME), acá
 * SÍ se rechaza una extensión válida con un MIME claramente inconsistente
 * (ej. `.png` con `image/jpeg`) — señal real de un archivo mal etiquetado —
 * pero sigue tolerando un MIME vacío o genérico, que es un caso legítimo y
 * común (Windows sin asociación de tipo, ver el mismo comentario en
 * `uploadIconValidation.ts`).
 */
export function validateUploadedRasterFile(file: File): FileValidationResult {
  if (file.size === 0) {
    return { ok: false, message: 'No pudimos leer esta imagen.' };
  }
  if (file.size > MAX_RASTER_UPLOAD_FILE_SIZE_BYTES) {
    // Etapa 9G: el mensaje incluye el número real (derivado de la misma
    // constante que ya usa `UPLOAD_FORMAT_HINT`, nunca repetido a mano) en
    // vez de un genérico "es demasiado grande" — así queda autocontenido,
    // sin depender de que el usuario haya leído el hint estático de arriba.
    return { ok: false, message: `El archivo supera el máximo de ${MAX_RASTER_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} MB.` };
  }
  const name = (file.name ?? '').toLowerCase();
  const extension = ACCEPTED_EXTENSIONS.find((ext) => name.endsWith(ext));
  if (!extension) {
    return { ok: false, message: 'El archivo debe ser PNG o WebP.' };
  }
  const mime = (file.type ?? '').toLowerCase();
  const expectedMime = EXTENSION_MIME_TYPES[extension];
  if (mime !== '' && mime !== expectedMime) {
    return { ok: false, message: 'El archivo debe ser PNG o WebP.' };
  }
  return { ok: true };
}

/** Traduce cualquier error de decodificación de bajo nivel a un mensaje amigable — nunca se muestra el error técnico original al usuario. */
export function friendlyReadErrorMessage(): string {
  return 'No pudimos leer esta imagen.';
}
