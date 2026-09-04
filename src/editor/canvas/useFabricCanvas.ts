import { useEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, type FabricObject, type IText } from 'fabric';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { renderGuides } from './guides';
import { applyTextCurve, getCurveState, isTextObject, toTextSelection } from './curvedText';
import { isIconObject, toIconSelection } from './iconElement';
import { getDesignElementCounts, type DesignElementCounts } from './designLimits';
import { createEditorActions, type EditorActions } from './actions';
import { preloadEditorFonts } from '../fonts/fontLibrary';
import type { EditorSelection } from '../state/selection';

declare global {
  interface Window {
    /**
     * Puente de depuración, solo en desarrollo (`import.meta.env.DEV`), para
     * poder probar `serializeDesign`/`restoreDesign` desde fuera de React
     * (ej. verificación manual o automatizada en el navegador). No existe en
     * el build de producción.
     */
    __editorActions?: EditorActions;
  }
}

export interface UseFabricCanvasOptions {
  /** Se llama cuando el usuario hace doble click sobre un ícono del canvas. */
  onIconDoubleClick?: () => void;
}

/**
 * Crea y administra la instancia de Fabric.Canvas fuera del ciclo de
 * renderizado de React: se crea una sola vez al montar (useEffect +
 * useRef), y se destruye al desmontar. React nunca guarda el canvas ni sus
 * objetos en useState — Fabric es la fuente de verdad del estado gráfico.
 * Lo único que se sincroniza a estado de React es lo mínimo que la UI
 * necesita: la capa de acciones (una vez que existe) y la selección actual
 * (ver docs/ARCHITECTURE.md).
 */
export function useFabricCanvas(
  canvasElRef: RefObject<HTMLCanvasElement | null>,
  options: UseFabricCanvasOptions = {},
) {
  const canvasRef = useRef<Canvas | null>(null);
  const [actions, setActions] = useState<EditorActions | null>(null);
  const [selection, setSelection] = useState<EditorSelection>({ type: 'none' });
  const [elementCounts, setElementCounts] = useState<DesignElementCounts>({ total: 0, text: 0, icon: 0 });
  const onIconDoubleClickRef = useRef(options.onIconDoubleClick);
  onIconDoubleClickRef.current = options.onIconDoubleClick;

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) {
      return;
    }

    const canvas = new Canvas(canvasEl, {
      width: VIROLA_CONFIG.width,
      height: VIROLA_CONFIG.height,
      backgroundColor: '#ffffff',
      selection: true,
      // NO usar perPixelTargetFind acá: probado y descartado. Con íconos de
      // solo trazo (sin relleno, a propósito — ver iconLibrary.ts) el
      // interior transparente no cuenta como "click válido" bajo detección
      // por píxel, así que solo el contorno finito quedaría clickeable — el
      // problema real (un ícono en su posición inicial coincidiendo con el
      // cuadro delimitador del texto curvo) se resolvió separando los radios
      // de texto e íconos en VirolaConfig/iconElement.ts en su lugar.
    });
    canvasRef.current = canvas;

    renderGuides(canvas, VIROLA_CONFIG);

    function selectionToState(active: FabricObject | undefined): EditorSelection {
      if (isTextObject(active)) {
        return toTextSelection(active);
      }
      if (isIconObject(active)) {
        return toIconSelection(active);
      }
      return { type: 'none' };
    }

    function syncSelectionFromCanvas(): void {
      setSelection(selectionToState(canvas.getActiveObject()));
    }

    function handleTextChanged({ target }: { target: IText }): void {
      applyTextCurve(target, VIROLA_CONFIG, getCurveState(target));
      canvas.requestRenderAll();
      setSelection(toTextSelection(target));
    }

    function handleObjectModified({ target }: { target: FabricObject }): void {
      if (isIconObject(target)) {
        setSelection(toIconSelection(target));
      }
    }

    function handleDoubleClick({ target }: { target?: FabricObject }): void {
      if (isIconObject(target)) {
        onIconDoubleClickRef.current?.();
      }
    }

    // Se recalcula desde cero (no se suma/resta a mano) cada vez que se
    // agrega o saca un objeto del canvas — así no importa si el cambio
    // viene de agregar texto/ícono, eliminar, reemplazar un ícono (que
    // saca uno y agrega otro) o restaurar un diseño completo: siempre
    // termina reflejando la cantidad real de elementos (total y por tipo),
    // sin poder desincronizarse.
    function syncElementCounts(): void {
      setElementCounts(getDesignElementCounts(canvas));
    }

    canvas.on('selection:created', syncSelectionFromCanvas);
    canvas.on('selection:updated', syncSelectionFromCanvas);
    canvas.on('selection:cleared', () => setSelection({ type: 'none' }));
    canvas.on('text:changed', handleTextChanged);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('mouse:dblclick', handleDoubleClick);
    canvas.on('object:added', syncElementCounts);
    canvas.on('object:removed', syncElementCounts);

    canvas.requestRenderAll();

    // Las tipografías se cargan de verdad en segundo plano (declaradas en
    // index.html); una vez listas, se vuelve a pintar para que cualquier
    // texto ya agregado antes de que terminaran de cargar se vea con la
    // tipografía real y no con el reemplazo del navegador.
    preloadEditorFonts().then(() => {
      canvas.requestRenderAll();
    });

    const editorActions = createEditorActions(canvas, VIROLA_CONFIG);
    setActions(editorActions);

    if (import.meta.env.DEV) {
      window.__editorActions = editorActions;
    }

    // Responsive: en pantallas angostas (celular/tablet), el <canvas> nativo
    // (siempre VIROLA_CONFIG.width/height de resolución, ~640px, para que el
    // grabado se vea nítido) no puede ocupar más ancho que el que le deja su
    // contenedor sin generar scroll horizontal (sección 12/16 de la Etapa 4:
    // requisito de UI, no un cambio de geometría de la virola — los 640px de
    // *resolución* interna no cambian, solo el tamaño en pantalla).
    //
    // Se logra con `setDimensions` (tamaño real en pantalla) + `setZoom`
    // (mismo factor), en vez de solo CSS: `setZoom` reescala el
    // `viewportTransform`, que es lo que Fabric.js usa tanto para dibujar
    // como para traducir clicks/touches a coordenadas de escena (ver
    // `getPointer`) — así los objetos siguen siendo seleccionables,
    // arrastrables, etc. con precisión en cualquier tamaño de pantalla. Un
    // simple `max-width` por CSS únicamente escala la imagen, no los
    // eventos de puntero, y desalinearía el drag/resize de Fabric.js.
    const container = canvasEl.parentElement;

    function getAvailableWidth(el: HTMLElement): number {
      const style = window.getComputedStyle(el);
      const paddingX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      return Math.max(0, el.clientWidth - paddingX);
    }

    function applyResponsiveScale(): void {
      if (!container) {
        return;
      }
      const availableWidth = getAvailableWidth(container);
      if (!availableWidth) {
        return;
      }
      // Nunca se agranda más allá de la resolución nativa (escalar > 1
      // desenfocaría el trazo, sin ninguna ganancia real de espacio útil).
      const scale = Math.min(1, availableWidth / VIROLA_CONFIG.width);
      canvas.setDimensions({
        width: VIROLA_CONFIG.width * scale,
        height: VIROLA_CONFIG.height * scale,
      });
      canvas.setZoom(scale);
      canvas.requestRenderAll();
    }

    applyResponsiveScale();

    let resizeObserver: ResizeObserver | undefined;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(applyResponsiveScale);
      resizeObserver.observe(container);
    }

    return () => {
      resizeObserver?.disconnect();
      canvas.dispose();
      canvasRef.current = null;
      setActions(null);
      setSelection({ type: 'none' });
      setElementCounts({ total: 0, text: 0, icon: 0 });
      if (import.meta.env.DEV) {
        delete window.__editorActions;
      }
    };
  }, [canvasElRef]);

  return { actions, selection, elementCounts };
}
