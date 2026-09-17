import { useEffect, useRef, type ChangeEvent } from 'react';
import type { EditorActions } from '../canvas/actions';
import { FONT_OPTIONS } from '../fonts/fontLibrary';
import { MIN_FONT_SIZE, MAX_FONT_SIZE, MAX_TEXT_LENGTH, getCurveOffsetRange } from '../canvas/curvedText';
import type { EditorSelection } from '../state/selection';
import './TextEditorPanel.css';

interface TextEditorPanelProps {
  actions: EditorActions;
  selection: Extract<EditorSelection, { type: 'text' }>;
  /** Cierra el contenedor de edición (no deselecciona el texto ni toca el toolbar). */
  onClose: () => void;
}

const CURVE_OFFSET_RANGE = getCurveOffsetRange();

/**
 * Contenedor de edición de contenido del texto seleccionado — se muestra
 * únicamente cuando el usuario toca "Editar" en el `ContextualToolbar` (ver
 * `EditorContext.isTextEditorOpen`); seleccionar un texto por sí solo ya NO
 * lo abre. Invertir, tamaño y eliminar viven únicamente en el
 * `ContextualToolbar` flotante (no se duplican acá) — este panel es
 * puramente para el contenido, la tipografía y la posición angular.
 * Todo cambio pasa por la capa de acciones — este componente no toca la
 * instancia de Fabric ni el modo de edición nativo de Fabric.js (que queda
 * desactivado de raíz, ver `editable: false` en `curvedText.ts`).
 *
 * El límite de caracteres es un tope fijo (`MAX_TEXT_LENGTH`, ver
 * curvedText.ts) — dentro de ese tope, el tamaño se sigue ajustando solo
 * (auto-fit de Etapa 3): menos caracteres permiten un tamaño mayor, más
 * caracteres lo reducen, y si ni siquiera el tamaño mínimo alcanza,
 * `isOverflowing` avisa sin deformar ni cortar el texto.
 */
export function TextEditorPanel({ actions, selection, onClose }: TextEditorPanelProps) {
  const isAutoFitted = selection.fontSize < selection.desiredFontSize;
  const isAtCharLimit = selection.text.length >= MAX_TEXT_LENGTH;
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Foco automático apenas se abre el contenedor (un click en "Editar" ya
  // expresa la intención de escribir) — se dispara una sola vez por
  // apertura, ya que Sidebar desmonta este componente al cerrarlo.
  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  function handleContentChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    actions.updateSelectedTextContent(event.target.value);
  }

  function handleFontFamilyChange(event: ChangeEvent<HTMLSelectElement>): void {
    void actions.setSelectedTextFontFamily(event.target.value);
  }

  function handleFontSizeChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedTextFontSize(Number(event.target.value));
  }

  function handleCurveOffsetChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedTextCurveOffset(Number(event.target.value));
  }

  return (
    <section className="text-editor-panel">
      <div className="text-editor-panel__header">
        <h2 className="text-editor-panel__title">Editar texto</h2>
        <button type="button" className="text-editor-panel__close" onClick={onClose}>
          Listo
        </button>
      </div>

      <label className="text-editor-panel__field">
        Contenido
        <textarea
          ref={contentRef}
          value={selection.text}
          onChange={handleContentChange}
          rows={2}
          maxLength={MAX_TEXT_LENGTH}
        />
        <span className={`text-editor-panel__char-count${isAtCharLimit ? ' text-editor-panel__char-count--limit' : ''}`}>
          {selection.text.length} / {MAX_TEXT_LENGTH} caracteres
        </span>
      </label>

      <label className="text-editor-panel__field">
        Tipografía
        <select value={selection.fontFamily} onChange={handleFontFamilyChange}>
          {FONT_OPTIONS.map((font) => (
            <option key={font.family} value={font.family} style={{ fontFamily: font.family }}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-editor-panel__field">
        Tamaño ({selection.fontSize}px)
        <input
          type="range"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          value={selection.desiredFontSize}
          onChange={handleFontSizeChange}
        />
      </label>

      {isAutoFitted && !selection.isOverflowing && (
        <p className="text-editor-panel__hint">
          El tamaño se ajustó automáticamente a {selection.fontSize}px para que el texto entre en la virola.
        </p>
      )}

      {selection.isOverflowing && (
        <p className="text-editor-panel__warning">
          Este texto es demasiado largo para la virola incluso en el tamaño mínimo. Acortalo para que se vea bien.
        </p>
      )}

      <label className="text-editor-panel__field">
        Posición alrededor de la virola
        <input
          type="range"
          min={CURVE_OFFSET_RANGE.min}
          max={CURVE_OFFSET_RANGE.max}
          value={selection.curveOffset}
          onChange={handleCurveOffsetChange}
        />
      </label>
      <p className="text-editor-panel__hint">
        También podés arrastrar el texto directamente sobre el lienzo. Para
        invertirlo, agrandarlo/achicarlo o eliminarlo, usá el menú que
        aparece junto al texto al seleccionarlo.
      </p>
    </section>
  );
}
