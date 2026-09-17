import type { EditorActions } from '../canvas/actions';
import type { CircularLineStyle } from '../canvas/circularLines';
import './CircularLinesPanel.css';

interface CircularLinesPanelProps {
  actions: EditorActions | null;
  style: CircularLineStyle;
}

const OPTIONS: Array<{ value: CircularLineStyle; label: string }> = [
  { value: 'none', label: 'No' },
  { value: 'single', label: 'Simple' },
  { value: 'double', label: 'Doble' },
];

/**
 * Selector de líneas circulares decorativas — "No" / "Simple" / "Doble",
 * mutuamente excluyentes (ver referencias/05-pantalladiseño.png). Siempre
 * visible en la barra lateral, sin importar qué esté seleccionado en el
 * canvas: es una propiedad del DISEÑO entero (como el fondo de la virola),
 * no de un elemento en particular — a diferencia de `TextEditorPanel`/
 * `IconEditorPanel`, que solo se muestran con algo seleccionado.
 *
 * Las líneas en sí (dónde se dibujan, cómo se interrumpen alrededor de cada
 * elemento) se resuelven enteramente en `circularLines.ts` — este
 * componente solo refleja/cambia el estilo elegido, nunca calcula
 * geometría.
 */
export function CircularLinesPanel({ actions, style }: CircularLinesPanelProps) {
  return (
    <section className="circular-lines-panel">
      <h2 className="circular-lines-panel__title">Líneas circulares</h2>
      <div className="circular-lines-panel__row">
        <span className="circular-lines-panel__label">Líneas</span>
        <div className="circular-lines-panel__options">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`circular-lines-panel__option${style === option.value ? ' circular-lines-panel__option--active' : ''}`}
              disabled={!actions}
              onClick={() => actions?.setCircularLineStyle(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
