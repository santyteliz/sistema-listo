import type { Canvas, FabricObject } from 'fabric';

/**
 * Regla de producto: como máximo 4 elementos de contenido del usuario por
 * diseño (texto + íconos +, a futuro, imágenes personalizadas —
 * `graphicKind: 'custom-image'` — combinados). Única fuente de verdad: si
 * el número cambia, se cambia acá y en ningún otro lugar.
 */
export const MAX_DESIGN_ELEMENTS = 4;

/**
 * Un objeto "cuenta" como elemento de diseño si y solo si no es una guía.
 * Reutiliza a propósito el mismo criterio que ya usa Fabric.js para excluir
 * las guías de `canvas.toJSON()`/`toObject()` (`excludeFromExport`, ver
 * `guides.ts`) — un solo criterio para "esto no es parte del diseño real",
 * no dos reglas separadas que puedan desincronizarse entre sí.
 *
 * Esto ya funciona para texto e íconos hoy, y para `custom-image` el día de
 * mañana sin cambios: cualquier objeto real que se agregue al canvas sin
 * marcarlo como guía cuenta solo, sin necesidad de listar tipos a mano.
 */
export function isDesignElement(object: FabricObject): boolean {
  return !object.excludeFromExport;
}

/** Cantidad actual de elementos de diseño reales (sin contar guías). */
export function countDesignElements(canvas: Canvas): number {
  return canvas.getObjects().filter(isDesignElement).length;
}

/**
 * true si ya no hay lugar para agregar un elemento más. Usa `>=`, no `===`,
 * a propósito: así, si alguna vez se restaura un diseño con más de 4
 * elementos (ver `restoreDesign` en `actions.ts`), agregar uno nuevo sigue
 * bloqueado correctamente sin necesitar un caso especial aparte.
 */
export function hasReachedDesignLimit(canvas: Canvas): boolean {
  return countDesignElements(canvas) >= MAX_DESIGN_ELEMENTS;
}
