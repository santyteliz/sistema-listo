import { useEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, type IText } from 'fabric';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { renderGuides } from './guides';
import { applyTextCurve, getCurveState, isTextObject, toTextSelection } from './curvedText';
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

/**
 * Crea y administra la instancia de Fabric.Canvas fuera del ciclo de
 * renderizado de React: se crea una sola vez al montar (useEffect +
 * useRef), y se destruye al desmontar. React nunca guarda el canvas ni sus
 * objetos en useState — Fabric es la fuente de verdad del estado gráfico.
 * Lo único que se sincroniza a estado de React es lo mínimo que la UI
 * necesita: la capa de acciones (una vez que existe) y la selección actual
 * (ver docs/ARCHITECTURE.md).
 */
export function useFabricCanvas(canvasElRef: RefObject<HTMLCanvasElement | null>) {
  const canvasRef = useRef<Canvas | null>(null);
  const [actions, setActions] = useState<EditorActions | null>(null);
  const [selection, setSelection] = useState<EditorSelection>({ type: 'none' });

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
    });
    canvasRef.current = canvas;

    renderGuides(canvas, VIROLA_CONFIG);

    function syncSelectionFromCanvas(): void {
      const active = canvas.getActiveObject();
      setSelection(isTextObject(active) ? toTextSelection(active) : { type: 'none' });
    }

    function handleTextChanged({ target }: { target: IText }): void {
      applyTextCurve(target, VIROLA_CONFIG.textCurveRadius, getCurveState(target));
      canvas.requestRenderAll();
      setSelection(toTextSelection(target));
    }

    canvas.on('selection:created', syncSelectionFromCanvas);
    canvas.on('selection:updated', syncSelectionFromCanvas);
    canvas.on('selection:cleared', () => setSelection({ type: 'none' }));
    canvas.on('text:changed', handleTextChanged);

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
      if (import.meta.env.DEV) {
        delete window.__editorActions;
      }
    };
  }, [canvasElRef]);

  return { actions, selection };
}
