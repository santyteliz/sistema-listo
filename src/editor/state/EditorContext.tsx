import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFabricCanvas } from '../canvas/useFabricCanvas';
import type { EditorActions } from '../canvas/actions';
import type { DesignElementCounts } from '../canvas/designLimits';
import type { EditorSelection } from './selection';

/**
 * Estado del selector de íconos: cerrado, abierto para agregar uno nuevo, o
 * abierto para reemplazar el ícono seleccionado (doble click sobre el
 * canvas). Es estado puro de navegación de UI — no describe nada del canvas
 * — así que vive acá y no en la capa de Fabric.
 */
export type IconPickerMode = 'closed' | 'add' | 'replace';

interface EditorContextValue {
  /** Ref del elemento <canvas> del DOM; lo consume únicamente MateCanvas. */
  canvasElRef: RefObject<HTMLCanvasElement | null>;
  /** Capa de comandos del editor (null hasta que el canvas termina de montarse). */
  actions: EditorActions | null;
  /** Estado mínimo de UI derivado de la selección actual en Fabric.js. */
  selection: EditorSelection;
  /** Cantidad actual de elementos de diseño reales, total y por tipo (sin contar guías). Ver designLimits.ts. */
  elementCounts: DesignElementCounts;
  iconPickerMode: IconPickerMode;
  openIconPickerToAdd: () => void;
  openIconPickerToReplace: () => void;
  closeIconPicker: () => void;
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
  const [iconPickerMode, setIconPickerMode] = useState<IconPickerMode>('closed');
  const { actions, selection, elementCounts } = useFabricCanvas(canvasElRef, {
    onIconDoubleClick: () => setIconPickerMode('replace'),
  });

  return (
    <EditorContext.Provider
      value={{
        canvasElRef,
        actions,
        selection,
        elementCounts,
        iconPickerMode,
        openIconPickerToAdd: () => setIconPickerMode('add'),
        openIconPickerToReplace: () => setIconPickerMode('replace'),
        closeIconPicker: () => setIconPickerMode('closed'),
      }}
    >
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
