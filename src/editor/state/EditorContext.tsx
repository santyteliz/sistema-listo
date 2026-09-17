import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFabricCanvas } from '../canvas/useFabricCanvas';
import { useDesignHistory } from '../history/useDesignHistory';
import type { EditorActions } from '../canvas/actions';
import type { DesignElementCounts } from '../canvas/designLimits';
import type { CircularLineStyle } from '../canvas/circularLines';
import type { EditorSelection } from './selection';

/**
 * Estado del selector de íconos: cerrado, abierto para agregar uno nuevo, o
 * abierto para reemplazar el ícono seleccionado (botón "Cambiar ícono" del
 * panel lateral). Es estado puro de navegación de UI — no describe nada del
 * canvas — así que vive acá y no en la capa de Fabric.
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
  /** Estilo actual de las líneas circulares decorativas ("No"/"Simple"/"Doble"). Ver circularLines.ts. */
  circularLineStyle: CircularLineStyle;
  iconPickerMode: IconPickerMode;
  openIconPickerToAdd: () => void;
  openIconPickerToReplace: () => void;
  closeIconPicker: () => void;
  /** true cuando el menú contextual flotante (ver ContextualToolbar) debe mostrarse. */
  isContextMenuOpen: boolean;
  closeContextMenu: () => void;
  /**
   * true cuando el contenedor de edición de contenido del texto (ver
   * `TextEditorPanel`, disparado por el botón "Editar" del ContextualToolbar)
   * debe mostrarse. Seleccionar un texto ya NO abre este panel — el usuario
   * lo abre a propósito, para distinguir "seleccionar" de "editar contenido"
   * (ver la referencia de interacción de esta tarea). Se resetea solo a
   * `false` en cuanto la selección deja de ser un texto (ver el `useEffect`
   * en `EditorProvider`), para que reseleccionar más adelante no lo reabra
   * sin que el usuario lo pida de nuevo.
   */
  isTextEditorOpen: boolean;
  openTextEditor: () => void;
  closeTextEditor: () => void;
  /** Historial de estados del diseño (ver useDesignHistory.ts) — Deshacer/Rehacer. */
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
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
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);
  const { actions, selection, elementCounts, circularLineStyle, isContextMenuOpen, closeContextMenu } = useFabricCanvas(canvasElRef);
  const { canUndo, canRedo, undo, redo } = useDesignHistory(actions);

  // En cuanto la selección deja de ser un texto (deseleccionado, o pasa a
  // ser un ícono), el contenedor de edición se cierra solo — evita que
  // quede "abierto en el fondo" y reaparezca si más adelante se vuelve a
  // seleccionar un texto sin que el usuario haya tocado "Editar" de nuevo.
  useEffect(() => {
    if (selection.type !== 'text') {
      setIsTextEditorOpen(false);
    }
  }, [selection.type]);

  return (
    <EditorContext.Provider
      value={{
        canvasElRef,
        actions,
        selection,
        elementCounts,
        circularLineStyle,
        iconPickerMode,
        openIconPickerToAdd: () => setIconPickerMode('add'),
        openIconPickerToReplace: () => setIconPickerMode('replace'),
        closeIconPicker: () => setIconPickerMode('closed'),
        isContextMenuOpen,
        closeContextMenu,
        isTextEditorOpen,
        openTextEditor: () => setIsTextEditorOpen(true),
        closeTextEditor: () => setIsTextEditorOpen(false),
        canUndo,
        canRedo,
        undo,
        redo,
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
