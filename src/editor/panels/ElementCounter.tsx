import {
  MAX_DESIGN_ELEMENTS,
  MAX_TEXT_ELEMENTS,
  MAX_ICON_ELEMENTS,
  type DesignElementCounts,
} from '../canvas/designLimits';
import './ElementCounter.css';

interface ElementCounterProps {
  counts: DesignElementCounts;
}

function getLimitMessage(counts: DesignElementCounts): string | null {
  if (counts.total >= MAX_DESIGN_ELEMENTS) {
    return 'Llegaste al máximo de elementos. Eliminá uno para poder agregar otro.';
  }
  if (counts.text >= MAX_TEXT_ELEMENTS) {
    return 'Ya usaste el máximo de textos permitidos. Todavía podés agregar íconos.';
  }
  if (counts.icon >= MAX_ICON_ELEMENTS) {
    return 'Ya llegaste al máximo de íconos. Todavía podés agregar texto.';
  }
  return null;
}

/**
 * Feedback simple de "cuántos elementos llevo / cuántos puedo tener",
 * total y por tipo (máximo MAX_TEXT_ELEMENTS textos + MAX_ICON_ELEMENTS
 * íconos, MAX_DESIGN_ELEMENTS en total — ver designLimits.ts, única fuente
 * de verdad de estos números). Deliberadamente básico en esta etapa — el
 * diseño visual definitivo del panel es una etapa posterior.
 */
export function ElementCounter({ counts }: ElementCounterProps) {
  const isAtLimit = counts.total >= MAX_DESIGN_ELEMENTS;
  const message = getLimitMessage(counts);

  return (
    <div className={`element-counter${isAtLimit ? ' element-counter--full' : ''}`}>
      <div className="element-counter__row">
        <span className="element-counter__label">Elementos</span>
        <span className="element-counter__value">
          {counts.total} / {MAX_DESIGN_ELEMENTS}
        </span>
      </div>
      <p className="element-counter__breakdown">
        Texto: {counts.text}/{MAX_TEXT_ELEMENTS} · Íconos: {counts.icon}/{MAX_ICON_ELEMENTS}
      </p>
      {message && <p className="element-counter__message">{isAtLimit ? '⚠ ' : ''}{message}</p>}
    </div>
  );
}
