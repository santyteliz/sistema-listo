// Import con extensión ".ts" explícita, a propósito distinto de la
// convención sin extensión que usa el resto del proyecto — ver el informe
// final de esta etapa ("Decisión importante — imports con extensión en los
// archivos nuevos de esta etapa"): es lo que permite correr las pruebas de
// esta carpeta con `node --test`, sin agregar ninguna dependencia nueva de
// testing. `tsconfig.app.json` ya tiene `allowImportingTsExtensions: true`
// (resolución "bundler"), así que esto es válido tanto para `tsc -b` como
// para Vite — no es un workaround frágil.
import { ICON_LIBRARY, type IconDefinition, type IconPaintMode, type IconLayer } from './iconLibrary.ts';

/**
 * Modelo de catálogo administrable de íconos (Etapa 1 del plan de biblioteca
 * de íconos — ver el análisis previo). Es puramente un modelo de DATOS: no
 * crea objetos de Fabric, no toca el canvas, no reemplaza `iconLibrary.ts`.
 * Deliberadamente separado de `IconDefinition` (`iconLibrary.ts`), que sigue
 * siendo la fuente de verdad que usa HOY `createIconObject` — este archivo
 * es la base sobre la que la Etapa 2 (importar los 370 PDFs reales) y
 * etapas posteriores (selector con categorías, administrador del equipo)
 * van a construirse, sin tocar el mecanismo actual todavía.
 *
 * Por qué el `id` de un ícono/categoría es distinto de su `name`: `id` es
 * el valor ESTABLE que queda guardado dentro de un diseño serializado
 * (`iconId`, ver `ICON_CUSTOM_PROPERTIES` en `iconElement.ts`) — cambiarlo
 * rompería diseños ya guardados. `name` es puramente de presentación (lo
 * que ve el usuario/el equipo en el selector o el administrador) y puede
 * cambiar libremente sin ningún efecto sobre diseños existentes.
 *
 * Por qué `active` en vez de borrado físico: desactivar una categoría o un
 * ícono lo oculta para USUARIOS NUEVOS (no aparece más en el selector), sin
 * borrar el recurso — así un diseño ya guardado que lo usa sigue pudiendo
 * reconstruirse. El borrado físico (si alguna vez hace falta) es una
 * decisión aparte, del futuro administrador, no de este modelo.
 */

/** Categoría del catálogo de íconos — agrupa `IconAsset` para navegación/administración. */
export interface IconCategory {
  /** Slug estable — nunca cambia una vez publicado (puede quedar referenciado por `IconAsset.categoryId`). */
  id: string;
  /** Nombre visible — editable libremente, nunca afecta `id`. */
  name: string;
  /** Orden de visualización (ascendente) dentro de la lista de categorías. */
  order: number;
  /** `false` = oculta para usuarios nuevos; NO implica borrado físico ni invalida íconos que la referencian. */
  active: boolean;
}

/**
 * Un ícono del catálogo. `svgPath` es el mismo tipo de dato que ya usa
 * `IconDefinition.svgPath` hoy (un `d` de SVG, viewBox de referencia
 * `0 0 100 100`, sin color propio — el color lo aplica siempre Fabric vía
 * `DESIGN_INK_COLOR`, ver `iconElement.ts`) — pensado para pasar tal cual a
 * `new Path(svgPath, {...})`, el mismo mecanismo que ya existe, sin
 * necesitar un segundo tipo de objeto Fabric.
 */
export interface IconAsset {
  /** Slug estable — el mismo valor que hoy guarda `iconId` en un diseño serializado. Nunca se reasigna a otro ícono. */
  id: string;
  /** Nombre visible — editable libremente, nunca afecta `id`. */
  name: string;
  /** Categoría a la que pertenece (`IconCategory.id`). */
  categoryId: string;
  /**
   * Datos de trazo ya normalizados (ver `normalizeIconPath.ts`) — geometría
   * pura, sin color, sin metadata, en el viewBox de referencia `0 0 100 100`.
   * Nunca markup SVG completo ni HTML — ver la nota de seguridad grande al
   * final de este archivo.
   */
  svgPath: string;
  /**
   * Cómo pintar este ícono (Etapa 4 — ver `IconPaintMode` en
   * `iconLibrary.ts`, misma definición, reexportada acá para no tener dos
   * tipos distintos con el mismo significado). `IconAsset` es un superset
   * estructural de `IconDefinition` (mismos `id`/`name`/`svgPath` +
   * `paintMode`/`fillRule`/`strokeWidth`) — sigue pudiendo pasarse tal cual
   * donde se espera un `IconDefinition` (`actions.addIcon`/
   * `replaceSelectedIcon`), sin cast, igual que ya sucedía antes de esta
   * etapa.
   */
  paintMode: IconPaintMode;
  /** Regla de relleno — solo importa si `paintMode === 'fill'`. */
  fillRule: 'nonzero' | 'evenodd';
  /** Ancho de trazo — solo presente si `paintMode === 'stroke'`. */
  strokeWidth?: number;
  /** Ver `IconLayer`/`IconDefinition.layers` (`iconLibrary.ts`, Etapa 8E) — presente únicamente en íconos subidos (`source: 'upload'`) que necesitaron preservar varias capas de pintado. `undefined` para todo el catálogo real (PDF) y los legacy. */
  layers?: IconLayer[];
  /** URL a una miniatura PNG pre-renderizada, para el grid del selector (Etapa 3) — opcional: sin ella, el selector puede renderizar el `svgPath` en vivo. */
  thumbnailUrl?: string;
  /** Orden de visualización dentro de su categoría. */
  order: number;
  /** `false` = oculto para usuarios nuevos; NO implica borrado físico. */
  active: boolean;
  /**
   * De dónde vino este ícono — únicamente para trazabilidad/administración
   * (ej. mostrar "Mis íconos" aparte, o moderar uploads). NUNCA determina
   * qué tipo de objeto Fabric se crea ni cuenta para un cupo de límites
   * aparte: tanto `'library'` como `'upload'` van a producir el MISMO
   * `graphicKind: 'icon'` que ya usa `iconElement.ts`, y los dos cuentan
   * contra el mismo `MAX_ICON_ELEMENTS` (`designLimits.ts`) — no hay, ni
   * va a haber, un segundo sistema de límites para los uploads.
   */
  source: 'library' | 'upload';
  createdAt: string;
  updatedAt: string;
}

/**
 * Categoría de respaldo para los 6 íconos que ya existen hoy en
 * `iconLibrary.ts` (ver `getLegacyIconCatalog` más abajo) — nacieron sin
 * ningún concepto de categoría, así que necesitan una a la que pertenecer
 * para encajar en este modelo. Es un `id` estable como cualquier otro: si
 * en el futuro el equipo quiere recategorizarlos desde el administrador,
 * alcanza con mover cada `IconAsset` a otra categoría — no hace falta que
 * esta exista para siempre.
 */
export const LEGACY_ICON_CATEGORY: IconCategory = {
  id: 'general',
  name: 'General',
  order: 0,
  active: true,
};

/**
 * Representa los 6 íconos de `ICON_LIBRARY` (`iconLibrary.ts`) como
 * `IconAsset[]`, SIN duplicar sus datos ni pasarlos por el normalizador:
 * son un `svgPath` ya escrito a mano, ya centrado, ya en el viewBox de
 * referencia `0 0 100 100` — literalmente los mismos datos que hoy usa
 * `createIconObject`, solo envueltos en la forma de catálogo nueva. Es
 * deliberadamente una función (no una constante calculada una sola vez al
 * cargar el módulo) para que `createdAt`/`updatedAt` reflejen el momento en
 * que se pide la representación, no el momento en que se importó el
 * módulo — sin efecto práctico hoy, pero evita una fecha "congelada" rara
 * si esto se usa como semilla de datos en Etapa 2.
 *
 * IMPORTANTE: esto NO reemplaza a `ICON_LIBRARY` ni cambia
 * `createIconObject` — es puramente una vista/adaptador de solo lectura,
 * para que el resto del sistema de catálogo (selector, administrador)
 * pueda tratar "los 6 íconos actuales" igual que cualquier otro
 * `IconAsset`, sin un caso especial.
 */
export function getLegacyIconCatalog(): { category: IconCategory; icons: IconAsset[] } {
  const now = new Date().toISOString();
  return {
    category: LEGACY_ICON_CATEGORY,
    icons: ICON_LIBRARY.map((icon: IconDefinition, index: number): IconAsset => ({
      id: icon.id,
      name: icon.name,
      categoryId: LEGACY_ICON_CATEGORY.id,
      svgPath: icon.svgPath,
      paintMode: icon.paintMode,
      fillRule: icon.fillRule,
      strokeWidth: icon.strokeWidth,
      order: index,
      active: true,
      source: 'library',
      createdAt: now,
      updatedAt: now,
    })),
  };
}

/**
 * Nota de seguridad (ver docs/ARCHITECTURE.md, "SVG y seguridad"): este
 * modelo guarda `svgPath` como datos de TRAZO puro (el contenido de un
 * atributo `d`), nunca markup `<svg>`/HTML completo. Ni este archivo ni
 * `normalizeIconPath.ts` insertan contenido externo en el DOM ni usan
 * `innerHTML`/`loadSVGFromString` — el único consumidor final sigue siendo
 * `new Path(svgPath, {...})` (Fabric.js), exactamente como ya sucede hoy en
 * `iconElement.ts`. Un ícono subido por un usuario (Etapa 5, todavía sin
 * implementar) va a tener que pasar por `normalizeIconPath` antes de poder
 * convertirse en un `IconAsset` — nunca se guarda ni se usa el archivo
 * original tal cual.
 */
