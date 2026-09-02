import type { ChangeEvent } from 'react';
import type { EditorActions } from '../canvas/actions';
import './TextEditorPanel.css';

interface TextEditorPanelProps {
  actions: EditorActions;
  text: string;
}

/**
 * Panel contextual mínimo para el texto seleccionado: editar el contenido y
 * eliminarlo. Todo cambio pasa por la capa de acciones — este componente no
 * toca la instancia de Fabric.
 */
export function TextEditorPanel({ actions, text }: TextEditorPanelProps) {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    actions.updateSelectedTextContent(event.target.value);
  }

  return (
    <section className="text-editor-panel">
      <h2 className="text-editor-panel__title">Texto seleccionado</h2>

      <label className="text-editor-panel__field">
        Contenido
        <textarea value={text} onChange={handleChange} rows={2} />
      </label>

      <button
        type="button"
        className="text-editor-panel__delete"
        onClick={() => actions.removeSelectedObject()}
      >
        Eliminar
      </button>
    </section>
  );
}
