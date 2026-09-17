/**
 * Slugify determinístico para ids/slugs del importador de íconos (Etapa 2).
 * Nunca aleatorio, nunca depende de la hora — el mismo texto de entrada
 * siempre produce el mismo slug (requisito de idempotencia, Paso 12 del
 * pedido: correr el importador dos veces sin tocar los PDFs tiene que dar
 * el mismo catálogo).
 *
 * Estrategia: Unicode NFD (descompone cada letra acentuada en su letra base
 * + una marca diacrítica separada — "Ñ" se descompone en "N" + una marca de
 * tilde combinante aparte) y después descarta esa marca (rango Unicode
 * U+0300-U+036F, "Combining Diacritical Marks", escrito como escape
 * explícito `̀-ͯ` para que sea inequívoco sin importar la
 * codificación con la que se abra este archivo) — así "Diseños" pasa a
 * "disenos" sin necesitar un mapa manual de caracteres especiales. Cualquier
 * otro carácter que no sea ASCII alfanumérico se reemplaza por un guion,
 * colapsando repeticiones.
 */
export function slugify(text: string): string {
  const withoutDiacritics = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
