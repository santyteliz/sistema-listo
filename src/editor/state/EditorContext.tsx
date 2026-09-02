import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { useFabricCanvas } from '../canvas/useFabricCanvas';
import type { EditorActions } from '../canvas/actions';
import type { EditorSelection } from './selection';

interface EditorContextValue {
  /** Ref del elemento <canvas> del DOM; lo consume únicamente MateCanvas. */
  canvasElRef: RefObject<HTMLCanvasElement | null>;
  /** Capa de comandos del editor (null hasta que el canvas termina de montarse). */
  actions: EditorActions | null;
  /** Estado mínimo de UI derivado de la selección actual en Fabric.js. */
  selection: EditorSelection;
}

const EditorContext = createContext<EditorContextValue | null>(null);

/**
 * Dueño de la instancia de Fabric.js para toda la sesión de edición. Envuelve
 * la página del editor y expone `actions`/`selection` a cualquier componente
 * que los necesite (paneles, canvas), sin que esos componentes conozcan a
 * Fabric.js directamente (ver docs/ARCHITECTURE.md).
 */
export function EditorProvider({ children }: { children: ReactNode }) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const { actions, selection } = useFabricCanvas(canvasElRef);

  return (
    <EditorContext.Provider value={{ canvasElRef, actions, selection }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor debe usarse dentro de <EditorProvider>');
  }
  return context;
}
