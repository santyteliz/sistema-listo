import type { Canvas, FabricObject, IText } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { applyTextCurve, applyTextInteractionLocks, createCurvedText, getCurveRadius, getCurveState, isTextObject, setTextVisibilityClip, TEXT_CUSTOM_PROPERTIES } from './curvedText';
import { clampTextAgainstOtherTexts, getDefaultTextAngle } from './textCollision';
import { renderGuides } from './guides';
import type { IconDefinition } from '../icons/iconLibrary';
import {
  applyIconAngle,
  applyIconInteractionLocks,
  buildReplacementIcon,
  createIconObject,
  getDefaultIconAngle,
  getIconAngle,
  getIconRuntimeDefinition,
  isIconObject,
  setIconVisibilityClip,
  ICON_CUSTOM_PROPERTIES,
} from './iconElement';
import { canAddDesignElement, isDesignElement } from './designLimits';
import { clampIconPosition, clampIconScale, clampIconRotation } from './containment';
import { getCircularLineStyle, renderCircularLines, type CircularLineStyle } from './circularLines';

/**
 * Propiedades propias (no nativas de Fabric) que hay que pedirle a
 * toObject() que incluya. `circularLineStyle` es distinta de las demás: no
 * es una propiedad de un OBJETO sino del CANVAS mismo (`canvas.set('circularLineStyle', …)`,
 * ver circularLines.ts) — pero `canvas.toObject(propertiesToInclude)`
 * acepta la MISMA lista para las dos cosas (internamente hace
 * `pick(this, propertiesToInclude)` sobre el propio canvas antes de
 * serializar los objetos, confirmado en el código fuente de Fabric 6.0.2),
 * así que no hace falta un mecanismo aparte.
 */
const CUSTOM_PROPERTIES = [...TEXT_CUSTOM_PROPERTIES, ...ICON_CUSTOM_PROPERTIES, 'circularLineStyle'];

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
  /**
   * Pide un nuevo tamaño para el texto seleccionado. El tamaño final puede
   * quedar más chico si no entra en el arco (ver auto-fit en curvedText.ts).
   */
  setSelectedTextFontSize: (fontSize: number) => void;
  /** Invierte (o no) el sentido de la curva del texto seleccionado. */
  setSelectedTextInverted: (inverted: boolean) => void;
  /**
   * Ubica el texto seleccionado en un ángulo dado alrededor de la virola
   * (0-360°, 0 = arriba, sentido horario) — mismo mecanismo que arrastrarlo
   * a mano sobre el canvas, para cuando se necesita un valor preciso (ej.
   * el slider del panel).
   */
  setSelectedTextCurveOffset: (angleDeg: number) => void;
  /**
   * Agrega un ícono nuevo, ubicado sobre el anillo, y lo selecciona. No hace
   * nada si ya se llegó a `MAX_DESIGN_ELEMENTS` (ver designLimits.ts).
   *
   * Recibe el `IconDefinition` completo (no solo un id) a propósito: desde
   * la Etapa 3 (`IconLibraryDrawer.tsx`), el llamador ya tiene el
   * `IconAsset` elegido por el usuario (catálogo real de `manifest.json`,
   * cargado por `useIconCatalog.ts`) — pedirle acá solo el id obligaría a
   * esta capa a saber buscarlo en algún catálogo (¿cuál? ¿el legacy de 6, el
   * real de 235?), mezclando una responsabilidad de datos con la capa de
   * comandos de Fabric. `IconAsset` (`iconCatalog.ts`) es un superset
   * estructural de `IconDefinition` (mismos `id`/`name`/`svgPath`, más
   * campos propios del catálogo que acá no hacen falta), así que un
   * `IconAsset` se pasa tal cual sin necesitar un cast ni un tipo nuevo.
   */
  addIcon: (iconDef: IconDefinition) => void;
  /** Reemplaza la figura del ícono seleccionado por otra (ver `addIcon` sobre por qué recibe el `IconDefinition` completo), sin mover/rotar/escalar. */
  replaceSelectedIcon: (iconDef: IconDefinition) => void;
  /**
   * Deriva un `IconDefinition` directamente del ícono seleccionado en el
   * canvas (Etapa 8B) — para el panel lateral, cuando el `iconId`
   * seleccionado no aparece en ningún catálogo (un ícono SVG subido por el
   * usuario nunca se agrega a `public/icons/manifest.json`). `null` si no
   * hay ningún ícono seleccionado. Ver `getIconRuntimeDefinition`
   * (`iconElement.ts`) para el porqué de leerlo directo de Fabric en vez de
   * mantener un registro aparte.
   */
  getSelectedIconRuntimeDefinition: () => IconDefinition | null;
  /** Espeja horizontalmente el ícono seleccionado. */
  setSelectedIconFlipX: (flip: boolean) => void;
  /** Invierte verticalmente el ícono seleccionado. */
  setSelectedIconFlipY: (flip: boolean) => void;
  /** Ubica el ícono seleccionado en un ángulo dado alrededor de la virola. */
  setSelectedIconAngle: (angleDeg: number) => void;
  /**
   * Cambia la escala del ícono seleccionado en `deltaScale` (positivo para
   * agrandar, negativo para achicar) — la contención geométrica decide el
   * máximo real posible (ver `containment.ts`), así que pedir de más
   * simplemente lo deja en ese máximo, nunca lo deforma ni lo saca de la
   * banda.
   */
  growSelectedIcon: (deltaScale: number) => void;
  /**
   * Fija la escala del ícono seleccionado a un valor ABSOLUTO (no relativo,
   * a diferencia de `growSelectedIcon`) — pensado para el gesto de tamaño
   * del `ContextualToolbar`, que en cada frame calcula el tamaño objetivo
   * completo a partir de la distancia actual al punto donde empezó el
   * gesto (nunca acumulando deltas cuadro a cuadro). Respeta exactamente
   * las mismas reglas que `growSelectedIcon`: auto-reposicionamiento hacia
   * el centro si hace falta, y recorte al máximo/mínimo real.
   */
  setSelectedIconScale: (scale: number) => void;
  /** Rota el ícono seleccionado `deltaDeg` grados (positivo = horario). */
  rotateSelectedIcon: (deltaDeg: number) => void;
  /** Elimina el objeto actualmente seleccionado (si hay uno). */
  removeSelectedObject: () => void;
  /**
   * Cambia el estilo de las líneas circulares decorativas ("No"/"Simple"/
   * "Doble", ver circularLines.ts) — no son un elemento de diseño (no
   * cuentan para MAX_DESIGN_ELEMENTS, no se pueden seleccionar), así que
   * viven fuera del concepto de "objeto seleccionado" que usa el resto de
   * estas acciones.
   */
  setCircularLineStyle: (style: CircularLineStyle) => void;
  /**
   * Vuelve la virola al estado de recién abierta: saca todos los elementos
   * de diseño (texto e íconos), apaga las líneas circulares, y limpia la
   * selección. Las guías (contorno de la virola) nunca se tocan — no son un
   * elemento de diseño (ver `isDesignElement`, designLimits.ts), así que ni
   * siquiera entran en la lista de objetos a remover.
   */
  resetDesign: () => void;
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

  function getSelectedIconRuntimeDefinition(): IconDefinition | null {
    const icon = getSelectedIcon();
    return icon ? getIconRuntimeDefinition(icon) : null;
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
    // forma. canAddDesignElement chequea el límite total Y el de textos
    // (MAX_TEXT_ELEMENTS, ver designLimits.ts) en un solo lugar.
    if (!canAddDesignElement(canvas, 'text')) {
      return;
    }
    const text = createCurvedText(config);
    // Con más de un texto permitido a la vez (ver designLimits.ts), nacer
    // siempre a 0° (arriba, ver DEFAULT_CURVE_STATE en curvedText.ts)
    // superpondría el 2do/3er/4to texto con el primero. `getDefaultTextAngle`
    // busca el primer ángulo libre real (mismo criterio de colisión que el
    // arrastre, ver textCollision.ts); con un solo texto en el diseño
    // siempre da 0, así que el comportamiento del primer texto no cambia.
    const angleDeg = getDefaultTextAngle(canvas, text, config);
    if (angleDeg !== 0) {
      text.set('curveOffset', angleDeg);
      applyTextCurve(text, config, getCurveState(text));
    }
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
    // No se aplica el tamaño directamente: se guarda como "lo que el
    // usuario pidió" y se dispara el recálculo central (applyTextCurve,
    // vía text:changed), que hace el auto-fit real contra el ancho medido
    // del texto y deja `fontSize` en lo más grande que entra sin pasarse
    // de este pedido.
    text.set('desiredFontSize', fontSize);
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

  function setSelectedTextCurveOffset(angleDeg: number): void {
    const text = getSelectedText();
    if (!text) {
      return;
    }
    // Mismo criterio de colisión que el arrastre a mano (ver
    // handleTextMoving, useFabricCanvas.ts): este slider mueve el texto de
    // un salto (no en pasos), así que sin este chequeo podría dejarlo
    // directamente encima de otro texto en un solo frame — algo que el
    // arrastre nunca permite. `getCurveRadius` de acá adentro (el radio no
    // cambia por este slider) hace de estado "actual" y de "propuesto" a la
    // vez para el radio.
    const currentAngleDeg = getCurveState(text).offset;
    const radius = getCurveRadius(text, config);
    const clamped = clampTextAgainstOtherTexts(canvas, text, currentAngleDeg, radius, angleDeg, radius, config);
    text.set('curveOffset', clamped.angleDeg);
    notifyTextChanged(text);
  }

  function addIcon(iconDef: IconDefinition): void {
    // Misma protección que addCurvedText — ver comentario ahí. Acá el
    // límite por tipo es MAX_ICON_ELEMENTS íconos, no MAX_TEXT_ELEMENTS
    // (ver designLimits.ts, única fuente de verdad de estos números).
    if (!canAddDesignElement(canvas, 'icon')) {
      return;
    }
    // Ángulos que ya ocupa algún ícono existente — no solo cuántos hay (ver
    // el comentario grande de `getDefaultIconAngle`, iconElement.ts).
    const usedAngles = canvas.getObjects().filter(isIconObject).map(getIconAngle);
    const angleDeg = getDefaultIconAngle(usedAngles);
    const icon = createIconObject(iconDef, config, angleDeg);
    canvas.add(icon);
    canvas.setActiveObject(icon);
    canvas.requestRenderAll();
  }

  function replaceSelectedIcon(iconDef: IconDefinition): void {
    // A propósito, esta función NO pasa por hasReachedDesignLimit: cambia
    // la figura de un ícono que ya existe (lo saca y pone uno en su lugar),
    // el total de elementos del diseño no cambia — no debe consumir un
    // cupo nuevo.
    const current = getSelectedIcon();
    if (!current) {
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

  /**
   * Fija la escala de un ícono a un valor pedido (`targetScale`) y aplica la
   * misma corrección geométrica de siempre. Si la posición actual ya no
   * alcanza para ese tamaño, `clampIconPosition` acerca el ícono hacia el
   * centro — conservando su ángulo, porque solo ajusta la distancia radial
   * sobre la misma dirección (ux, uy) en la que ya estaba (ver
   * containment.ts) — hasta encontrar una posición donde el tamaño pedido
   * SÍ entra. Recién después, `clampIconScale` recorta la escala al máximo
   * real *en esa posición (ya reacomodada)*, para el caso límite en que ni
   * acercándolo todo lo posible alcanza. Compartida por `growSelectedIcon`
   * (relativo) y `setSelectedIconScale` (absoluto) — misma corrección,
   * solo cambia cómo se calcula `targetScale` antes de llamar acá.
   */
  function applyIconScale(icon: FabricObject, targetScale: number): void {
    icon.set({ scaleX: targetScale, scaleY: targetScale });
    icon.setCoords();
    clampIconPosition(icon, config);
    clampIconScale(icon, config);
    icon.setCoords();
    canvas.requestRenderAll();
    notifyObjectModified(icon);
  }

  function growSelectedIcon(deltaScale: number): void {
    const icon = getSelectedIcon();
    if (!icon) {
      return;
    }
    const currentScale = icon.scaleX ?? 1;
    applyIconScale(icon, currentScale + deltaScale);
  }

  function setSelectedIconScale(scale: number): void {
    const icon = getSelectedIcon();
    if (!icon) {
      return;
    }
    applyIconScale(icon, scale);
  }

  function rotateSelectedIcon(deltaDeg: number): void {
    const icon = getSelectedIcon();
    if (!icon) {
      return;
    }
    icon.set('angle', (icon.angle ?? 0) + deltaDeg);
    icon.setCoords();
    // clampIconRotation nunca bloquea la rotación en sí — si hace falta,
    // achica el ícono lo mínimo necesario para que el nuevo ángulo siga
    // entrando en la banda (ver containment.ts).
    clampIconRotation(icon, config);
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

  function setCircularLineStyle(style: CircularLineStyle): void {
    canvas.set('circularLineStyle', style);
    renderCircularLines(canvas, config, style);
    // El estado de React (Sidebar) no escucha Fabric directamente — se
    // entera de este cambio por este evento, igual que `selection` se
    // entera de un cambio de texto/ícono vía `text:changed`/`object:modified`
    // (ver useFabricCanvas.ts).
    canvas.fire('circularLineStyle:modified', { style });
  }

  /**
   * "Empezar desde cero" (ver Sidebar.tsx): reutiliza `isDesignElement`
   * (el mismo criterio que ya usa `designLimits.ts` para saber qué cuenta
   * como elemento real, sin duplicar esa lógica) para identificar y sacar
   * únicamente texto e íconos — nunca guías — y reutiliza `setCircularLineStyle`
   * (la misma función del botón "No" del panel de líneas circulares) para
   * apagarlas, en vez de reimplementar ese apagado acá. `discardActiveObject`
   * ya dispara `selection:cleared`, que en `useFabricCanvas.ts` limpia sola
   * la selección y cierra el toolbar contextual — no hace falta ningún
   * código nuevo para eso. El contador de elementos tampoco: se recalcula
   * solo en cada `object:removed`, igual que al eliminar cualquier elemento
   * uno por uno.
   */
  function resetDesign(): void {
    canvas.getObjects().filter(isDesignElement).forEach((object) => canvas.remove(object));
    setCircularLineStyle('none');
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
    // loadFromJSON reconstruye el texto directamente desde lo serializado,
    // sin pasar por applyTextCurve — un JSON armado a mano (o de una
    // versión anterior) podría traer un salto de línea en `text`. Se
    // vuelve a pasar por la misma función central (idempotente: con datos
    // ya válidos no cambia nada) para que la regla de una sola línea valga
    // también al restaurar, no solo al escribir.
    canvas.getObjects().filter(isTextObject).forEach((text) => {
      // Etapa 14A (bug de restauración después de Undo/Redo): `loadFromJSON`
      // reconstruye el texto de forma GENÉRICA — nunca pasa por
      // `createCurvedText` — así que queda con los valores POR DEFECTO de
      // Fabric.js para `hasControls`/`hasBorders`/`editable`/`lockScalingX`/
      // `lockScalingY`/`lockRotation`/`perPixelTargetFind` (ninguna de estas
      // propiedades viaja en el JSON serializado, ver el comentario grande
      // de `applyTextInteractionLocks`, curvedText.ts) — sin este fixup,
      // reaparece el rectángulo de selección nativo y las manijas de
      // escalar/rotar quedan disponibles y SIN NINGÚN control de
      // contención (nunca hizo falta uno: ese gesto era imposible antes de
      // este bug).
      applyTextInteractionLocks(text);
      applyTextCurve(text, config, getCurveState(text));
      // Igual que con los íconos (ver abajo): nada queda seleccionado justo
      // después de restaurar, así que el texto (si lo hay) queda recortado
      // al anillo real hasta que el usuario lo seleccione.
      setTextVisibilityClip(text, false, config);
    });
    // Mismo motivo que el fixup de arriba, pero para íconos (ver el
    // comentario grande de `applyIconInteractionLocks`, iconElement.ts):
    // `loadFromJSON` reconstruye los íconos de forma genérica a partir del
    // JSON (no pasa por `createIconObject`), así que ninguno tiene todavía
    // ni su `clipPath` asignado NI su configuración de interacción
    // (`hasControls`/`hasBorders`/`centeredScaling`/`perPixelTargetFind`).
    // Nada queda seleccionado justo después de restaurar, así que los
    // íconos (si los hay) quedan recortados al anillo real hasta que el
    // usuario seleccione uno.
    canvas.getObjects().filter(isIconObject).forEach((icon) => {
      applyIconInteractionLocks(icon);
      setIconVisibilityClip(icon, false, config);
    });
    // Las líneas circulares no viajan en el JSON (son puramente derivadas,
    // ver circularLines.ts) — el ESTILO elegido sí (vía `circularLineStyle`,
    // ya restaurado sobre `canvas` por el propio `loadFromJSON`), así que
    // alcanza con volver a dibujarlas desde ese estilo + la geometría ya
    // restaurada de cada elemento.
    const restoredCircularLineStyle = getCircularLineStyle(canvas);
    renderCircularLines(canvas, config, restoredCircularLineStyle);
    // `loadFromJSON` restaura `circularLineStyle` directamente sobre el
    // canvas (ver circularLines.ts) sin pasar por `setCircularLineStyle`, así
    // que el estado de React (Sidebar) no se entera solo — mismo evento que
    // usa esa función para sincronizarlo.
    canvas.fire('circularLineStyle:modified', { style: restoredCircularLineStyle });
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
    getSelectedIconRuntimeDefinition,
    setSelectedIconFlipX,
    setSelectedIconFlipY,
    setSelectedIconAngle,
    growSelectedIcon,
    setSelectedIconScale,
    rotateSelectedIcon,
    removeSelectedObject,
    setCircularLineStyle,
    resetDesign,
    serializeDesign,
    restoreDesign,
  };
}
