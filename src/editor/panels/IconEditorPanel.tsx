import type { ChangeEvent } from 'react';
import { useEditor } from '../state/EditorContext';
import type { EditorActions } from '../canvas/actions';
import type { EditorSelection } from '../state/selection';
import { getIconDefinition } from '../icons/iconLibrary';
import './IconEditorPanel.css';

interface IconEditorPanelProps {
  actions: EditorActions;
  selection: Extract<EditorSelection, { type: 'icon' }>;
}

/**
 * Panel contextual del ícono seleccionado: cambiar ícono, espejar,
 * invertir, posición angular sobre el anillo, y eliminar. Todo cambio pasa
 * por la capa de acciones — este componente no toca la instancia de Fabric.
 */
export function IconEditorPanel({ actions, selection }: IconEditorPanelProps) {
  const { openIconPickerToReplace } = useEditor();
  const iconDef = getIconDefinition(selection.iconId);

  function handleFlipXChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedIconFlipX(event.target.checked);
  }

  function handleFlipYChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedIconFlipY(event.target.checked);
  }

  function handleAngleChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedIconAngle(Number(event.target.value));
  }

  return (
    <section className="icon-editor-panel">
      <h2 className="icon-editor-panel__title">Ícono seleccionado</h2>

      <div className="icon-editor-panel__current">
        {iconDef && (
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path d={iconDef.svgPath} fill="none" stroke="currentColor" strokeWidth={6} />
          </svg>
        )}
        <span>{iconDef?.name ?? selection.iconId}</span>
      </div>

      {/*
        Reutiliza el mismo modal que "Agregar ícono": acá se abre en modo
        "reemplazar" porque ya hay un ícono seleccionado (ver captura de
        referencia 08 — mismo gesto que el doble click sobre el canvas).
      */}
      <button type="button" className="icon-editor-panel__change" onClick={openIconPickerToReplace}>
        Cambiar ícono
      </button>
      <p className="icon-editor-panel__hint">
        También podés hacer doble click sobre el ícono en el lienzo.
      </p>

      <label className="icon-editor-panel__checkbox">
        <input type="checkbox" checked={selection.flipX} onChange={handleFlipXChange} />
        Espejar horizontalmente
      </label>

      <label className="icon-editor-panel__checkbox">
        <input type="checkbox" checked={selection.flipY} onChange={handleFlipYChange} />
        Invertir verticalmente
      </label>

      <label className="icon-editor-panel__field">
        Posición alrededor de la virola
        <input
          type="range"
          min={0}
          max={359}
          value={selection.angleDeg}
          onChange={handleAngleChange}
        />
      </label>

      <button
        type="button"
        className="icon-editor-panel__delete"
        onClick={() => actions.removeSelectedObject()}
      >
        Eliminar
      </button>
    </section>
  );
}
