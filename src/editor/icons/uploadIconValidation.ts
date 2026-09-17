/**
 * Validación de archivo para la carga de íconos propios — Etapa 8B.
 * Chequeos rápidos, ANTES de leer/parsear el contenido (tamaño, extensión,
 * tipo MIME) — la validación real y definitiva de si el CONTENIDO es un
 * SVG utilizable la hace `svgIconExtractor.ts` (`extractIconFromSvg`), que
 * es la única autoridad real: si el MIME reportado por el navegador es
 * inconsistente (pasa seguido con `.svg` — algunos sistemas operativos/
 * navegadores lo reportan vacío o como `text/xml`) pero el archivo tiene
 * extensión `.svg`, este módulo lo deja pasar para que el contenido decida
 * — nunca rechaza solo por el MIME si la extensión ya es coherente.
 *
 * Nunca expone mensajes técnicos: todos los mensajes de acá ya son los que
 * se muestran directo al usuario.
 */

/** 5 MB — un ícono SVG legítimo nunca necesita más; ver el pedido de esta etapa. */
export const MAX_SVG_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Tipos MIME que un navegador puede reportar razonablemente para un
 * archivo `.svg` — varía bastante según sistema operativo/navegador
 * (Windows sin asociación de tipo suele mandar `''`).
 */
const PLAUSIBLE_SVG_MIME_TYPES = new Set(['image/svg+xml', 'text/xml', 'application/xml', '']);

export type FileValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Validación de un `File` ANTES de leer su contenido. Pensada para poder
 * cortar rápido (sin gastar tiempo leyendo/parseando) archivos que
 * evidentemente no son un SVG — pero es deliberadamente laxa en el MIME:
 * si la extensión es `.svg`, se deja pasar aunque el MIME no sea el
 * esperado (la Etapa 8B pide explícitamente priorizar el contenido real
 * sobre el MIME cuando son inconsistentes).
 */
export function validateUploadedIconFile(file: File): FileValidationResult {
  if (file.size === 0) {
    return { ok: false, message: 'No pudimos leer este SVG.' };
  }
  if (file.size > MAX_SVG_FILE_SIZE_BYTES) {
    return { ok: false, message: 'El archivo es demasiado grande.' };
  }
  const hasSvgExtension = /\.svg$/i.test(file.name ?? '');
  const mimeLooksLikeSvg = PLAUSIBLE_SVG_MIME_TYPES.has((file.type ?? '').toLowerCase());
  if (!hasSvgExtension && !mimeLooksLikeSvg) {
    return { ok: false, message: 'El archivo debe ser SVG.' };
  }
  return { ok: true };
}

/**
 * Traduce cualquier error de lectura de archivo (ej. `file.text()` falla
 * por un motivo de bajo nivel) a un mensaje amigable — nunca se muestra el
 * error técnico original al usuario.
 */
export function friendlyReadErrorMessage(): string {
  return 'No pudimos leer este SVG.';
}
