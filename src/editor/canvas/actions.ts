import type { Canvas, FabricObject, IText } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { createCurvedText, isTextObject, CURVE_CUSTOM_PROPERTIES } from './curvedText';
import { renderGuides } from './guides';
import {
  applyIconAngle,
  buildReplacementIcon,
  createIconObject,
  getDefaultIconAngle,
  getIconDefinition,
  isIconObject,
  ICON_CUSTOM_PROPERTIES,
} from './iconElement';
import { hasReachedDesignLimit } from './designLimits';

/** Propiedades propias (no nativas de Fabric) que hay que pedirle a toObject() que incluya. */
const CUSTOM_PROPERTIES = [...CURVE_CUSTOM_PROPERTIES, ...ICON_CUSTOM_PROPERTIES];

/**
 * Capa de comandos entre la UI y Fabric.js. Los componentes de React nunca
 * importan ni llaman métodos de Fabric directamente: siempre pasan por acá
 * (ver docs/ARCHITECTURE.md, "Principios de arquitectura").
 */
export interface EditorActions {
  /** Referencia de escape hacia la instancia real de Fabric, solo para debugging. */
  getCanvas: () => Canvas;
  /**
   * Agrega un nuevo texto curvo, centrado sobre la virola, y lo selecciona.
   * No hace nada si ya se llegó a `MAX_DESIGN_ELEMENTS` (ver designLimits.ts).
   */
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
  /**
   * Agrega un ícono de la biblioteca (por su id), ubicado sobre el anillo,
   * y lo selecciona. No hace nada si ya se llegó a `MAX_DESIGN_ELEMENTS`
   * (ver designLimits.ts).
   */
  addIcon: (iconId: string) => void;
  /** Reemplaza la figura del ícono seleccionado por otra de la biblioteca, sin mover/rotar/escalar. */
  replaceSelectedIcon: (iconId: string) => void;
  /** Espeja horizontalmente el ícono seleccionado. */
  setSelectedIconFlipX: (flip: boolean) => void;
  /** Invierte verticalmente el ícono seleccionado. */
  setSelectedIconFlipY: (flip: boolean) => void;
  /** Ubica el ícono seleccionado en un ángulo dado alrededor de la virola. */
  setSelectedIconAngle: (angleDeg: number) => void;
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

  function getSelectedIcon() {
    const active = canvas.getActiveObject();
    return isIconObject(active) ? active : null;
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

  /**
   * Dispara el evento genérico de Fabric.js para "un objeto cambió" —
   * equivalente a lo anterior pero para íconos (Fabric.js ya lo dispara
   * solo después de mover/escalar/rotar con el mouse; acá se reutiliza el
   * mismo camino para los cambios que vienen del panel).
   */
  function notifyObjectModified(target: FabricObject): void {
    canvas.fire('object:modified', { target });
  }

  function addCurvedText(): void {
    // Protección en la capa de dominio, no solo en la UI: aunque el botón
    // ya se deshabilita al llegar al máximo (ver Sidebar.tsx), esta función
    // no debe crear un elemento de más aunque alguien la llame de otra
    // forma.
    if (hasReachedDesignLimit(canvas)) {
      return;
    }
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

  function addIcon(iconId: string): void {
    // Misma protección que addCurvedText — ver comentario ahí.
    if (hasReachedDesignLimit(canvas)) {
      return;
    }
    const iconDef = getIconDefinition(iconId);
    if (!iconDef) {
      return;
    }
    const existingIconCount = canvas.getObjects().filter(isIconObject).length;
    const angleDeg = getDefaultIconAngle(existingIconCount);
    const icon = createIconObject(iconDef, config, angleDeg);
    canvas.add(icon);
    canvas.setActiveObject(icon);
    canvas.requestRenderAll();
  }

  function replaceSelectedIcon(iconId: string): void {
    // A propósito, esta función NO pasa por hasReachedDesignLimit: cambia
    // la figura de un ícono que ya existe (lo saca y pone uno en su lugar),
    // el total de elementos del diseño no cambia — no debe consumir un
    // cupo nuevo.
    const current = getSelectedIcon();
    if (!current) {
      return;
    }
    const iconDef = getIconDefinition(iconId);
    if (!iconDef) {
      return;
    }
    const replacement = buildReplacementIcon(current, iconDef, config);
    canvas.remove(current);
    canvas.add(replacement);
    canvas.setActiveObject(replacement);
    canvas.requestRenderAll();
  }

  function setSelectedIconFlipX(flip: boolean): void {
    const icon = getSelectedIcon();
    if (!icon) {
      return;
    }
    icon.set('flipX', flip);
    icon.setCoords();
    canvas.requestRenderAll();
    notifyObjectModified(icon);
  }

  function setSelectedIconFlipY(flip: boolean): void {
    const icon = getSelectedIcon();
    if (!icon) {
      return;
    }
    icon.set('flipY', flip);
    icon.setCoords();
    canvas.requestRenderAll();
    notifyObjectModified(icon);
  }

  function setSelectedIconAngle(angleDeg: number): void {
    const icon = getSelectedIcon();
    if (!icon) {
      return;
    }
    applyIconAngle(icon, angleDeg, config);
    canvas.requestRenderAll();
    notifyObjectModified(icon);
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
    // tiene que comparar contra "IText"/"Path", no contra "i-text"/"path".
    //
    // Se usa toObject(...) en vez de toJSON() porque en v6 toJSON() no
    // acepta propiedades adicionales a incluir — sin esto, la dirección de
    // la curva de un texto y el ID/ángulo de un ícono (propiedades propias,
    // no nativas de Fabric) se perderían al guardar el diseño. Produce una
    // estructura igual de compatible con loadFromJSON() (verificado en
    // Chrome real).
    return canvas.toObject(CUSTOM_PROPERTIES);
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
    addIcon,
    replaceSelectedIcon,
    setSelectedIconFlipX,
    setSelectedIconFlipY,
    setSelectedIconAngle,
    removeSelectedObject,
    serializeDesign,
    restoreDesign,
  };
}
