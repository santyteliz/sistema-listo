import { useEditor } from '../../editor/state/EditorContext';
import { TextEditorPanel } from '../../editor/panels/TextEditorPanel';
import { IconEditorPanel } from '../../editor/panels/IconEditorPanel';
import { ElementCounter } from '../../editor/panels/ElementCounter';
import { MAX_DESIGN_ELEMENTS, MAX_TEXT_ELEMENTS, MAX_ICON_ELEMENTS } from '../../editor/canvas/designLimits';
import './Sidebar.css';

/**
 * Panel lateral izquierdo. Todavía sin plantillas — esta tarea agrega los
 * botones para crear texto curvo e íconos, y el panel contextual
 * correspondiente (texto, ícono, o estado vacío).
 */
export function Sidebar() {
  const { actions, selection, elementCounts, openIconPickerToAdd } = useEditor();
  const isAtTotalLimit = elementCounts.total >= MAX_DESIGN_ELEMENTS;
  const isTextDisabled = !actions || isAtTotalLimit || elementCounts.text >= MAX_TEXT_ELEMENTS;
  const isIconDisabled = !actions || isAtTotalLimit || elementCounts.icon >= MAX_ICON_ELEMENTS;

  return (
    <aside className="sidebar">
      <ElementCounter counts={elementCounts} />

      <div className="sidebar__add-buttons">
        <button
          type="button"
          className="sidebar__add-text"
          disabled={isTextDisabled}
          onClick={() => actions?.addCurvedText()}
        >
          Agregar texto
        </button>
        <button
          type="button"
          className="sidebar__add-text"
          disabled={isIconDisabled}
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
