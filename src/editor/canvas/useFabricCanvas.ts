import { useEffect, useRef, type RefObject } from 'react';
import { Canvas } from 'fabric';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { renderGuides } from './guides';
import { createEditorActions, type EditorActions } from './actions';

/**
 * Crea y administra la instancia de Fabric.Canvas fuera del ciclo de
 * renderizado de React: se crea una sola vez al montar (useEffect +
 * useRef), y se destruye al desmontar. React nunca guarda el canvas ni sus
 * objetos en useState — Fabric es la fuente de verdad del estado gráfico
 * (ver docs/ARCHITECTURE.md).
 */
export function useFabricCanvas(canvasElRef: RefObject<HTMLCanvasElement | null>) {
  const canvasRef = useRef<Canvas | null>(null);
  const actionsRef = useRef<EditorActions | null>(null);

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
    actionsRef.current = createEditorActions(canvas);

    renderGuides(canvas, VIROLA_CONFIG);
    canvas.requestRenderAll();

    return () => {
      canvas.dispose();
      canvasRef.current = null;
      actionsRef.current = null;
    };
  }, [canvasElRef]);

  return { canvasRef, actionsRef };
}
