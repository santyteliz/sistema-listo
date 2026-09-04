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
      backgroundColor: '#f7f6f2',
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
      applyTextCurve(target, VIROLA_CONFIG.textCurveRadius, getCurveState(target));
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

    return () => {
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
