import type { IconAsset } from './iconCatalog';

/**
 * Lógica pura de búsqueda/agrupación del catálogo (Etapa 3) — separada de
 * `useIconCatalog.ts` (que sí importa React) para poder probarla con
 * `node --test` sin necesitar una librería de testing de componentes, igual
 * que el resto de los archivos de este proyecto que corren pruebas sin
 * dependencias nuevas (ver `normalizeIconPath.test.ts`, Etapa 1).
 */

/** Quita diacríticos (acentos) y normaliza mayúsculas/espacios — mismo enfoque conceptual que `scripts/icon-import/slug.ts`, reescrito acá porque ese archivo es una herramienta de build offline, no pensada para el bundle del navegador. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Búsqueda global por nombre, insensible a mayúsculas/minúsculas y a
 * acentos. Query vacía o solo espacios → todos los íconos, sin filtrar
 * (mismo criterio que usa el resto del editor para "sin filtro activo").
 */
export function searchIconsByName(icons: readonly IconAsset[], query: string): IconAsset[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) {
    return [...icons];
  }
  return icons.filter((icon) => normalizeForSearch(icon.name).includes(normalizedQuery));
}

/** Agrupa íconos por `categoryId`, con cada grupo ordenado por `order` ascendente. */
export function groupIconsByCategory(icons: readonly IconAsset[]): Map<string, IconAsset[]> {
  const map = new Map<string, IconAsset[]>();
  for (const icon of icons) {
    const list = map.get(icon.categoryId);
    if (list) {
      list.push(icon);
    } else {
      map.set(icon.categoryId, [icon]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.order - b.order);
  }
  return map;
}
