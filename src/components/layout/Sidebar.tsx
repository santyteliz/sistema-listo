import { useEditor } from '../../editor/state/EditorContext';
import { TextEditorPanel } from '../../editor/panels/TextEditorPanel';
import { IconEditorPanel } from '../../editor/panels/IconEditorPanel';
import './Sidebar.css';

/**
 * Panel lateral izquierdo. Todavía sin plantillas — esta tarea agrega los
 * botones para crear texto curvo e íconos, y el panel contextual
 * correspondiente (texto, ícono, o estado vacío).
 */
export function Sidebar() {
  const { actions, selection, openIconPickerToAdd } = useEditor();

  return (
    <aside className="sidebar">
      <div className="sidebar__add-buttons">
        <button
          type="button"
          className="sidebar__add-text"
          disabled={!actions}
          onClick={() => actions?.addCurvedText()}
        >
          Agregar texto
        </button>
        <button
          type="button"
          className="sidebar__add-text"
          disabled={!actions}
          onClick={openIconPickerToAdd}
        >
          Agregar ícono
        </button>
      </div>

      {selection.type === 'text' && actions && (
        <TextEditorPanel actions={actions} selection={selection} />
      )}
      {selection.type === 'icon' && actions && (
        <IconEditorPanel actions={actions} selection={selection} />
      )}
      {selection.type === 'none' && (
        <p className="sidebar__placeholder">
          Seleccioná un elemento del canvas para editarlo.
        </p>
      )}
    </aside>
  );
}
