import type { ChangeEvent } from 'react';
import type { EditorActions } from '../canvas/actions';
import { FONT_OPTIONS } from '../fonts/fontLibrary';
import { MIN_FONT_SIZE, MAX_FONT_SIZE, MAX_TEXT_LENGTH, getCurveOffsetRange } from '../canvas/curvedText';
import { VIROLA_CONFIG } from '../../config/virola.config';
import type { EditorSelection } from '../state/selection';
import './TextEditorPanel.css';

interface TextEditorPanelProps {
  actions: EditorActions;
  selection: Extract<EditorSelection, { type: 'text' }>;
}

const CURVE_OFFSET_RANGE = getCurveOffsetRange(VIROLA_CONFIG);

/**
 * Panel contextual del texto seleccionado: contenido, tipografía, tamaño,
 * inversión de la curva, posición sobre el arco, y eliminar. Todo cambio
 * pasa por la capa de acciones — este componente no toca la instancia de
 * Fabric.
 */
export function TextEditorPanel({ actions, selection }: TextEditorPanelProps) {
  const isAutoFitted = selection.fontSize < selection.desiredFontSize;
  const isAtCharLimit = selection.text.length >= MAX_TEXT_LENGTH;

  function handleContentChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    actions.updateSelectedTextContent(event.target.value);
  }

  function handleFontFamilyChange(event: ChangeEvent<HTMLSelectElement>): void {
    void actions.setSelectedTextFontFamily(event.target.value);
  }

  function handleFontSizeChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedTextFontSize(Number(event.target.value));
  }

  function handleInvertedChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedTextInverted(event.target.checked);
  }

  function handleCurveOffsetChange(event: ChangeEvent<HTMLInputElement>): void {
    actions.setSelectedTextCurveOffset(Number(event.target.value));
  }

  return (
    <section className="text-editor-panel">
      <h2 className="text-editor-panel__title">Texto seleccionado</h2>

      <label className="text-editor-panel__field">
        Contenido
        <textarea
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
            <option key={font.label} value={font.label} style={{ fontFamily: font.label }}>
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

      <label className="text-editor-panel__checkbox">
        <input type="checkbox" checked={selection.inverted} onChange={handleInvertedChange} />
        Invertir texto
      </label>

      <label className="text-editor-panel__field">
        Posición sobre la curva
        <input
          type="range"
          min={CURVE_OFFSET_RANGE.min}
          max={CURVE_OFFSET_RANGE.max}
          value={selection.curveOffset}
          onChange={handleCurveOffsetChange}
        />
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
