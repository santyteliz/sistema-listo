import { useEffect, useMemo, useState } from 'react';
import type { IconAsset, IconCategory } from './iconCatalog';
import { loadIconManifest } from './loadIconManifest';
import { groupIconsByCategory, searchIconsByName } from './iconSearch';

/**
 * Hook de acceso al catálogo REAL de íconos (235 assets, 5 categorías) para
 * la UI (Etapa 3) — encapsula la carga async de `loadIconManifest.ts` como
 * estado de React (`loading`/`ready`/`error`) y agrega las operaciones de
 * solo-lectura que necesita el drawer: agrupar por categoría, buscar por
 * nombre, y encontrar un asset por id. No importa Fabric.js ni conoce el
 * canvas — es una capa de datos pura, consumida por `IconLibraryDrawer.tsx`
 * y por `IconEditorPanel.tsx` (para mostrar el ícono actualmente
 * seleccionado si es del catálogo real, no de los 6 legacy).
 *
 * Varios componentes pueden llamar a este hook a la vez (el drawer y el
 * panel lateral, por ejemplo): cada uno dispara su propio `useEffect`, pero
 * `loadIconManifest` ya cachea la promesa de red — nunca se pide el archivo
 * más de una vez, sin importar cuántos componentes usen este hook.
 */

export type IconCatalogStatus = 'loading' | 'ready' | 'error';

export interface IconCatalogState {
  status: IconCatalogStatus;
  categories: IconCategory[];
  icons: IconAsset[];
  /** Mensaje amigable listo para mostrar al usuario — nunca un stack trace (ver sección 12 del pedido). */
  error: string | null;
  getIconsByCategory: (categoryId: string) => IconAsset[];
  /**
   * Búsqueda global (las 5 categorías a la vez, ver preferencia del
   * pedido) por nombre, insensible a mayúsculas/minúsculas y a acentos
   * ("mate" encuentra "MATE", "avión" encuentra "avion" y viceversa).
   * Vacía o solo espacios → sin filtro (mismo criterio en todos lados).
   */
  searchIcons: (query: string) => IconAsset[];
  findIconAssetById: (id: string) => IconAsset | undefined;
}

export function useIconCatalog(): IconCatalogState {
  const [status, setStatus] = useState<IconCatalogStatus>('loading');
  const [categories, setCategories] = useState<IconCategory[]>([]);
  const [icons, setIcons] = useState<IconAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadIconManifest()
      .then((manifest) => {
        if (cancelled) return;
        setCategories([...manifest.categories].sort((a, b) => a.order - b.order));
        setIcons(manifest.icons);
        setStatus('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'No se pudo cargar la biblioteca de íconos.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const iconsByCategory = useMemo(() => groupIconsByCategory(icons), [icons]);

  const iconsById = useMemo(() => {
    const map = new Map<string, IconAsset>();
    for (const icon of icons) {
      map.set(icon.id, icon);
    }
    return map;
  }, [icons]);

  function getIconsByCategory(categoryId: string): IconAsset[] {
    return iconsByCategory.get(categoryId) ?? [];
  }

  function searchIcons(query: string): IconAsset[] {
    return searchIconsByName(icons, query);
  }

  function findIconAssetById(id: string): IconAsset | undefined {
    return iconsById.get(id);
  }

  return { status, categories, icons, error, getIconsByCategory, searchIcons, findIconAssetById };
}
