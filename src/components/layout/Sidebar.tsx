import { useEditor } from '../../editor/state/EditorContext';
import { TextEditorPanel } from '../../editor/panels/TextEditorPanel';
import './Sidebar.css';

/**
 * Panel lateral izquierdo. Todavía sin plantillas ni íconos — esta tarea
 * agrega únicamente el botón para crear texto curvo y el panel contextual
 * de edición de texto.
 */
export function Sidebar() {
  const { actions, selection } = useEditor();

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar__add-text"
        disabled={!actions}
        onClick={() => actions?.addCurvedText()}
      >
        Agregar texto
      </button>

      {selection.type === 'text' && actions ? (
        <TextEditorPanel actions={actions} text={selection.text} />
      ) : (
        <p className="sidebar__placeholder">
          Seleccioná un elemento del canvas para editarlo.
        </p>
      )}
    </aside>
  );
}
