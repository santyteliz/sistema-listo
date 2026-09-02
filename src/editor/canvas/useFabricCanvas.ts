import { useEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, type IText } from 'fabric';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { renderGuides } from './guides';
import { applyTextCurve, isTextObject } from './curvedText';
import { createEditorActions, type EditorActions } from './actions';
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
      setSelection(isTextObject(active) ? { type: 'text', text: active.text } : { type: 'none' });
    }

    function handleTextChanged({ target }: { target: IText }): void {
      applyTextCurve(target, VIROLA_CONFIG.textCurveRadius);
      canvas.requestRenderAll();
      setSelection({ type: 'text', text: target.text });
    }

    canvas.on('selection:created', syncSelectionFromCanvas);
    canvas.on('selection:updated', syncSelectionFromCanvas);
    canvas.on('selection:cleared', () => setSelection({ type: 'none' }));
    canvas.on('text:changed', handleTextChanged);

    canvas.requestRenderAll();

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
