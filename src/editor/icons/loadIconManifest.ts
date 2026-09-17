import type { IconAsset, IconCategory } from './iconCatalog';

/**
 * Carga del catálogo REAL de íconos (Etapa 3) — lee
 * `public/icons/manifest.json`, generado offline por el importador de la
 * Etapa 2 (`scripts/icon-import/runImport.ts`). Contiene únicamente los 235
 * `IconAsset` con `status: 'valid'` de las 5 categorías reales (`animales`,
 * `escudos`, `futbol`, `random`, `signos`) — `diseños`, `manual-review` y
 * `error` nunca llegan acá (ver el informe de la Etapa 2).
 *
 * Deliberadamente separado de `iconCatalog.ts` (que solo define los TIPOS y
 * el catálogo legacy de 6 íconos, sin fetch ni I/O): este archivo es la
 * única pieza del editor que sabe que el catálogo real vive en un archivo
 * estático, y no toca Fabric.js en ningún momento — devuelve datos puros.
 */

export interface IconManifest {
  categories: IconCategory[];
  icons: IconAsset[];
}

const MANIFEST_URL = '/icons/manifest.json';

/**
 * Construye la URL pública de la miniatura de un ícono. Por convención del
 * importador (`runImport.ts`), el nombre de archivo del thumbnail es
 * siempre `${icon.id}.png` dentro de `public/icons/thumbnails/` — no hace
 * falta que el manifest incluya un campo `thumbnailUrl` explícito por
 * ícono (evita duplicar el dato y evita tener que volver a correr el
 * importador de la Etapa 2 solo para agregarlo).
 */
export function getIconThumbnailUrl(icon: IconAsset): string {
  return `/icons/thumbnails/${icon.id}.png`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validación mínima de forma (no un schema validator completo — no hace
 * falta una dependencia nueva para esto): confirma que lo que llegó tiene
 * al menos los arrays esperados con objetos que parecen `IconCategory`/
 * `IconAsset`, para no reventar en un `.map()` más adelante si el archivo
 * estático estuviera corrupto o vacío. No revalida cada campo en detalle
 * (eso ya lo garantiza el importador de la Etapa 2 al generarlo).
 */
export function isValidManifestShape(value: unknown): value is IconManifest {
  if (!isPlainObject(value)) {
    return false;
  }
  const { categories, icons } = value;
  if (!Array.isArray(categories) || !Array.isArray(icons)) {
    return false;
  }
  return (
    categories.every((c) => isPlainObject(c) && typeof c.id === 'string' && typeof c.name === 'string') &&
    icons.every((i) => isPlainObject(i) && typeof i.id === 'string' && typeof i.svgPath === 'string' && typeof i.categoryId === 'string')
  );
}

let cachedManifestPromise: Promise<IconManifest> | null = null;

/**
 * Descarga y cachea el manifest en memoria — una sola petición de red por
 * carga de la aplicación, sin importar cuántas veces se abra/cierre el
 * drawer (ver `useIconCatalog.ts`, que es quien realmente llama a esto
 * desde componentes de React).
 */
export function loadIconManifest(): Promise<IconManifest> {
  if (!cachedManifestPromise) {
    cachedManifestPromise = fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar el catálogo de íconos (HTTP ${response.status}).`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!isValidManifestShape(data)) {
          throw new Error('El catálogo de íconos tiene un formato inesperado.');
        }
        return data;
      })
      .catch((error: unknown) => {
        // Si la carga falla, no queda una promesa rota cacheada para
        // siempre — un reintento (ej. reabrir el drawer) vuelve a pedirlo.
        cachedManifestPromise = null;
        throw error instanceof Error ? error : new Error('Error desconocido al cargar el catálogo de íconos.');
      });
  }
  return cachedManifestPromise;
}
