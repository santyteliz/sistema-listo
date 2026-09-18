import { useState } from 'react';
import { useEditor } from '../../editor/state/EditorContext';
import { TextEditorPanel } from '../../editor/panels/TextEditorPanel';
import { IconEditorPanel } from '../../editor/panels/IconEditorPanel';
import { ElementCounter } from '../../editor/panels/ElementCounter';
import { CircularLinesPanel } from '../../editor/panels/CircularLinesPanel';
import { MAX_DESIGN_ELEMENTS, MAX_TEXT_ELEMENTS, MAX_ICON_ELEMENTS } from '../../editor/canvas/designLimits';
import './Sidebar.css';

/**
 * Panel lateral izquierdo. Todavía sin plantillas — esta tarea agrega los
 * botones para crear texto curvo e íconos, y el panel contextual
 * correspondiente (texto, ícono, o estado vacío).
 */
export function Sidebar() {
  const { actions, selection, elementCounts, circularLineStyle, openIconPickerToAdd, isTextEditorOpen, closeTextEditor } = useEditor();
  const isAtTotalLimit = elementCounts.total >= MAX_DESIGN_ELEMENTS;
  const isTextDisabled = !actions || isAtTotalLimit || elementCounts.text >= MAX_TEXT_ELEMENTS;
  const isIconDisabled = !actions || isAtTotalLimit || elementCounts.icon >= MAX_ICON_ELEMENTS;
  // Estado puramente local de la UI de confirmación de "Empezar desde
  // cero" — no describe nada del canvas, así que no necesita vivir en
  // EditorContext (mismo criterio que `iconPickerMode` ahí, pero acá ni
  // siquiera hace falta compartirlo entre componentes).
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const isDesignEmpty = elementCounts.total === 0 && circularLineStyle === 'none';

  function handleResetClick(): void {
    // Con la virola ya vacía, confirmar no aporta nada — resetea directo.
    if (isDesignEmpty) {
      actions?.resetDesign();
      return;
    }
    setIsConfirmingReset(true);
  }

  function handleConfirmReset(): void {
    actions?.resetDesign();
    setIsConfirmingReset(false);
  }

  return (
    <aside className="sidebar">
      <ElementCounter counts={elementCounts} />

      <section className="sidebar__toolbox" aria-label="Herramientas de diseño">
        <h2 className="sidebar__section-label">Herramientas</h2>
        <div className="sidebar__add-buttons">
          <button
            type="button"
            className="sidebar__add-text"
            disabled={isTextDisabled}
            onClick={() => actions?.addCurvedText()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5h14M12 5v14M8 19h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Agregar texto</span>
          </button>
          <button
            type="button"
            className="sidebar__add-text"
            disabled={isIconDisabled}
            onClick={openIconPickerToAdd}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 5.5h8.5L18 9v9.5H6zM14 5.5V9h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 11v5M9.5 13.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Agregar ícono</span>
          </button>
        </div>
      </section>

      <CircularLinesPanel actions={actions} style={circularLineStyle} />

      {selection.type === 'text' && actions && isTextEditorOpen && (
        <TextEditorPanel actions={actions} selection={selection} onClose={closeTextEditor} />
      )}
      {selection.type === 'text' && !isTextEditorOpen && (
        <p className="sidebar__placeholder">
          Tocá &quot;Editar&quot; en el menú junto al texto para modificar su contenido.
        </p>
      )}
      {selection.type === 'icon' && actions && (
        <IconEditorPanel actions={actions} selection={selection} />
      )}
      {selection.type === 'none' && (
        <p className="sidebar__placeholder">
          Seleccioná un elemento del canvas para editarlo.
        </p>
      )}

      <div className="sidebar__reset">
        {isConfirmingReset ? (
          <>
            <p className="sidebar__reset-message">
              <strong>¿Empezar desde cero?</strong>
              <br />
              Se eliminarán todos los elementos de tu diseño.
            </p>
            <div className="sidebar__reset-confirm-buttons">
              <button type="button" className="sidebar__reset-cancel" onClick={() => setIsConfirmingReset(false)}>
                Cancelar
              </button>
              <button type="button" className="sidebar__reset-confirm" onClick={handleConfirmReset}>
                Empezar desde cero
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="sidebar__reset-button" disabled={!actions} onClick={handleResetClick}>
            Empezar desde cero
          </button>
        )}
      </div>
    </aside>
  );
}
