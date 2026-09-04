import { useEditor } from '../state/EditorContext';
import { ICON_LIBRARY } from '../icons/iconLibrary';
import './IconPickerModal.css';

/**
 * Selector de íconos de la biblioteca propia. Se reutiliza para dos casos
 * (ver docs de la tarea): agregar un ícono nuevo, y reemplazar el ícono
 * seleccionado (doble click sobre un ícono en el canvas). El modo lo decide
 * `EditorContext` (`iconPickerMode`); este componente solo lee ese estado y
 * llama a la acción correspondiente.
 *
 * Cada ícono se dibuja con un <path> de React (prop `d`), nunca con
 * `innerHTML` — son recursos propios y controlados (ver iconLibrary.ts).
 */
export function IconPickerModal() {
  const { actions, iconPickerMode, closeIconPicker } = useEditor();

  if (iconPickerMode === 'closed' || !actions) {
    return null;
  }

  function handlePick(iconId: string): void {
    if (iconPickerMode === 'add') {
      actions?.addIcon(iconId);
    } else if (iconPickerMode === 'replace') {
      actions?.replaceSelectedIcon(iconId);
    }
    closeIconPicker();
  }

  return (
    <div className="icon-picker-backdrop" onClick={closeIconPicker}>
      <div className="icon-picker" onClick={(event) => event.stopPropagation()}>
        <div className="icon-picker__header">
          <h2>{iconPickerMode === 'replace' ? 'Cambiar ícono' : 'Agregar ícono'}</h2>
          <button
            type="button"
            className="icon-picker__close"
            onClick={closeIconPicker}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="icon-picker__grid">
          {ICON_LIBRARY.map((icon) => (
            <button
              key={icon.id}
              type="button"
              className="icon-picker__item"
              onClick={() => handlePick(icon.id)}
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <path d={icon.svgPath} fill="none" stroke="currentColor" strokeWidth={6} />
              </svg>
              <span>{icon.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
