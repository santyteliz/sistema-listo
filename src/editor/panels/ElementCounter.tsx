import { MAX_DESIGN_ELEMENTS } from '../canvas/designLimits';
import './ElementCounter.css';

interface ElementCounterProps {
  count: number;
}

/**
 * Feedback simple de "cuántos elementos llevo / cuántos puedo tener".
 * Deliberadamente básico en esta etapa (ver docs/DECISIONS.md) — el diseño
 * visual definitivo del panel es una etapa posterior. Componente aparte
 * (no una línea suelta en Sidebar) porque va a tener que reaparecer en
 * otros lugares de la UI más adelante.
 */
export function ElementCounter({ count }: ElementCounterProps) {
  const isAtLimit = count >= MAX_DESIGN_ELEMENTS;

  return (
    <div className={`element-counter${isAtLimit ? ' element-counter--full' : ''}`}>
      <span className="element-counter__label">
        Elementos: {count} / {MAX_DESIGN_ELEMENTS}
      </span>
      {isAtLimit && (
        <p className="element-counter__message">
          Llegaste al máximo de elementos. Eliminá uno para poder agregar otro.
        </p>
      )}
    </div>
  );
}
