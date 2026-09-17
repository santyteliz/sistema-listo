import type { ChangeEvent } from 'react';
import { useEditor } from '../state/EditorContext';
import type { EditorActions } from '../canvas/actions';
import type { EditorSelection } from '../state/selection';
import { getIconDefinition } from '../icons/iconLibrary';
import { useIconCatalog } from '../icons/useIconCatalog';
import { IconGeometryPreview } from '../icons/IconGeometryPreview';
import './IconEditorPanel.css';

interface IconEditorPanelProps {
  actions: EditorActions;
  selection: Extract<EditorSelection, { type: 'icon' }>;
}

/**
 * Panel contextual del ícono seleccionado: cambiar ícono y posición angular
 * sobre el anillo. Todo cambio pasa por la capa de acciones — este
 * componente no toca la instancia de Fabric. Espejar, invertir, tamaño,
 * rotación propia y eliminar viven únicamente en el `ContextualToolbar`
 * flotante (no se duplican acá).
 *
 * El preview del ícono seleccionado busca primero en el catálogo REAL
 * (`useIconCatalog`, 235 íconos de `manifest.json`, Etapa 3) y si no
 * aparece ahí, en los 6 íconos legacy (`getIconDefinition`,
 * `iconLibrary.ts`) — un diseño guardado antes de esta etapa puede seguir
 * teniendo `iconId`s legacy, y deben poder editarse igual.
 */
export function IconEditorPanel({ actions, selection }: IconEditorPanelProps) {
  const { openIconPickerToReplace } = useEditor();
  const { findIconAssetById } = useIconCatalog();
  // ETAPA 8B: un ícono SVG subido por el usuario nunca está en el catálogo
  // descargado (`useIconCatalog`) ni en los 6 legacy (`iconLibrary.ts`) —
  // no se agrega a `public/icons/manifest.json`, es una creación de la
  // sesión. En ese caso, `getSelectedIconRuntimeDefinition` lo deriva
  // directamente del objeto Fabric ya seleccionado (ver el comentario de
  // `getIconRuntimeDefinition`, `iconElement.ts`), sin mantener un
  // registro paralelo.
  const iconDef = findIconAssetById(selection.iconId) ?? getIconDefinition(selection.iconId) ?? actions.getSelectedIconRuntimeDefinition();

  function handleAngleChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedIconAngle(Number(event.target.value));
  }

  return (
    <section className="icon-editor-panel">
      <h2 className="icon-editor-panel__title">Ícono seleccionado</h2>

      <div className="icon-editor-panel__current">
        {iconDef && <IconGeometryPreview icon={iconDef} />}
        <span>{iconDef?.name ?? selection.iconId}</span>
      </div>

      {/*
        Reutiliza el mismo modal que "Agregar ícono": acá se abre en modo
        "reemplazar" porque ya hay un ícono seleccionado.
      */}
      <button type="button" className="icon-editor-panel__change" onClick={openIconPickerToReplace}>
        Cambiar ícono
      </button>
      <p className="icon-editor-panel__hint">
        Arrastrá el ícono en el lienzo para moverlo. Para agrandarlo,
        rotarlo, espejarlo o eliminarlo, usá el menú que aparece junto a él
        al seleccionarlo.
      </p>

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
    </section>
  );
}
