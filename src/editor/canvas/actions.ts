import type { Canvas, IText } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { createCurvedText, isTextObject, CURVE_CUSTOM_PROPERTIES } from './curvedText';
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
  /** Cambia la tipografía del texto seleccionado (espera a que cargue de verdad). */
  setSelectedTextFontFamily: (fontFamily: string) => Promise<void>;
  /** Cambia el tamaño del texto seleccionado. */
  setSelectedTextFontSize: (fontSize: number) => void;
  /** Invierte (o no) el sentido de la curva del texto seleccionado. */
  setSelectedTextInverted: (inverted: boolean) => void;
  /** Corre el texto seleccionado a lo largo del arco (pathStartOffset). */
  setSelectedTextCurveOffset: (offset: number) => void;
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

  /**
   * Dispara el mismo evento que usa la edición nativa de Fabric.js (doble
   * click sobre el texto), para que el recálculo de curvatura y la
   * sincronización del panel pasen siempre por el mismo camino — sin
   * importar si el cambio vino del panel lateral o del canvas.
   */
  function notifyTextChanged(text: IText): void {
    canvas.fire('text:changed', { target: text });
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
    notifyTextChanged(text);
  }

  async function setSelectedTextFontFamily(fontFamily: string): Promise<void> {
    const text = getSelectedText();
    if (!text) {
      return;
    }
    // Espera a que la tipografía esté realmente lista antes de aplicarla,
    // para que Fabric.js mida el ancho del texto con la fuente correcta
    // (si no, el texto quedaría mal centrado hasta el próximo cambio).
    await document.fonts.load(`${text.fontSize}px "${fontFamily}"`);
    text.set('fontFamily', fontFamily);
    notifyTextChanged(text);
  }

  function setSelectedTextFontSize(fontSize: number): void {
    const text = getSelectedText();
    if (!text) {
      return;
    }
    text.set('fontSize', fontSize);
    notifyTextChanged(text);
  }

  function setSelectedTextInverted(inverted: boolean): void {
    const text = getSelectedText();
    if (!text) {
      return;
    }
    text.set('curveInverted', inverted);
    notifyTextChanged(text);
  }

  function setSelectedTextCurveOffset(offset: number): void {
    const text = getSelectedText();
    if (!text) {
      return;
    }
    text.set('curveOffset', offset);
    notifyTextChanged(text);
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
    //
    // Se usa toObject(...) en vez de toJSON() porque en v6 toJSON() no
    // acepta propiedades adicionales a incluir — sin esto, la dirección de
    // la curva y el corrimiento manual (propiedades propias, no nativas de
    // Fabric) se perderían al guardar el diseño. Produce una estructura
    // igual de compatible con loadFromJSON() (verificado en Chrome real).
    return canvas.toObject([...CURVE_CUSTOM_PROPERTIES]);
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
    setSelectedTextFontFamily,
    setSelectedTextFontSize,
    setSelectedTextInverted,
    setSelectedTextCurveOffset,
    removeSelectedObject,
    serializeDesign,
    restoreDesign,
  };
}
