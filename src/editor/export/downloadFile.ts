/**
 * Descarga un archivo de texto generado en memoria — Etapa 10. Patrón
 * estándar de navegador (`Blob` + `URL.createObjectURL` + `<a download>`
 * sintético), sin ninguna dependencia nueva. El `Blob`/`<a>` nunca se
 * insertan en el DOM real de forma persistente ni se les asigna contenido
 * no controlado como `innerHTML` — el único dato que viaja es el propio
 * archivo ya generado (ver `designExporter.ts`, que nunca interpreta el
 * `d`/texto que recibe como markup).
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

/**
 * Descarga un `Blob` ya armado — Etapa 12B (agregado para el export PDF,
 * `pdfDocument.ts`/`jsPDF` entregan directamente un `Blob`, nunca un
 * string). Es el mismo mecanismo que ya usaba `downloadTextFile` (extraído
 * acá para que ambos lo compartan, en vez de duplicar el patrón
 * `createObjectURL` + `<a download>` + revocar-en-el-próximo-tick).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revocar en el próximo tick, no inmediatamente: algunos navegadores
  // procesan el click/descarga de forma asíncrona — revocar la URL antes
  // de que la terminen de leer rompería la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Nombre de archivo profesional para el diseño confirmado — Etapa 10.
 * Todavía no existe `orderId`/`lineItemId` (eso llega con la integración de
 * Tiendanube, fuera de alcance de esta etapa) — se usa la fecha (formato
 * `AAAA-MM-DD`, sin hora: alcanza para distinguir descargas de días
 * distintos, y es más legible que un timestamp completo) como identificador
 * local, tal como pedía explícitamente el pedido de esta etapa ("no
 * inventar todavía un número de pedido").
 */
export function buildExportFileName(extension: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `mateshop-diseno-${yyyy}-${mm}-${dd}.${extension}`;
}
