import { useEffect, useReducer, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useEditor } from '../state/EditorContext';
import { useIconCatalog } from '../icons/useIconCatalog';
import { getIconThumbnailUrl } from '../icons/loadIconManifest';
import type { IconAsset } from '../icons/iconCatalog';
import { extractRasterIcon } from '../icons/rasterIconExtractor';
import { validateUploadedRasterFile } from '../icons/uploadRasterValidation';
import {
  uploadFlowReducer,
  INITIAL_UPLOAD_FLOW_STATE,
  uploadConfirmLabel,
  buildUploadedIconAsset,
  UPLOAD_FORMAT_HINT,
} from '../icons/uploadIconFlow';
import { IconGeometryPreview } from '../icons/IconGeometryPreview';
import './IconLibraryDrawer.css';

/**
 * Biblioteca real de íconos (Etapa 3) — drawer lateral derecho que
 * reemplaza al selector modal anterior (`IconPickerModal.tsx`, que se deja
 * sin usar pero no se borra todavía, ver el informe de esa etapa).
 *
 * Navegación: categorías → grilla de una categoría → selección — sin
 * buscador (Etapa 4: se sacó a pedido explícito; `useIconCatalog.searchIcons`
 * sigue existiendo como capacidad del hook, solo dejó de usarse acá).
 * Reutiliza exactamente el mismo `iconPickerMode` ('add'/'replace') que ya
 * existía en `EditorContext` — no se le cambia la semántica: en modo 'add'
 * llama a `actions.addIcon`, en modo 'replace' a
 * `actions.replaceSelectedIcon`, ambas ya adaptadas (Etapa 3) para recibir
 * el `IconAsset` completo en vez de un id a buscar en otro lado.
 *
 * Etapa 8B: agrega, DENTRO de este mismo drawer (nunca una experiencia
 * separada), la vista "Subí tu propio ícono" — un tercer estado de
 * navegación (`'upload'`, junto a `'categories'`/`'category'`) con su
 * propia máquina de estados chica (`idle`/`drag-over`/`processing`/
 * `preview`/`error`). El resultado final, una vez confirmado, se le pasa a
 * la MISMA `handleSelect` que ya usaba la biblioteca — `addIcon`/
 * `replaceSelectedIcon` no distinguen (ni necesitan distinguir) si el
 * `IconAsset` vino del catálogo real o de un archivo subido.
 *
 * Esta UI no importa `fabric` en ningún momento — solo datos
 * (`IconAsset[]`, vía `useIconCatalog`) y la capa de acciones ya existente.
 */
export function IconLibraryDrawer() {
  const { actions, iconPickerMode, closeIconPicker } = useEditor();
  const { status, categories, error, getIconsByCategory } = useIconCatalog();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [view, setView] = useState<'categories' | 'category' | 'upload'>('categories');
  // Recuerda el último `iconPickerMode` visto, para poder detectar un
  // cambio DURANTE el render (patrón "ajustar estado cuando cambia una
  // prop" de React, sin useEffect) — el componente nunca se desmonta al
  // cerrarse (solo devuelve `null`, ver el `return` más abajo), así que su
  // estado interno no se reinicia solo entre una apertura y la siguiente.
  const [prevIconPickerMode, setPrevIconPickerMode] = useState(iconPickerMode);

  const isOpen = iconPickerMode !== 'closed';

  // Cada vez que cambia el modo (cerrado→abierto, o incluso add↔replace),
  // arranca desde cero: lista de categorías (ni la vista de upload
  // sobrevive de una apertura a la siguiente).
  if (iconPickerMode !== prevIconPickerMode) {
    setPrevIconPickerMode(iconPickerMode);
    setSelectedCategoryId(null);
    setView('categories');
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        closeIconPicker();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeIconPicker]);

  if (!isOpen || !actions) {
    return null;
  }

  function handleSelect(icon: IconAsset): void {
    if (iconPickerMode === 'add') {
      actions?.addIcon(icon);
    } else if (iconPickerMode === 'replace') {
      actions?.replaceSelectedIcon(icon);
    }
    closeIconPicker();
  }

  const selectedCategory = selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId) ?? null : null;
  const title = view === 'upload' ? 'Crear nuevo ícono' : selectedCategory ? selectedCategory.name : 'Elegí una categoría';

  function handleBack(): void {
    if (view === 'upload') {
      setView('categories');
      return;
    }
    setSelectedCategoryId(null);
  }

  return (
    <div
      className="icon-drawer-backdrop"
      onClick={closeIconPicker}
      // Traga cualquier drag&drop que caiga fuera de la dropzone (pero
      // todavía dentro del modal) — sin esto, el navegador puede intentar
      // "abrir" el archivo soltado como si fuera navegado directamente, tapando
      // el editor entero. No cambia el drag&drop del resto de la app: este
      // handler solo existe mientras el drawer está montado.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <aside
        className="icon-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={iconPickerMode === 'replace' ? 'Cambiar ícono' : 'Agregar ícono'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="icon-drawer__header">
          <h2>{title}</h2>
          <button type="button" className="icon-drawer__close" onClick={closeIconPicker} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {(selectedCategory || view === 'upload') && (
          <button type="button" className="icon-drawer__back" onClick={handleBack}>
            ← Todas las categorías
          </button>
        )}

        <div className="icon-drawer__body">
          {view === 'upload' && (
            <UploadIconView
              mode={iconPickerMode === 'replace' ? 'replace' : 'add'}
              onConfirm={handleSelect}
              onCancel={() => setView('categories')}
            />
          )}

          {view === 'categories' && (
            <>
              {status === 'loading' && <p className="icon-drawer__status">Cargando biblioteca de íconos…</p>}

              {status === 'error' && (
                <p className="icon-drawer__status icon-drawer__status--error">
                  {error ?? 'No se pudo cargar la biblioteca de íconos. Cerrá y volvé a intentar.'}
                </p>
              )}

              {status === 'ready' && !selectedCategory && (
                <>
                  <button type="button" className="icon-drawer__upload-cta" onClick={() => setView('upload')}>
                    + Crear nuevo ícono
                  </button>
                  <ul className="icon-drawer__categories">
                    {categories.map((category) => (
                      <li key={category.id}>
                        <button
                          type="button"
                          className="icon-drawer__category"
                          onClick={() => setSelectedCategoryId(category.id)}
                        >
                          {category.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {status === 'ready' && selectedCategory && (
                (() => {
                  const icons = getIconsByCategory(selectedCategory.id);
                  return icons.length > 0 ? (
                    <IconGrid icons={icons} onSelect={handleSelect} />
                  ) : (
                    <p className="icon-drawer__status">Esta categoría todavía no tiene íconos.</p>
                  );
                })()
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function IconGrid({ icons, onSelect }: { icons: IconAsset[]; onSelect: (icon: IconAsset) => void }) {
  return (
    <div className="icon-drawer__grid">
      {icons.map((icon) => (
        <button
          key={icon.id}
          type="button"
          className="icon-drawer__item"
          onClick={() => onSelect(icon)}
          title={icon.name}
          aria-label={icon.name}
        >
          <img src={getIconThumbnailUrl(icon)} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/**
 * Vista "Crear nuevo ícono" (Etapa 8B, UX pulida en la Etapa 8D). Desde la
 * Etapa 9E acepta PNG/WebP (vectorizados vía `rasterIconExtractor.ts`) — ya
 * NO acepta SVG (decisión explícita de esa etapa: el cargador público pasa
 * a ser exclusivamente raster; `svgIconExtractor.ts` sigue existiendo sin
 * cambios, simplemente ya no tiene ningún consumidor en esta UI). `mode`
 * decide únicamente el copy de la acción principal (Agregar vs.
 * Reemplazar) — el `IconAsset` resultante siempre se entrega vía
 * `onConfirm` a la MISMA `handleSelect` del drawer, que ya sabía elegir
 * entre `addIcon`/`replaceSelectedIcon` según `iconPickerMode`; acá no se
 * duplica esa decisión.
 */
function UploadIconView({
  mode,
  onConfirm,
  onCancel,
}: {
  mode: 'add' | 'replace';
  onConfirm: (icon: IconAsset) => void;
  onCancel: () => void;
}) {
  const [state, dispatch] = useReducer(uploadFlowReducer, INITIAL_UPLOAD_FLOW_STATE);

  async function processFile(file: File): Promise<void> {
    const fileCheck = validateUploadedRasterFile(file);
    if (!fileCheck.ok) {
      dispatch({ type: 'validation-failed', message: fileCheck.message });
      return;
    }
    dispatch({ type: 'processing-started' });
    const result = await extractRasterIcon(file);
    if (!result.ok) {
      // `result.message` ya es texto pensado para el usuario final (ver
      // `rasterIconExtractor.ts` — nunca expone detalles técnicos de
      // decodificación/vectorización); acá no se reformula ni se agrega
      // nada.
      dispatch({ type: 'extraction-failed', message: result.message });
      return;
    }
    dispatch({ type: 'extraction-succeeded', icon: buildUploadedIconAsset(file.name, result.geometry) });
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo archivo después de un error
    if (file) {
      void processFile(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    } else {
      dispatch({ type: 'drag-leave' });
    }
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault(); // necesario para habilitar el drop, y evita que el navegador abra el archivo
    dispatch({ type: 'drag-enter' });
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    dispatch({ type: 'drag-leave' });
  }

  function handleCancel(): void {
    dispatch({ type: 'cancel' });
    onCancel();
  }

  if (state.step === 'preview') {
    return (
      <div className="icon-upload__preview">
        {/*
          Misma geometría normalizada (`svgPath`/`layers`) y mismas reglas
          de pintado (`IconGeometryPreview` — componente compartido con
          `IconEditorPanel.tsx`, único lugar que decide cómo se ve un
          ícono) que va a terminar usando el ícono ya agregado/reemplazado
          — nunca una representación distinta (ej. la imagen original con
          sus colores/transparencia) para este preview.
        */}
        <div className="icon-upload__preview-canvas">
          <IconGeometryPreview icon={state.icon} />
        </div>
        <p className="icon-upload__preview-status">✓ Diseño válido</p>
        <p className="icon-upload__preview-name">{state.icon.name}</p>
        <div className="icon-upload__preview-actions">
          <button type="button" className="icon-upload__secondary" onClick={handleCancel}>
            Cancelar
          </button>
          <button type="button" className="icon-upload__primary" onClick={() => onConfirm(state.icon)}>
            {uploadConfirmLabel(mode)}
          </button>
        </div>
      </div>
    );
  }

  const errorId = 'icon-upload-error';

  return (
    <div className="icon-upload">
      <label
        className={`icon-upload__dropzone${state.step === 'drag-over' ? ' icon-upload__dropzone--active' : ''}`}
        htmlFor="icon-upload-input"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/*
          Un <label htmlFor> envolviendo el <input type="file"> es un
          control accesible "de fábrica": recibe foco visible por teclado
          (Tab), Enter/Espacio lo activa, y un lector de pantalla anuncia el
          texto visible como su nombre — sin necesitar un botón separado que
          compita con esta misma zona de click/drop.
        */}
        {state.step === 'processing' ? (
          <p role="status">Procesando diseño…</p>
        ) : (
          <>
            <p className="icon-upload__title">Subí tu propio diseño</p>
            <p className="icon-upload__hint">Arrastrá tu archivo acá o hacé click para elegirlo</p>
            <p className="icon-upload__meta">{UPLOAD_FORMAT_HINT}</p>
            {/*
              Etapa 9G — el usuario nunca vio antes ningún indicio de que su
              imagen se convierte en un ícono monocromático (sin colores,
              sin fotos): sin esto, el resultado del preview puede
              sorprenderlo. Reutiliza la misma clase `icon-upload__meta` (sin
              CSS nuevo) — una línea más de texto discreto, no un modal.
            */}
            <p className="icon-upload__meta">Se convierte automáticamente en un ícono monocromático</p>
          </>
        )}
        <input
          id="icon-upload-input"
          type="file"
          accept=".png,.webp,image/png,image/webp"
          className="icon-upload__file-input"
          aria-label="Elegir archivo PNG o WebP"
          aria-describedby={state.step === 'error' ? errorId : undefined}
          onChange={handleFileInputChange}
          disabled={state.step === 'processing'}
        />
      </label>

      {state.step === 'error' && (
        <p id={errorId} className="icon-drawer__status icon-drawer__status--error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
