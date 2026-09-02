import type { Canvas } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { createCurvedText, isTextObject } from './curvedText';
import { renderGuides } from './guides';

/**
 * Capa de comandos entre la UI y Fabric.js. Los componentes de React nunca
 * importan ni llaman métodos de Fabric directamente: siempre pasan por acá
 * (ver docs/ARCHITECTURE.md, "Principios de arquitectura").
 */
export interface EditorActions {
  /** Referencia de escape hacia la instancia real de Fabric, solo para debugging. */
  getCanvas: () => Canvas;
  /** Agrega un nuevo texto curvo, centrado sobre la virola, y lo selecciona. */
  addCurvedText: () => void;
  /** Actualiza el contenido del texto actualmente seleccionado (si hay uno). */
  updateSelectedTextContent: (text: string) => void;
  /** Elimina el objeto actualmente seleccionado (si hay uno). */
  removeSelectedObject: () => void;
  /** Serializa el diseño actual. Las guías quedan afuera (excludeFromExport). */
  serializeDesign: () => Record<string, unknown>;
  /** Restaura un diseño serializado y vuelve a dibujar las guías. */
  restoreDesign: (json: Record<string, unknown>) => Promise<void>;
}

export function createEditorActions(canvas: Canvas, config: VirolaConfig): EditorActions {
  function getSelectedText() {
    const active = canvas.getActiveObject();
    return isTextObject(active) ? active : null;
  }

  function addCurvedText(): void {
    const text = createCurvedText(config);
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
  }

  function updateSelectedTextContent(newText: string): void {
    const text = getSelectedText();
    if (!text) {
      return;
    }
    text.set('text', newText);
    // Dispara el mismo evento que usa la edición nativa de Fabric (doble
    // click sobre el texto), para que el recálculo de curvatura y la
    // sincronización del panel pasen siempre por el mismo camino, sin
    // importar si el cambio vino del panel lateral o del canvas.
    canvas.fire('text:changed', { target: text });
  }

  function removeSelectedObject(): void {
    const active = canvas.getActiveObject();
    if (!active) {
      return;
    }
    canvas.remove(active);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }

  function serializeDesign(): Record<string, unknown> {
    // OJO: en Fabric.js 6.0.2 el campo "type" dentro del JSON serializado no
    // usa el mismo string que el getter .type de una instancia viva — un
    // IText en memoria reporta "i-text" (ver isTextObject en curvedText.ts),
    // pero en el JSON serializado ese mismo objeto aparece como "IText". Si
    // en el futuro algo necesita filtrar objetos del JSON crudo por tipo
    // (antes de que loadFromJSON los reconstruya como instancias reales),
    // tiene que comparar contra "IText", no contra "i-text".
    return canvas.toJSON();
  }

  async function restoreDesign(json: Record<string, unknown>): Promise<void> {
    await canvas.loadFromJSON(json);
    // loadFromJSON limpia el canvas antes de restaurar; las guías no viajan
    // en el JSON (quedan excluidas a propósito), así que hay que volver a
    // dibujarlas.
    renderGuides(canvas, config);
    canvas.requestRenderAll();
  }

  return {
    getCanvas: () => canvas,
    addCurvedText,
    updateSelectedTextContent,
    removeSelectedObject,
    serializeDesign,
    restoreDesign,
  };
}
