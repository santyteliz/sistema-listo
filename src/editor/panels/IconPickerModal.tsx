import { useEditor } from '../state/EditorContext';
import { ICON_LIBRARY, type IconDefinition } from '../icons/iconLibrary';
import './IconPickerModal.css';

/**
 * Selector modal de los 6 íconos legacy — reemplazado como selector visible
 * del usuario por `IconLibraryDrawer.tsx` (Etapa 3, catálogo real de 235
 * íconos). Se conserva sin usar (no se renderiza desde `EditorPage.tsx`)
 * como fallback temporal durante la transición, a pedido explícito — no
 * borrar hasta una etapa de limpieza posterior confirmada.
 *
 * Cada ícono se dibuja con un <path> de React (prop `d`), nunca con
 * `innerHTML` — son recursos propios y controlados (ver iconLibrary.ts).
 */
export function IconPickerModal() {
  const { actions, iconPickerMode, closeIconPicker } = useEditor();

  if (iconPickerMode === 'closed' || !actions) {
    return null;
  }

  function handlePick(iconDef: IconDefinition): void {
    if (iconPickerMode === 'add') {
      actions?.addIcon(iconDef);
    } else if (iconPickerMode === 'replace') {
      actions?.replaceSelectedIcon(iconDef);
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
              onClick={() => handlePick(icon)}
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
