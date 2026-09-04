import { BRAND_LOGO } from '../../config/brand';
import './TopBar.css';

/**
 * Barra superior simple. Todavía no tiene navegación entre pasos
 * (Plantillas / Diseño / Revisión) — se agrega en una tarea futura.
 */
export function TopBar() {
  return (
    <header className="top-bar">
      <img className="top-bar__logo" src={BRAND_LOGO.logotipo} alt="Mate Shop" />
      <span className="top-bar__title">Personalizador de mates</span>
    </header>
  );
}
