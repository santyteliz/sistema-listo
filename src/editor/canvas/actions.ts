import type { Canvas } from 'fabric';

/**
 * Capa de comandos entre la UI y Fabric.js. Los componentes de React nunca
 * importan ni llaman métodos de Fabric directamente: siempre pasan por acá
 * (ver docs/ARCHITECTURE.md, "Principios de arquitectura").
 *
 * Todavía no hay operaciones de edición reales (agregar texto, íconos,
 * curvar, etc.) — esta tarea solo prepara el punto de entrada. Cada
 * funcionalidad futura se agrega acá como un método nuevo, siguiendo este
 * mismo patrón: recibe únicamente lo que necesita, nunca expone el `Canvas`
 * completo a quien la llama.
 */
export interface EditorActions {
  /** Referencia de escape hacia la instancia real de Fabric, solo para debugging. */
  getCanvas: () => Canvas;
}

export function createEditorActions(canvas: Canvas): EditorActions {
  return {
    getCanvas: () => canvas,
  };
}
