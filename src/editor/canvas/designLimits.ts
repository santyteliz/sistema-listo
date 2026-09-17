import type { Canvas, FabricObject } from 'fabric';
import { isTextObject } from './curvedText';
import { isIconObject } from './iconElement';

/**
 * Reglas de composición del diseño: un máximo total, y un máximo por tipo
 * de elemento. Única fuente de verdad — si alguno de estos números cambia,
 * se cambia acá y en ningún otro lugar.
 */
export const MAX_DESIGN_ELEMENTS = 20;
export const MAX_TEXT_ELEMENTS = 4;
export const MAX_ICON_ELEMENTS = 16;

/**
 * Tipos de elemento de diseño reconocidos. `custom-image` todavía no existe
 * en el editor (ver docs/ARCHITECTURE.md, `graphicKind`) — está acá para
 * que agregarlo el día de mañana sea sumar un caso, no rehacer esta regla.
 */
export type DesignElementKind = 'text' | 'icon' | 'custom-image';

const MAX_BY_KIND: Record<DesignElementKind, number> = {
  text: MAX_TEXT_ELEMENTS,
  icon: MAX_ICON_ELEMENTS,
  // En 0 a propósito: aunque el tipo ya está modelado, todavía no hay
  // ninguna forma de crear un elemento `custom-image` en el editor. Cuando
  // exista, este es el único número que hay que tocar.
  'custom-image': 0,
};

/**
 * Un objeto "cuenta" como elemento de diseño si y solo si no es una guía.
 * Reutiliza a propósito el mismo criterio que ya usa Fabric.js para excluir
 * las guías de `canvas.toJSON()`/`toObject()` (`excludeFromExport`, ver
 * `guides.ts`) — un solo criterio para "esto no es parte del diseño real",
 * no dos reglas separadas que puedan desincronizarse entre sí.
 */
export function isDesignElement(object: FabricObject): boolean {
  return !object.excludeFromExport;
}

/**
 * De qué tipo es un elemento de diseño, o `null` si es una guía (o algo que
 * el editor todavía no reconoce). Reutiliza los type guards que ya existían
 * — `isTextObject` (curvedText.ts) e `isIconObject` (iconElement.ts) —, no
 * duplica esa lógica acá.
 */
export function getDesignElementKind(object: FabricObject): DesignElementKind | null {
  if (!isDesignElement(object)) {
    return null;
  }
  if (isTextObject(object)) {
    return 'text';
  }
  if (isIconObject(object)) {
    return 'icon';
  }
  if (object.get('graphicKind') === 'custom-image') {
    return 'custom-image';
  }
  return null;
}

/** Cantidad actual de elementos de diseño reales (sin contar guías), de cualquier tipo. */
export function countDesignElements(canvas: Canvas): number {
  return canvas.getObjects().filter(isDesignElement).length;
}

/** Cantidad actual de elementos de un tipo puntual (texto, ícono, etc.). */
export function countDesignElementsByKind(canvas: Canvas, kind: DesignElementKind): number {
  return canvas.getObjects().filter((object) => getDesignElementKind(object) === kind).length;
}

/**
 * true si ya no hay lugar para agregar un elemento más, sin importar el
 * tipo. Usa `>=`, no `===`, a propósito: así, si alguna vez se restaura un
 * diseño con más de 4 elementos, agregar uno nuevo sigue bloqueado
 * correctamente sin necesitar un caso especial aparte.
 */
export function hasReachedDesignLimit(canvas: Canvas): boolean {
  return countDesignElements(canvas) >= MAX_DESIGN_ELEMENTS;
}

/**
 * Única puerta de entrada para "¿puedo agregar un elemento de este tipo
 * ahora mismo?" — combina el límite total y el límite por tipo en un solo
 * lugar. `actions.ts` y la UI consultan esto; ninguno de los dos debe
 * comparar `MAX_TEXT_ELEMENTS`/`MAX_ICON_ELEMENTS` por su cuenta.
 *
 * Igual que `hasReachedDesignLimit`, compara con `>=`: si por lo que sea el
 * canvas ya tiene más elementos de un tipo que el máximo (ej. se restauró
 * un diseño armado a mano con 2 textos), agregar uno más de ese tipo queda
 * bloqueado igual, sin caso especial.
 */
export function canAddDesignElement(canvas: Canvas, kind: DesignElementKind): boolean {
  if (hasReachedDesignLimit(canvas)) {
    return false;
  }
  return countDesignElementsByKind(canvas, kind) < MAX_BY_KIND[kind];
}

/** Resumen de conteos, para mostrarle al usuario cuánto lleva usado de cada cosa. */
export interface DesignElementCounts {
  total: number;
  text: number;
  icon: number;
}

export function getDesignElementCounts(canvas: Canvas): DesignElementCounts {
  return {
    total: countDesignElements(canvas),
    text: countDesignElementsByKind(canvas, 'text'),
    icon: countDesignElementsByKind(canvas, 'icon'),
  };
}
